#!/usr/bin/env node
import "./load-env.js";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { inferPosterClassification } from "./poster-classifier.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPORT_PATH = path.join(REPO_ROOT, "data", "results", "contest-category-corrections.json");
const EXTRACTOR = "contest-category-corrections-v1";
const CONTEST_CODE = "CAT_CONTEST";
const CONTEST_NAME = "\uACF5\uBAA8\uC804";
const DREAM_BOARD_ID = "f324f854-32e3-4ef6-bb62-2173d3be141b";
const DREAM_BOARD_DATES = {
  application_start_at: "2026-08-28",
  application_end_at: "2026-09-06",
};
const TARGET_IDS = [
  DREAM_BOARD_ID,
  "efbbcb55-8cc4-4513-8978-b3148c8e2bbe",
  "25764d5b-953e-490e-ae48-8df7f8e3bed4",
  "c918d6e4-686e-4cbd-8cb4-b0b4cc19d3e9",
  "f5853bd4-7bbd-46a5-a99f-04142408efd8",
  "0951dffd-b8cc-4c8c-bde2-2f8f750e0358",
  "42112e6d-c0f9-4b41-bb2e-fe2d1902ca61",
  "c9cd9e1d-2c64-476e-8ab3-aae3b32de5c9",
];

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
    global: { headers: { "X-Client-Info": "posterlink-contest-category-corrections" } },
  });
}

function dateKey(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);
  return new Date(parsed.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function removeClassificationCategoryIssues(issues) {
  if (!Array.isArray(issues)) return [];
  return issues.filter((issue) => {
    const code = issue?.code;
    return code !== "low-category-confidence" && code !== "ambiguous-category";
  });
}

function mergeFieldVerification(row, inferred) {
  const verification = row.field_verification && typeof row.field_verification === "object"
    ? row.field_verification
    : {};
  const classification = verification.classification && typeof verification.classification === "object"
    ? verification.classification
    : {};
  const category = inferred.categories[0] ?? {
    code: CONTEST_CODE,
    label: CONTEST_NAME,
    confidence: 0.9,
    evidence: "manual contest category correction",
    source: "rule",
  };

  return {
    ...verification,
    classification: {
      ...classification,
      categories: [
        {
          code: CONTEST_CODE,
          label: CONTEST_NAME,
          confidence: category.confidence ?? 0.9,
          evidence: category.evidence ?? "",
          source: EXTRACTOR,
        },
      ],
      categoryCodes: [CONTEST_CODE],
      primaryCategory: CONTEST_CODE,
      updatedBy: EXTRACTOR,
      updatedAt: new Date().toISOString(),
    },
    classificationIssues: removeClassificationCategoryIssues(verification.classificationIssues),
  };
}

function evidenceText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, 500);
}

function buildEvidenceRows(row, inferred) {
  const category = inferred.categories[0] ?? {};
  const rows = [
    {
      poster_id: row.id,
      field_key: "category",
      value_text: CONTEST_CODE,
      value_json: {
        code: CONTEST_CODE,
        name: CONTEST_NAME,
        confidence: category.confidence ?? 0.9,
      },
      confidence: category.confidence ?? 0.9,
      evidence_text: evidenceText(category.evidence || row.title),
      evidence_src: "rule",
      extractor: EXTRACTOR,
    },
  ];

  if (row.id === DREAM_BOARD_ID) {
    rows.push(
      {
        poster_id: row.id,
        field_key: "apply_start",
        value_text: DREAM_BOARD_DATES.application_start_at,
        value_json: { date: DREAM_BOARD_DATES.application_start_at },
        confidence: 0.95,
        evidence_text: "공모기간 2026.8.28 ~ 9.6",
        evidence_src: "body",
        extractor: EXTRACTOR,
      },
      {
        poster_id: row.id,
        field_key: "deadline_date",
        value_text: DREAM_BOARD_DATES.application_end_at,
        value_json: { date: DREAM_BOARD_DATES.application_end_at, deadline_type: "fixed" },
        confidence: 0.95,
        evidence_text: "공모기간 2026.8.28 ~ 9.6",
        evidence_src: "body",
        extractor: EXTRACTOR,
      },
    );
  }

  return rows;
}

async function fetchCategoryId(supabase) {
  const { data, error } = await supabase
    .from("categories")
    .select("id,code,name")
    .eq("code", CONTEST_CODE)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`${CONTEST_CODE} category is missing`);
  return data;
}

async function fetchRows(supabase) {
  const { data, error } = await supabase
    .from("posters")
    .select(
      [
        "id",
        "title",
        "source_org_name",
        "poster_status",
        "source_key",
        "summary_short",
        "summary_long",
        "application_start_at",
        "application_end_at",
        "field_verification",
      ].join(","),
    )
    .in("id", TARGET_IDS);
  if (error) throw error;

  const rows = data ?? [];
  const found = new Set(rows.map((row) => row.id));
  const missing = TARGET_IDS.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Missing target posters: ${missing.join(", ")}`);
  }
  return TARGET_IDS.map((id) => rows.find((row) => row.id === id));
}

async function fetchCategoryCodes(supabase) {
  const { data, error } = await supabase
    .from("poster_categories")
    .select("poster_id,categories(code,name)")
    .in("poster_id", TARGET_IDS);
  if (error) throw error;

  const byPosterId = new Map();
  for (const row of data ?? []) {
    const list = byPosterId.get(row.poster_id) ?? [];
    list.push(row.categories?.code ?? null);
    byPosterId.set(row.poster_id, list.filter(Boolean));
  }
  return byPosterId;
}

function buildPlan(rows, currentCategories) {
  return rows.map((row) => {
    const inferred = inferPosterClassification({
      title: row.title,
      category: (currentCategories.get(row.id) ?? []).join(" "),
      summary_short: row.summary_short,
      content: row.summary_long,
      source_org_name: row.source_org_name,
      source_key: row.source_key,
    });
    const updates = {
      field_verification: mergeFieldVerification(row, inferred),
    };
    const changes = [
      {
        field: "category",
        old: currentCategories.get(row.id) ?? [],
        next: [CONTEST_CODE],
      },
    ];

    if (row.id === DREAM_BOARD_ID) {
      updates.application_start_at = DREAM_BOARD_DATES.application_start_at;
      updates.application_end_at = DREAM_BOARD_DATES.application_end_at;
      changes.push(
        {
          field: "application_start_at",
          old: dateKey(row.application_start_at),
          next: DREAM_BOARD_DATES.application_start_at,
        },
        {
          field: "application_end_at",
          old: dateKey(row.application_end_at),
          next: DREAM_BOARD_DATES.application_end_at,
        },
      );
    }

    return {
      id: row.id,
      title: row.title,
      status: row.poster_status,
      source_key: row.source_key,
      inferred_category_confidence: inferred.categories[0]?.confidence ?? null,
      inferred_category_evidence: inferred.categories[0]?.evidence ?? "",
      changes,
      updates,
      evidenceRows: buildEvidenceRows(row, inferred),
    };
  });
}

async function applyPlan(supabase, categoryId, plan) {
  for (const item of plan) {
    const { error: deleteError } = await supabase
      .from("poster_categories")
      .delete()
      .eq("poster_id", item.id);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase
      .from("poster_categories")
      .insert({ poster_id: item.id, category_id: categoryId });
    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from("posters")
      .update(item.updates)
      .eq("id", item.id);
    if (updateError) throw updateError;
  }

  const evidenceRows = plan.flatMap((item) => item.evidenceRows);
  const { error: evidenceError } = await supabase
    .from("poster_field_evidence")
    .upsert(evidenceRows, { onConflict: "poster_id,field_key,extractor" });
  if (evidenceError) throw evidenceError;

  return {
    category_updates: plan.length,
    poster_updates: plan.length,
    evidence_rows: evidenceRows.length,
  };
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  const supabase = createSupabase();
  const category = await fetchCategoryId(supabase);
  const rows = await fetchRows(supabase);
  const currentCategories = await fetchCategoryCodes(supabase);
  const plan = buildPlan(rows, currentCategories);

  const result = apply
    ? await applyPlan(supabase, category.id, plan)
    : { category_updates: 0, poster_updates: 0, evidence_rows: 0 };

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    approved_scope: "contest category corrections 8 rows and Seoul Dream Board application period 2026-08-28~2026-09-06",
    category,
    result,
    plan: plan.map(({ updates, evidenceRows, ...item }) => ({
      ...item,
      update_fields: Object.keys(updates),
      evidence_field_keys: evidenceRows.map((row) => row.field_key),
    })),
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(`mode=${report.mode}`);
  console.log(`targets=${plan.length}`);
  console.log(`category_updates=${result.category_updates}`);
  console.log(`poster_updates=${result.poster_updates}`);
  console.log(`evidence_rows=${result.evidence_rows}`);
  console.log(`report=${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
