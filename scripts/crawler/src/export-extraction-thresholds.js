#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { FIELD_IMPORTANCE } from "./extraction-eval.js";
import { DEFAULT_EXTRACTION_THRESHOLDS } from "./exposure-tier.js";

const DEFAULT_INPUT = "data/eval/reports/extraction-current.json";
const DEFAULT_OUTPUT = "data/eval/reports/extraction-thresholds-candidate.json";
const MIN_RECOMMENDATION_COVERAGE = Object.freeze({
  critical: 0.5,
  major: 0.3,
  minor: 0.2,
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/export-extraction-thresholds.js [--input=data/eval/reports/extraction-current.json] [--out=data/eval/reports/extraction-thresholds-candidate.json] [--module-out=data/eval/reports/extraction-thresholds-candidate.js] [--min-labeled=120]

Reads a Phase 2 eval:extraction report and exports recommended confidence
thresholds. This command writes local report artifacts only; it does not update
production threshold code.`);
  process.exit(0);
}

function repoPath(value) {
  return path.resolve(REPO_ROOT, value);
}

function relativeRepoPath(value) {
  return path.relative(REPO_ROOT, value).replace(/\\/g, "/");
}

function roundThreshold(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function targetPrecision(importance) {
  return importance === "critical" ? 0.98 : 0.9;
}

function targetCoverage(importance) {
  return MIN_RECOMMENDATION_COVERAGE[importance] ?? 0.2;
}

function metricThreshold(metric) {
  const recommended = metric?.recommended_threshold;
  if (!recommended || recommended.threshold === null || recommended.threshold === undefined) {
    return null;
  }
  return roundThreshold(recommended.threshold);
}

function operationalThreshold(metric, currentDefault) {
  const recommended = metricThreshold(metric);
  if (recommended === null) return null;
  if (currentDefault === null || currentDefault === undefined) return recommended;
  return Math.max(recommended, roundThreshold(currentDefault));
}

function appliedThresholdForStatus({ status, threshold, currentDefault }) {
  if (status !== "ready" && currentDefault !== null && currentDefault !== undefined) {
    return currentDefault;
  }
  return threshold ?? currentDefault;
}

export function buildThresholdPlan(report, { minLabeled = 120 } = {}) {
  const fieldMetrics = report?.field_metrics ?? {};
  const labeledPosters = Number(report?.labeled_posters ?? 0);
  const fields = {};
  let readyFieldCount = 0;
  let labeledFieldCount = 0;

  for (const [fieldKey, importance] of Object.entries(FIELD_IMPORTANCE)) {
    const metric = fieldMetrics[fieldKey] ?? null;
    const currentDefault = DEFAULT_EXTRACTION_THRESHOLDS[fieldKey] ?? null;
    const recommendedThreshold = metricThreshold(metric);
    const threshold = operationalThreshold(metric, currentDefault);
    const labeled = Number(metric?.labeled ?? 0);
    const recommendation = metric?.recommended_threshold ?? null;
    const precision = recommendation?.precision ?? null;
    const coverage = recommendation?.coverage ?? null;
    const minCoverage = targetCoverage(importance);
    const hasEnoughCoverage = typeof coverage === "number" && coverage >= minCoverage;
    const status = labeled === 0
        ? "unlabeled"
        : threshold === null
          ? "missing_recommendation"
          : hasEnoughCoverage
            ? "ready"
            : "low_coverage_recommendation";
    if (labeled > 0) labeledFieldCount += 1;
    if (status === "ready") readyFieldCount += 1;
    fields[fieldKey] = {
      importance,
      status,
      threshold,
      recommended_threshold: recommendedThreshold,
      current_default: currentDefault,
      target_precision: targetPrecision(importance),
      min_coverage: minCoverage,
      labeled,
      precision,
      coverage,
      predictions: recommendation?.predictions ?? 0,
    };
    fields[fieldKey].applied_threshold = appliedThresholdForStatus({
      status,
      threshold,
      currentDefault,
    });
  }

  const allLabeledFieldsReady = labeledFieldCount > 0 && readyFieldCount === labeledFieldCount;
  const enoughLabels = labeledPosters >= minLabeled;
  const productionReady = Boolean(allLabeledFieldsReady && enoughLabels);
  const hasMissingRecommendation = Object.values(fields).some(
    (field) => field.status === "missing_recommendation",
  );
  const hasLowCoverageRecommendation = Object.values(fields).some(
    (field) => field.status === "low_coverage_recommendation",
  );
  const blockedFields = Object.entries(fields)
    .filter(([, field]) => field.labeled > 0 && field.status !== "ready")
    .map(([fieldKey, field]) => ({
      field_key: fieldKey,
      status: field.status,
      recommended_threshold: field.recommended_threshold,
      applied_threshold: field.applied_threshold,
      precision: field.precision,
      coverage: field.coverage,
      min_coverage: field.min_coverage,
      predictions: field.predictions,
    }));

  return {
    generated_at: new Date().toISOString(),
    source_report_generated_at: report?.generated_at ?? null,
    source_set: report?.set ?? null,
    extractor: report?.extractor ?? null,
    min_labeled: minLabeled,
    labeled_posters: labeledPosters,
    labeled_field_count: Number(report?.labeled_field_count ?? 0),
    production_ready: productionReady,
    blocking_reasons: [
      !enoughLabels ? `labeled_posters_below_${minLabeled}` : null,
      hasMissingRecommendation ? "one_or_more_labeled_fields_missing_recommendation" : null,
      hasLowCoverageRecommendation ? "one_or_more_labeled_fields_low_coverage_recommendation" : null,
      labeledFieldCount > 0 && !hasMissingRecommendation && !hasLowCoverageRecommendation && !allLabeledFieldsReady
        ? "one_or_more_labeled_fields_not_ready"
        : null,
    ].filter(Boolean),
    blocked_fields: blockedFields,
    thresholds: Object.fromEntries(
      Object.entries(fields).map(([fieldKey, field]) => [
        fieldKey,
        field.applied_threshold,
      ]),
    ),
    fields,
  };
}

export function renderThresholdModule(plan, { reportPath = "" } = {}) {
  const source = reportPath || plan.source_set || "unknown";
  return `// Generated from ${source}
// production_ready: ${plan.production_ready}
// labeled_posters: ${plan.labeled_posters}/${plan.min_labeled}
// Review this file before copying constants into production threshold code.

export const EXTRACTION_THRESHOLDS_CANDIDATE = Object.freeze(${JSON.stringify(plan.thresholds, null, 2)});

export const EXTRACTION_THRESHOLD_METADATA = Object.freeze(${JSON.stringify({
    generated_at: plan.generated_at,
    source_report_generated_at: plan.source_report_generated_at,
    extractor: plan.extractor,
    production_ready: plan.production_ready,
    blocking_reasons: plan.blocking_reasons,
    blocked_fields: plan.blocked_fields,
  }, null, 2)});
`;
}

async function main() {
  const inputPath = repoPath(args.input || DEFAULT_INPUT);
  const outputPath = repoPath(args.out || args.output || DEFAULT_OUTPUT);
  const moduleOut = args["module-out"] ? repoPath(args["module-out"]) : null;
  const minLabeled = Math.max(1, Number(args["min-labeled"] || 120));
  const report = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const plan = buildThresholdPlan(report, { minLabeled });

  const payload = {
    ...plan,
    input: relativeRepoPath(inputPath),
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  if (moduleOut) {
    await fs.mkdir(path.dirname(moduleOut), { recursive: true });
    await fs.writeFile(moduleOut, renderThresholdModule(plan, {
      reportPath: relativeRepoPath(inputPath),
    }), "utf8");
  }

  console.log(JSON.stringify({
    input: relativeRepoPath(inputPath),
    output: relativeRepoPath(outputPath),
    module_output: moduleOut ? relativeRepoPath(moduleOut) : null,
    production_ready: plan.production_ready,
    labeled_posters: plan.labeled_posters,
    min_labeled: plan.min_labeled,
    blocking_reasons: plan.blocking_reasons,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
