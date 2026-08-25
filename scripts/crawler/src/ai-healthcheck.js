#!/usr/bin/env node
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  DEFAULT_HEALTHCHECK_THRESHOLDS,
  evaluateHealthcheckGates,
} from "./ai-healthcheck-gates.js";
import { isLikelyApplicationLink } from "./source-link-rules.js";

const DEFAULT_OUTPUT = "data/results/ai-healthcheck.json";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRAWLER_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "../../..");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/ai-healthcheck.js [--output=data/results/ai-healthcheck.json] [--days=30] [--min-confidence=0.85] [--enforce]

Runs a read-only AI operations check:
  - KPI measurement
  - field_verification correction dry-run
  - published/review non-poster cleanup dry-run
  - application-form source_key regression check
  - optional unlabeled golden-set score when --golden-set=path is provided

Quality gate options:
  --enforce
  --min-embedding-coverage=99
  --min-field-coverage=45
  --min-image-coverage=20
  --max-review-reject-candidates=0
  --max-public-image-nonposters=0
  --max-image-low-confidence=0
  --max-application-source-keys=0
  --max-field-correction-candidates=0
  --max-public-nonposter-reject-candidates=0`);
  process.exit(0);
}

function commandFor(scriptName, scriptArgs = []) {
  return ["node", [path.join(CRAWLER_ROOT, scriptName), ...scriptArgs]];
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket },
  });
}

function runJson(scriptName, scriptArgs = []) {
  const [command, commandArgs] = commandFor(scriptName, scriptArgs);
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: CRAWLER_ROOT,
      windowsHide: true,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${scriptName} exited ${code}\n${stderr || stdout}`));
        return;
      }

      const match = stdout.match(/\{[\s\S]*\}\s*$/);
      if (!match) {
        reject(new Error(`${scriptName} did not print JSON\n${stdout}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(match[0]));
    });
  });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(REPO_ROOT, filePath), "utf-8"));
}

function percent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function isPublicExposureTier(value) {
  return value === null || value === undefined || value === "A" || value === "B";
}

function numericArg(name, fallback) {
  if (!(name in args)) return fallback;
  const value = Number(args[name]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative number`);
  }
  return value;
}

function enabledArg(name) {
  return /^(?:1|true|yes)$/i.test(String(args[name] ?? ""));
}

async function measureImageAiCoverage() {
  const supabase = createSupabase();
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,poster_status,thumbnail_url,field_verification,exposure_tier")
      .in("poster_status", ["published", "review"])
      .not("thumbnail_url", "is", null)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  const getImageClassification = (row) => (
    row.field_verification?.posterImageOcr?.imageClassification
    ?? row.field_verification?.attachmentPosterRepair?.imageClassification
    ?? null
  );
  const checkedRows = rows.filter((row) => getImageClassification(row));
  const nonposterRows = checkedRows.filter((row) => getImageClassification(row).isPoster === false);
  const publicNonposterRows = nonposterRows.filter((row) => isPublicExposureTier(row.exposure_tier));
  const lowConfidenceRows = checkedRows.filter((row) => {
    const confidence = Number(getImageClassification(row).confidence ?? 0);
    return Number.isFinite(confidence) && confidence < 0.55;
  });

  return {
    image_rows: rows.length,
    checked_rows: checkedRows.length,
    coverage_percent: percent(checkedRows.length, rows.length),
    nonposter_image_count: nonposterRows.length,
    public_nonposter_image_count: publicNonposterRows.length,
    low_confidence_count: lowConfidenceRows.length,
    nonposter_sample: nonposterRows.slice(0, 10).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.poster_status,
      reason: getImageClassification(row).reason ?? "",
    })),
  };
}

async function measureSourceLinkQuality() {
  const supabase = createSupabase();
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,poster_status,source_key")
      .in("poster_status", ["published", "review"])
      .not("source_key", "is", null)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  const applicationSources = rows.filter((row) =>
    isLikelyApplicationLink(row.source_key),
  );
  return {
    checked_rows: rows.length,
    application_source_key_count: applicationSources.length,
    application_source_sample: applicationSources.slice(0, 10).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.poster_status,
      source_key: row.source_key,
    })),
  };
}

async function main() {
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const days = Math.max(1, Number(args.days || 30));
  const minConfidence = Math.max(0, Math.min(1, Number(args["min-confidence"] || 0.85)));
  const enforce = enabledArg("enforce");
  const thresholds = {
    min_embedding_coverage_percent: numericArg(
      "min-embedding-coverage",
      DEFAULT_HEALTHCHECK_THRESHOLDS.min_embedding_coverage_percent,
    ),
    min_field_verification_coverage_percent: numericArg(
      "min-field-coverage",
      DEFAULT_HEALTHCHECK_THRESHOLDS.min_field_verification_coverage_percent,
    ),
    min_image_ai_coverage_percent: numericArg(
      "min-image-coverage",
      DEFAULT_HEALTHCHECK_THRESHOLDS.min_image_ai_coverage_percent,
    ),
    max_review_queue_reject_candidates: numericArg(
      "max-review-reject-candidates",
      DEFAULT_HEALTHCHECK_THRESHOLDS.max_review_queue_reject_candidates,
    ),
    max_image_ai_public_nonposter_count: numericArg(
      "max-public-image-nonposters",
      DEFAULT_HEALTHCHECK_THRESHOLDS.max_image_ai_public_nonposter_count,
    ),
    max_image_ai_low_confidence_count: numericArg(
      "max-image-low-confidence",
      DEFAULT_HEALTHCHECK_THRESHOLDS.max_image_ai_low_confidence_count,
    ),
    max_application_source_key_count: numericArg(
      "max-application-source-keys",
      DEFAULT_HEALTHCHECK_THRESHOLDS.max_application_source_key_count,
    ),
    max_field_correction_candidates: numericArg(
      "max-field-correction-candidates",
      DEFAULT_HEALTHCHECK_THRESHOLDS.max_field_correction_candidates,
    ),
    max_public_nonposter_reject_candidates: numericArg(
      "max-public-nonposter-reject-candidates",
      DEFAULT_HEALTHCHECK_THRESHOLDS.max_public_nonposter_reject_candidates,
    ),
  };
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const kpiOutput = `data/results/ai-healthcheck-kpi-${timestamp}.json`;
  const correctionsOutput = `data/results/ai-healthcheck-corrections-${timestamp}.json`;
  const cleanupOutput = `data/results/ai-healthcheck-nonposters-${timestamp}.json`;

  const kpi = await runJson("src/measure-ai-kpis.js", [
    `--days=${days}`,
    `--output=${kpiOutput}`,
  ]);
  const imageAi = await measureImageAiCoverage();
  const sourceLinks = await measureSourceLinkQuality();
  const corrections = await runJson("src/apply-field-verification-corrections.js", [
    "--limit=1000",
    `--min-confidence=${minConfidence}`,
    `--output=${correctionsOutput}`,
  ]);
  const nonposters = await runJson("src/cleanup-review-nonposters.js", [
    "--statuses=review,published",
    `--output=${cleanupOutput}`,
  ]);

  let goldenSet = null;
  if (args["golden-set"]) {
    const goldenOutput = `data/results/ai-healthcheck-golden-${timestamp}.json`;
    goldenSet = await runJson("src/score-baseline-goldenset.js", [
      `--input=${args["golden-set"]}`,
      `--output=${goldenOutput}`,
    ]);
  }

  const kpiReport = await readJson(kpiOutput);
  const correctionsReport = await readJson(correctionsOutput);
  const nonpostersReport = await readJson(cleanupOutput);

  const summary = {
    embedding_coverage_percent: kpi.embedding_coverage_percent,
    field_verification_coverage_percent: kpi.field_verification_coverage_percent,
    review_queue_count: kpi.review_queue_count,
    review_queue_reject_candidates: kpi.review_queue_reject_candidates,
    image_ai_coverage_percent: imageAi.coverage_percent,
    image_ai_nonposter_count: imageAi.nonposter_image_count,
    image_ai_public_nonposter_count: imageAi.public_nonposter_image_count,
    image_ai_low_confidence_count: imageAi.low_confidence_count,
    application_source_key_count: sourceLinks.application_source_key_count,
    field_correction_candidates: corrections.correction_count,
    nonposter_reject_candidates: nonposters.reject_count,
    public_nonposter_reject_candidates: (nonpostersReport.rows ?? [])
      .filter((row) => isPublicExposureTier(row.exposure_tier))
      .length,
    golden_set_labeled_rows: goldenSet?.labeled_rows ?? null,
    golden_set_macro_accuracy: goldenSet?.macro_accuracy_label ?? null,
  };
  const qualityGate = evaluateHealthcheckGates(summary, thresholds);
  summary.quality_gate_status = qualityGate.passed ? "pass" : "fail";

  const report = {
    generated_at: new Date().toISOString(),
    days,
    min_confidence: minConfidence,
    enforce,
    summary,
    quality_gate: qualityGate,
    outputs: {
      kpi: kpiOutput,
      field_corrections: correctionsOutput,
      nonposters: cleanupOutput,
      golden_set: goldenSet ? goldenSet.output : null,
    },
    details: {
      kpi: kpiReport.summary ?? kpiReport,
      image_ai: imageAi,
      source_links: sourceLinks,
      field_correction_sample: correctionsReport.rows?.slice(0, 10) ?? [],
      nonposter_sample: nonpostersReport.rows?.slice(0, 10) ?? [],
      golden_set: goldenSet,
    },
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify({
    output,
    ...report.summary,
    quality_gate_violations: qualityGate.violations,
  }, null, 2));

  if (enforce && !qualityGate.passed) {
    console.error(
      `[ai:healthcheck] quality gate failed with ${qualityGate.violations.length} violation(s)`,
    );
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
