#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { CATEGORY_CODE_BY_LABEL, classifyPosterCategoryBatch } from "./poster-category-classifier.js";

const EXTRACTOR = "semantic-category-reclassification-v2";
const DEFAULT_STATUSES = ["published", "closed", "review"];
const DEFAULT_LIMIT = 5000;
const PAGE_SIZE = 500;
const ID_FILTER_PAGE_SIZE = 100;
const CLASSIFY_BATCH_SIZE = 40;
const DEFAULT_OUTPUT = "data/results/poster-category-reclassification.json";
const CONFIRM_TOKEN = "RECLASSIFY_ALL_CATEGORIES";

function parseArgs() {
  return Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "1"];
    }),
  );
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "posterlink-semantic-category-reclassification" } },
  });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeCodes(labels) {
  return unique((labels ?? []).map((label) => CATEGORY_CODE_BY_LABEL[label]).filter(Boolean)).slice(0, 1);
}

function sameCodes(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((code, index) => code === b[index]);
}

function categoryEntries(codes, categoryByCode, classification) {
  return codes.map((code) => ({
    code,
    label: categoryByCode.get(code)?.name ?? code,
    confidence: classification.confidence,
    evidence: classification.reason,
    source: EXTRACTOR,
    model: classification.model,
  }));
}

function mergeFieldVerification(row, codes, categoryByCode, classification) {
  const verification = asObject(row.field_verification);
  const existingClassification = asObject(verification.classification);
  const issues = Array.isArray(verification.classificationIssues)
    ? verification.classificationIssues.filter((issue) => {
        const code = String(issue?.code ?? "");
        return code !== "low-category-confidence" && code !== "ambiguous-category";
      })
    : [];

  return {
    ...verification,
    confidence: Math.max(Number(verification.confidence ?? 0), classification.confidence),
    classification: {
      ...existingClassification,
      categories: categoryEntries(codes, categoryByCode, classification),
      categoryCodes: codes,
      primaryCategory: codes[0] ?? null,
      confidence: classification.confidence,
      reason: classification.reason,
      model: classification.model,
      updatedBy: EXTRACTOR,
      updatedAt: new Date().toISOString(),
    },
    classificationIssues: classification.confidence >= 0.7
      ? issues
      : [
          ...issues,
          {
            code: "low-category-confidence",
            field: "category",
            severity: "medium",
            reason: "semantic category reclassification confidence below threshold",
            evidence: classification.reason,
          },
        ],
  };
}

function buildEvidenceRow(row, codes, categoryByCode, classification) {
  return {
    poster_id: row.id,
    field_key: "category",
    value_text: codes.join(","),
    value_json: {
      labels: classification.categories,
      categoryCodes: codes,
      categories: categoryEntries(codes, categoryByCode, classification),
    },
    confidence: classification.confidence,
    evidence_text: classification.reason,
    evidence_src: "rule",
    extractor: EXTRACTOR,
  };
}

async function fetchRows(supabase, { statuses, limit }) {
  const rows = [];
  while (rows.length < limit) {
    const from = rows.length;
    const to = Math.min(from + PAGE_SIZE, limit) - 1;
    let query = supabase
      .from("posters")
      .select("id,title,source_org_name,poster_status,source_key,summary_short,summary_long,field_verification")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (statuses.length > 0) query = query.in("poster_status", statuses);

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchRowsByIds(supabase, posterIds) {
  const rows = [];
  for (let index = 0; index < posterIds.length; index += ID_FILTER_PAGE_SIZE) {
    const ids = posterIds.slice(index, index + ID_FILTER_PAGE_SIZE);
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,source_org_name,poster_status,source_key,summary_short,summary_long,field_verification")
      .in("id", ids);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  return posterIds.map((id) => byId.get(id)).filter(Boolean);
}

async function fetchCategories(supabase) {
  const neededCodes = Object.values(CATEGORY_CODE_BY_LABEL);
  const { data, error } = await supabase
    .from("categories")
    .select("id,code,name")
    .in("code", neededCodes);
  if (error) throw error;

  const categoryByCode = new Map((data ?? []).map((category) => [category.code, category]));
  const missing = neededCodes.filter((code) => !categoryByCode.has(code));
  if (missing.length > 0) throw new Error(`Missing categories: ${missing.join(", ")}`);
  return categoryByCode;
}

async function fetchCurrentCategories(supabase, posterIds) {
  if (posterIds.length === 0) return new Map();
  const byPoster = new Map();

  for (let index = 0; index < posterIds.length; index += ID_FILTER_PAGE_SIZE) {
    const ids = posterIds.slice(index, index + ID_FILTER_PAGE_SIZE);
    const { data, error } = await supabase
      .from("poster_categories")
      .select("poster_id,categories(code,name)")
      .in("poster_id", ids);
    if (error) throw error;

    for (const row of data ?? []) {
      const list = byPoster.get(row.poster_id) ?? [];
      if (row.categories?.code) {
        list.push({ code: row.categories.code, name: row.categories.name });
      }
      byPoster.set(row.poster_id, list);
    }
  }
  return byPoster;
}

async function buildPlan(rows, currentCategories, categoryByCode, minConfidence) {
  const plan = [];
  for (let index = 0; index < rows.length; index += CLASSIFY_BATCH_SIZE) {
    const batch = rows.slice(index, index + CLASSIFY_BATCH_SIZE);
    console.error(`[category-reclassification] classifying ${index + 1}-${index + batch.length}/${rows.length}`);
    const classifications = await classifyPosterCategoryBatch(batch.map((row) => {
      const current = currentCategories.get(row.id) ?? [];
      return {
      title: row.title,
      sourceOrgName: row.source_org_name,
      summaryShort: row.summary_short,
      summaryLong: row.summary_long,
      currentCategories: current.map((category) => category.name ?? category.code),
      };
    }));

    for (const [batchIndex, row] of batch.entries()) {
    const current = currentCategories.get(row.id) ?? [];
    const classification = classifications[batchIndex];
    const codes = normalizeCodes(classification.categories);
    const skippedReason = codes.length === 0
      ? "no_valid_category"
      : classification.confidence < minConfidence
        ? "low_confidence"
        : null;
    const currentCodes = current.map((category) => category.code);

    plan.push({
      id: row.id,
      title: row.title,
      status: row.poster_status,
      source_key: row.source_key,
      current_codes: currentCodes,
      next_labels: classification.categories,
      next_codes: codes,
      changed: !sameCodes(currentCodes, codes),
      confidence: classification.confidence,
      model: classification.model,
      reason: classification.reason,
      skipped_reason: skippedReason,
      updates: skippedReason
        ? null
        : {
            field_verification: mergeFieldVerification(row, codes, categoryByCode, classification),
          },
      evidence_row: skippedReason ? null : buildEvidenceRow(row, codes, categoryByCode, classification),
    });
    }
  }
  return plan;
}

async function buildPlanFromReport(supabase, reportPath, categoryByCode) {
  const report = JSON.parse(await fs.readFile(reportPath, "utf-8"));
  const sourceItems = (report.items ?? []).filter((item) => !item.skipped_reason && item.next_labels?.length);
  const rows = await fetchRowsByIds(supabase, sourceItems.map((item) => item.id));
  const rowById = new Map(rows.map((row) => [row.id, row]));

  return sourceItems.map((item) => {
    const row = rowById.get(item.id);
    if (!row) {
      return { ...item, skipped_reason: "missing_poster", updates: null, evidence_row: null };
    }
    const classification = {
      categories: item.next_labels,
      reason: item.reason,
      confidence: item.confidence,
      model: item.model,
    };
    const nextCodes = normalizeCodes(item.next_labels);
    return {
      ...item,
      current_codes: item.current_codes ?? [],
      next_codes: nextCodes,
      changed: !sameCodes(item.current_codes ?? [], nextCodes),
      status: row.poster_status,
      updates: {
        field_verification: mergeFieldVerification(row, nextCodes, categoryByCode, classification),
      },
      evidence_row: buildEvidenceRow(row, nextCodes, categoryByCode, classification),
    };
  });
}

async function applyPlan(supabase, plan, categoryByCode) {
  const applicable = plan.filter((item) => !item.skipped_reason);
  for (const item of applicable) {
    const { error: deleteError } = await supabase
      .from("poster_categories")
      .delete()
      .eq("poster_id", item.id);
    if (deleteError) throw deleteError;

    const categoryRows = item.next_codes.map((code) => ({
      poster_id: item.id,
      category_id: categoryByCode.get(code).id,
    }));
    const { error: insertError } = await supabase
      .from("poster_categories")
      .insert(categoryRows);
    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from("posters")
      .update(item.updates)
      .eq("id", item.id);
    if (updateError) throw updateError;
  }

  const evidenceRows = applicable.map((item) => item.evidence_row);
  for (let index = 0; index < evidenceRows.length; index += 200) {
    const chunk = evidenceRows.slice(index, index + 200);
    const { error: evidenceError } = await supabase
      .from("poster_field_evidence")
      .upsert(chunk, { onConflict: "poster_id,field_key,extractor" });
    if (evidenceError) throw evidenceError;
  }

  if (applicable.length > 0) {
    const { error: actionError } = await supabase.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "update",
      action_reason: "semantic_category_reclassification",
      metadata_json: {
        extractor: EXTRACTOR,
        affected_count: applicable.length,
        changed_count: applicable.filter((item) => item.changed).length,
      },
    });
    if (actionError) throw actionError;
  }

  return {
    category_replacements: applicable.length,
    changed_posters: applicable.filter((item) => item.changed).length,
    evidence_rows: evidenceRows.length,
  };
}

async function writeReport(output, report) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  if (apply && args.confirm !== CONFIRM_TOKEN) {
    throw new Error(`Mass category apply requires --confirm=${CONFIRM_TOKEN}`);
  }

  const statuses = args.statuses
    ? String(args.statuses).split(",").map((status) => status.trim()).filter(Boolean)
    : DEFAULT_STATUSES;
  const limit = Math.max(1, Number(args.limit ?? DEFAULT_LIMIT));
  const minConfidence = Math.max(0, Math.min(1, Number(args["min-confidence"] ?? 0.7)));
  const output = args.output ?? DEFAULT_OUTPUT;
  const input = args.input;

  const supabase = createSupabase();
  const categoryByCode = await fetchCategories(supabase);
  const rows = input ? [] : await fetchRows(supabase, { statuses, limit });
  const currentCategories = input ? new Map() : await fetchCurrentCategories(supabase, rows.map((row) => row.id));
  const plan = input
    ? await buildPlanFromReport(supabase, input, categoryByCode)
    : await buildPlan(rows, currentCategories, categoryByCode, minConfidence);
  const result = apply ? await applyPlan(supabase, plan, categoryByCode) : {
    category_replacements: 0,
    changed_posters: 0,
    evidence_rows: 0,
  };

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    extractor: EXTRACTOR,
    statuses,
    limit,
    min_confidence: minConfidence,
    checked: plan.length,
    applicable: plan.filter((item) => !item.skipped_reason).length,
    changed: plan.filter((item) => !item.skipped_reason && item.changed).length,
    unchanged: plan.filter((item) => !item.skipped_reason && !item.changed).length,
    skipped: plan.filter((item) => item.skipped_reason).length,
    skipped_reasons: plan.reduce((acc, item) => {
      if (item.skipped_reason) acc[item.skipped_reason] = (acc[item.skipped_reason] ?? 0) + 1;
      return acc;
    }, {}),
    result,
    items: plan.map(({ updates, evidence_row, ...item }) => item),
  };
  await writeReport(output, report);
  console.log(JSON.stringify({ ...report, output, items: undefined }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
