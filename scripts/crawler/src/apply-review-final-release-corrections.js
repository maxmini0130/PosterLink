#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPORT_PATH = path.join(REPO_ROOT, "data", "results", "review-final-release-corrections.json");
const EXTRACTOR = "review-final-release-corrections-v1";

const TARGETS = [
  {
    id: "cbca3024-96a8-41ac-8601-186440a82f61",
    note: "The notice is an actionable BM job-class application. Kakao channel contact is acceptable as the official contact method.",
    posterPatch: { data_confidence: 0.9 },
    evidence: [
      {
        field_key: "contact",
        value_text: "Kakao channel: 용산일자리카페",
        value_json: { value: "Kakao channel: 용산일자리카페", channel: "용산일자리카페" },
        confidence: 0.9,
        evidence_text: "The notice lists Kakao channel '용산일자리카페' as the inquiry/contact route for the BM job-class program.",
        evidence_src: "body",
      },
      {
        field_key: "content_type",
        value_text: "recruit",
        value_json: { type: "recruit", route: "opportunity" },
        confidence: 0.9,
        evidence_text: "The notice recruits participants for a BM job-world class with an application deadline of 2026-09-07.",
        evidence_src: "body",
      },
    ],
  },
  {
    id: "ade8dc5d-b884-4816-b30e-f44f625d1b7c",
    note: "The suspected duplicate is a different Gwangjin one-person-household program candidate, not this home-repair education poster.",
    posterPatch: {
      application_start_at: "2026-08-27",
      application_end_at: "2026-09-03",
      event_start_at: "2026-09-08",
      event_end_at: "2026-09-29",
      deadline_type: "fixed",
      data_confidence: 0.9,
    },
    clearDuplicateIssues: true,
    evidence: [
      {
        field_key: "deadline_date",
        value_text: "2026-09-03",
        value_json: { date: "2026-09-03", start: "2026-08-27" },
        confidence: 0.95,
        evidence_text: "Application period is 2026-08-27 18:00 to 2026-09-03 23:59; class period is 2026-09-08 to 2026-09-29.",
        evidence_src: "body",
      },
      {
        field_key: "deadline_type",
        value_text: "fixed",
        value_json: { type: "fixed" },
        confidence: 0.95,
        evidence_text: "The application period has a fixed end date, 2026-09-03.",
        evidence_src: "body",
      },
      {
        field_key: "content_type",
        value_text: "recruit",
        value_json: { type: "recruit", route: "opportunity" },
        confidence: 0.9,
        evidence_text: "The notice recruits 20 one-person-household participants for a home-repair education program.",
        evidence_src: "body",
      },
    ],
  },
  {
    id: "0c90ab16-750e-40b1-b2dc-dfe78eaa7d16",
    note: "This is an open youth policy pop-up event with a fixed event date; it is still an actionable public opportunity.",
    posterPatch: {
      event_start_at: "2026-09-06",
      event_end_at: "2026-09-06",
      data_confidence: 0.9,
    },
    evidence: [
      {
        field_key: "content_type",
        value_text: "recruit",
        value_json: { type: "recruit", route: "opportunity" },
        confidence: 0.9,
        evidence_text: "The notice invites youth to attend the Yongsan youth policy pop-up store on 2026-09-06.",
        evidence_src: "body",
      },
    ],
  },
  {
    id: "5f43b3d6-d921-4442-aa80-f598aeb6d706",
    note: "Youth Seoul current-year notice; stored 2023-09-11 is a missing-year parser error. The class runs on 2026-09-15.",
    posterPatch: {
      application_end_at: "2026-09-11",
      event_start_at: "2026-09-15",
      event_end_at: "2026-09-15",
      deadline_type: "fixed",
      data_confidence: 0.95,
    },
    evidence: [
      {
        field_key: "deadline_date",
        value_text: "2026-09-11",
        value_json: { date: "2026-09-11", eventDate: "2026-09-15", previous_parser_year_error: true },
        confidence: 0.95,
        evidence_text: "The current 2026 Youth Seoul participant recruitment has an application close around 09-11 and a class date of 2026-09-15.",
        evidence_src: "body",
      },
      {
        field_key: "deadline_type",
        value_text: "fixed",
        value_json: { type: "fixed" },
        confidence: 0.95,
        evidence_text: "The stored 2023 date is a parser year error; the active current-year deadline is 2026-09-11.",
        evidence_src: "body",
      },
      {
        field_key: "content_type",
        value_text: "recruit",
        value_json: { type: "recruit", route: "opportunity" },
        confidence: 0.9,
        evidence_text: "The notice recruits participants for a prompt basics and postcard-making class.",
        evidence_src: "body",
      },
    ],
  },
  {
    id: "2aaf36e0-8060-4094-ac72-85d185168baa",
    note: "The youth-week notice is an open public youth event series with a bounded schedule.",
    posterPatch: {
      event_start_at: "2026-09-15",
      event_end_at: "2026-09-19",
      data_confidence: 0.9,
    },
    evidence: [
      {
        field_key: "content_type",
        value_text: "recruit",
        value_json: { type: "recruit", route: "opportunity" },
        confidence: 0.9,
        evidence_text: "The notice announces an open Seongdong Youth Week event series from 2026-09-15 to 2026-09-19.",
        evidence_src: "body",
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
    global: { headers: { "X-Client-Info": "posterlink-review-final-release-corrections" } },
  });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function mergeVerification(row, target) {
  const verification = asObject(row.field_verification);
  const next = {
    ...verification,
    confidence: Math.max(Number(verification.confidence ?? 0), Number(target.posterPatch.data_confidence ?? 0.9)),
    decision: "pass",
    reason: target.note,
    reviewedBy: EXTRACTOR,
    reviewedAt: new Date().toISOString(),
  };

  if (target.clearDuplicateIssues) {
    next.duplicateIssues = [];
    next.duplicateDecision = "pass";
  }

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
  } else if (asArray(verification.dateIssues).length === 0) {
    next.dateIssues = [];
  }

  return next;
}

async function fetchRows(supabase) {
  const ids = TARGETS.map((target) => target.id);
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,poster_status,application_start_at,application_end_at,event_start_at,event_end_at,deadline_type,data_confidence,field_verification")
    .in("id", ids);
  if (error) throw error;
  const rowsById = new Map((data ?? []).map((row) => [row.id, row]));
  const missing = ids.filter((id) => !rowsById.has(id));
  if (missing.length > 0) throw new Error(`Missing target posters: ${missing.join(", ")}`);
  return ids.map((id) => rowsById.get(id));
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
      current: {
        application_start_at: dateKey(row.application_start_at),
        application_end_at: dateKey(row.application_end_at),
        event_start_at: dateKey(row.event_start_at),
        event_end_at: dateKey(row.event_end_at),
        deadline_type: row.deadline_type,
        data_confidence: row.data_confidence,
        duplicateIssues: asArray(row.field_verification?.duplicateIssues).length,
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

async function applyPlan(supabase, plan) {
  let posterUpdates = 0;
  for (const item of plan) {
    const { error } = await supabase
      .from("posters")
      .update(item.rawPatch)
      .eq("id", item.id)
      .eq("poster_status", "review");
    if (error) throw error;
    posterUpdates += 1;
  }

  const evidenceRows = plan.flatMap((item) => item.evidenceRows);
  const { error: evidenceError } = await supabase
    .from("poster_field_evidence")
    .upsert(evidenceRows, { onConflict: "poster_id,field_key,extractor" });
  if (evidenceError) throw evidenceError;

  return {
    poster_updates: posterUpdates,
    evidence_rows: evidenceRows.length,
  };
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  const supabase = createSupabase();
  const plan = buildPlan(await fetchRows(supabase));
  const result = apply ? await applyPlan(supabase, plan) : { poster_updates: 0, evidence_rows: 0 };

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    approved_scope: "final review release corrections for the remaining 5 review posters",
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
