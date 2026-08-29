#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPORT_PATH = path.join(REPO_ROOT, "data", "results", "review-safe-release-corrections.json");
const EXTRACTOR = "review-safe-release-corrections-v1";
const CONTEST_CODE = "CAT_CONTEST";

const TARGETS = [
  {
    id: "7e1fff7d-e3e1-4522-8880-fc6a163afcb1",
    note: "Youth Seoul current-year notice; OCR/body has 08.17~09.11 without year, so 2023 was a parser error.",
    posterPatch: {
      application_start_at: "2026-08-17",
      application_end_at: "2026-09-11",
      deadline_type: "fixed",
      data_confidence: 0.95,
    },
    evidence: [
      {
        field_key: "deadline_date",
        value_text: "2026-09-11",
        value_json: { date: "2026-09-11", start: "2026-08-17", previous_parser_year_error: true },
        confidence: 0.95,
        evidence_text: "Application period is 08.17~09.11 on a current 2026 Youth Seoul posting; stored 2023 date is a year inference error.",
        evidence_src: "body",
      },
      {
        field_key: "deadline_type",
        value_text: "fixed",
        value_json: { type: "fixed" },
        confidence: 0.95,
        evidence_text: "The notice has a bounded application period ending 2026-09-11.",
        evidence_src: "body",
      },
    ],
  },
  {
    id: "05b56903-f692-4c4c-836c-7ff20e0cb8ce",
    note: "Open campaign recruitment via application form; application deadline is explicit.",
    posterPatch: { data_confidence: 0.9 },
    evidence: [
      {
        field_key: "content_type",
        value_text: "recruit",
        value_json: { type: "recruit", route: "opportunity" },
        confidence: 0.9,
        evidence_text: "The notice asks people to apply for the Cheonggye Plaza plogging campaign by 2026-09-10.",
        evidence_src: "body",
      },
    ],
  },
  {
    id: "6ff10d01-67cf-4c52-ae7f-ff304b95fbc2",
    note: "Short-form contest has a clear contest/application period; unknown deadline_type was blocking exposure.",
    posterPatch: {
      application_start_at: "2026-07-13",
      application_end_at: "2026-09-13",
      deadline_type: "fixed",
      data_confidence: 0.95,
    },
    categoryCode: CONTEST_CODE,
    evidence: [
      {
        field_key: "deadline_date",
        value_text: "2026-09-13",
        value_json: { date: "2026-09-13", start: "2026-07-13" },
        confidence: 0.95,
        evidence_text: "Contest/application period is 2026-07-13 to 2026-09-13.",
        evidence_src: "body",
      },
      {
        field_key: "deadline_type",
        value_text: "fixed",
        value_json: { type: "fixed" },
        confidence: 0.95,
        evidence_text: "The contest has a fixed submission deadline of 2026-09-13.",
        evidence_src: "body",
      },
      {
        field_key: "content_type",
        value_text: "recruit",
        value_json: { type: "recruit", route: "opportunity" },
        confidence: 0.9,
        evidence_text: "The post recruits submissions for the Seocho short-form contest.",
        evidence_src: "body",
      },
      {
        field_key: "category",
        value_text: CONTEST_CODE,
        value_json: { code: CONTEST_CODE, name: "contest" },
        confidence: 0.95,
        evidence_text: "The title and body describe a short-form contest.",
        evidence_src: "body",
      },
    ],
  },
  {
    id: "d99ffef8-79a0-480b-837d-3d4f9faf5a94",
    note: "Participant band recruitment has an explicit recruitment period.",
    posterPatch: { data_confidence: 0.9 },
    evidence: [
      {
        field_key: "content_type",
        value_text: "recruit",
        value_json: { type: "recruit", route: "opportunity" },
        confidence: 0.95,
        evidence_text: "The notice recruits youth bands for TURN IT UP during 2026-09-08~2026-11-08.",
        evidence_src: "body",
      },
    ],
  },
  {
    id: "f324f854-32e3-4ef6-bb62-2173d3be141b",
    note: "User-confirmed contest; dates and category are already correct, only content_type confidence blocked auto-publish.",
    posterPatch: { data_confidence: 0.95 },
    evidence: [
      {
        field_key: "content_type",
        value_text: "recruit",
        value_json: { type: "recruit", route: "opportunity" },
        confidence: 0.95,
        evidence_text: "The Seoul Dream Board notice is a public call for contest submissions during 2026-08-28~2026-09-06.",
        evidence_src: "operator",
      },
    ],
  },
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
    global: { headers: { "X-Client-Info": "posterlink-review-safe-release-corrections" } },
  });
}

function dateKey(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? text.slice(0, 10)
    : new Date(parsed.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeVerification(row, target) {
  const verification = asObject(row.field_verification);
  const nextConfidence = Math.max(
    Number.isFinite(Number(verification.confidence)) ? Number(verification.confidence) : 0,
    Number(target.posterPatch.data_confidence ?? 0.9),
  );
  const next = {
    ...verification,
    confidence: nextConfidence,
    decision: "pass",
    reason: target.note,
    reviewedBy: EXTRACTOR,
    reviewedAt: new Date().toISOString(),
  };

  if (target.posterPatch.application_end_at) {
    next.deadlineMatches = true;
    next.correctedDeadline = null;
    next.dateIssues = [];
    next.dateQuality = {
      ...asObject(verification.dateQuality),
      decision: "pass",
      storedDeadline: target.posterPatch.application_end_at,
      extractedDeadline: target.posterPatch.application_end_at,
      normalizedDeadline: target.posterPatch.application_end_at,
      suggestedDeadline: target.posterPatch.application_end_at,
      issues: [],
      updatedBy: EXTRACTOR,
      updatedAt: new Date().toISOString(),
    };
  }

  return next;
}

async function fetchPosters(supabase) {
  const ids = TARGETS.map((target) => target.id);
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,poster_status,application_start_at,application_end_at,deadline_type,data_confidence,field_verification")
    .in("id", ids);
  if (error) throw error;
  const rowsById = new Map((data ?? []).map((row) => [row.id, row]));
  const missing = ids.filter((id) => !rowsById.has(id));
  if (missing.length > 0) throw new Error(`Missing target posters: ${missing.join(", ")}`);
  return ids.map((id) => rowsById.get(id));
}

async function fetchContestCategory(supabase) {
  const { data, error } = await supabase
    .from("categories")
    .select("id,code,name")
    .eq("code", CONTEST_CODE)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`${CONTEST_CODE} category is missing`);
  return data;
}

function buildPlan(rows) {
  return rows.map((row) => {
    const target = TARGETS.find((item) => item.id === row.id);
    const patch = {
      ...target.posterPatch,
      data_confidence: Math.max(Number(row.data_confidence ?? 0), Number(target.posterPatch.data_confidence ?? 0)),
      field_verification: mergeVerification(row, target),
    };
    return {
      id: row.id,
      title: row.title,
      status: row.poster_status,
      note: target.note,
      categoryCode: target.categoryCode ?? null,
      current: {
        application_start_at: dateKey(row.application_start_at),
        application_end_at: dateKey(row.application_end_at),
        deadline_type: row.deadline_type,
        data_confidence: row.data_confidence,
      },
      patch: {
        ...patch,
        field_verification: "[merged]",
      },
      rawPatch: patch,
      evidenceRows: target.evidence.map((evidence) => ({
        poster_id: row.id,
        field_key: evidence.field_key,
        value_text: evidence.value_text,
        value_json: evidence.value_json,
        confidence: evidence.confidence,
        evidence_text: evidence.evidence_text,
        evidence_src: evidence.evidence_src,
        extractor: EXTRACTOR,
      })),
    };
  });
}

async function applyPlan(supabase, contestCategory, plan) {
  let posterUpdates = 0;
  let categoryUpdates = 0;

  for (const item of plan) {
    const { error } = await supabase
      .from("posters")
      .update(item.rawPatch)
      .eq("id", item.id)
      .eq("poster_status", "review");
    if (error) throw error;
    posterUpdates += 1;

    if (item.categoryCode === CONTEST_CODE) {
      const { error: deleteError } = await supabase
        .from("poster_categories")
        .delete()
        .eq("poster_id", item.id);
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from("poster_categories")
        .insert({ poster_id: item.id, category_id: contestCategory.id });
      if (insertError) throw insertError;
      categoryUpdates += 1;
    }
  }

  const evidenceRows = plan.flatMap((item) => item.evidenceRows);
  const { error: evidenceError } = await supabase
    .from("poster_field_evidence")
    .upsert(evidenceRows, { onConflict: "poster_id,field_key,extractor" });
  if (evidenceError) throw evidenceError;

  return {
    poster_updates: posterUpdates,
    category_updates: categoryUpdates,
    evidence_rows: evidenceRows.length,
  };
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  const supabase = createSupabase();
  const [rows, contestCategory] = await Promise.all([
    fetchPosters(supabase),
    fetchContestCategory(supabase),
  ]);
  const plan = buildPlan(rows);
  const result = apply
    ? await applyPlan(supabase, contestCategory, plan)
    : { poster_updates: 0, category_updates: 0, evidence_rows: 0 };

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    approved_scope: "safe review release corrections: deadline/date-type/content-type/category evidence for 5 review posters",
    result,
    plan: plan.map(({ rawPatch, evidenceRows, ...item }) => ({
      ...item,
      evidence_field_keys: evidenceRows.map((row) => row.field_key),
    })),
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log(`mode=${report.mode}`);
  console.log(`targets=${plan.length}`);
  console.log(`poster_updates=${result.poster_updates}`);
  console.log(`category_updates=${result.category_updates}`);
  console.log(`evidence_rows=${result.evidence_rows}`);
  console.log(`report=${REPORT_PATH}`);
  for (const item of report.plan) {
    console.log(`- [${item.status}] ${item.title}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
