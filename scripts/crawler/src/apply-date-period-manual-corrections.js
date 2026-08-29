#!/usr/bin/env node
import "./load-env.js";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPORT_PATH = path.join(REPO_ROOT, "data", "results", "date-period-manual-corrections.json");
const EXTRACTOR = "date-period-manual-corrections-v1";

const CORRECTIONS = [
  {
    id: "f1247954-314f-4f69-ad17-9b925eb39845",
    action: "accept_stored",
    start: "2026-06-22",
    deadline: "2026-09-08",
    eventStart: "2026-09-09",
    eventEnd: "2026-09-10",
    confidence: 0.95,
    evidence: "사전등록 신청기간: 2026년 6월 22일 ~ 9월 8일. 9월 9일~10일은 행사 기간입니다.",
    reason: "Try Everything 2026은 사전등록 마감일이 2026-09-08이며 2026-09-10은 행사 종료일입니다.",
  },
  {
    id: "45817dc6-f5cc-45f5-b995-7932159e14a2",
    action: "correct_deadline",
    deadline: "2026-06-30",
    eventStart: "2026-01-01",
    eventEnd: "2026-06-30",
    confidence: 0.9,
    evidence: "사업 기간은 2026년 1월 1일부터 6월 30일까지며 참여자는 수시 모집합니다.",
    reason: "수시 모집 문구가 있어도 사업기간 종료일이 2026-06-30이므로 공개 노출 마감일을 채웁니다.",
  },
  {
    id: "0dd4542b-3442-454c-88d0-599e0b880aa7",
    action: "correct_deadline",
    start: "2026-07-08",
    deadline: "2026-08-26",
    eventStart: "2026-08-30",
    eventEnd: "2026-09-05",
    confidence: 0.95,
    evidence: "변경 모집마감: 2026. 8. 26. 예선일정 2026. 8. 30., 본선일정 2026. 9. 5.",
    reason: "저장값 2026-08-31은 변경 전 마감 또는 다른 일정으로 보이며, 변경 모집마감은 2026-08-26입니다.",
  },
  {
    id: "8ce91d39-941a-4a79-996c-345246729de9",
    action: "correct_deadline",
    start: "2026-08-12",
    deadline: "2026-08-24",
    eventStart: "2026-09-02",
    eventEnd: "2026-09-16",
    confidence: 0.95,
    evidence: "모집기간: 2026-08-12 10:00 ~ 2026-08-24 09:00. 강좌기간은 2026-09-02 ~ 2026-09-16입니다.",
    reason: "저장값 2026-09-16은 강좌 종료일이고, 게시 노출 마감은 모집 종료일 2026-08-24입니다.",
  },
  {
    id: "78a9ce46-f9d8-4f0e-9873-0c2459ccd043",
    action: "correct_deadline",
    start: "2026-08-06",
    deadline: "2026-08-20",
    eventStart: "2026-08-22",
    eventEnd: "2026-11-21",
    confidence: 0.95,
    evidence: "모집기간: 2026-08-06 00:00 ~ 2026-08-20 00:00. 강좌기간은 2026-08-22 ~ 2026-11-21입니다.",
    reason: "저장값 2026-11-21은 강좌 종료일이고, 게시 노출 마감은 모집 종료일 2026-08-20입니다.",
  },
  {
    id: "0520de61-57b0-4d4b-a68f-3851bf1b62cd",
    action: "correct_deadline",
    start: "2026-08-05",
    deadline: "2026-08-19",
    eventStart: "2026-08-26",
    eventEnd: "2026-11-18",
    confidence: 0.95,
    evidence: "모집기간: 2026-08-05 10:00 ~ 2026-08-19 18:00. 강좌기간은 2026-08-26 ~ 2026-11-18입니다.",
    reason: "저장값 2026-11-18은 강좌 종료일이고, 게시 노출 마감은 모집 종료일 2026-08-19입니다.",
  },
  {
    id: "4c8b7ebc-a395-4fd5-9ea2-3b6c9846a4c7",
    action: "accept_stored",
    start: "2026-08-10",
    deadline: "2026-09-09",
    confidence: 0.95,
    evidence: "서울청년포털 신청기간: 2026-08-10 ~ 2026-09-09 23:59.",
    reason: "공식 신청기간 근거가 2026-09-09 23:59까지이므로 저장 마감일을 유지합니다.",
  },
  {
    id: "0ee4c853-f2e2-4c34-b174-e09f7fa75ee0",
    action: "correct_deadline",
    start: "2026-08-14",
    deadline: "2026-08-31",
    confidence: 0.95,
    evidence: "모집 기간: 2026. 8. 14.(금) ~ 8. 31.(월) 23:59까지.",
    reason: "저장값 2026-09-08은 프로그램/다른 일정으로 보이며, 모집 마감은 2026-08-31입니다.",
  },
  {
    id: "6d0bd770-51c4-4c83-9e38-955d95996f7e",
    action: "accept_stored",
    start: "2026-08-19",
    deadline: "2026-09-09",
    confidence: 0.95,
    evidence: "서울청년포털 신청기간: 2026-08-19 ~ 2026-09-09 00:00.",
    reason: "공식 신청기간 근거가 2026-09-09까지이므로 저장 마감일을 유지합니다.",
  },
  {
    id: "e8f2b58d-7fe8-4110-a166-bf7c44395902",
    action: "correct_deadline",
    start: "2026-07-29",
    deadline: "2026-09-04",
    eventStart: "2026-09-09",
    eventEnd: "2026-11-25",
    confidence: 0.95,
    evidence: "접수기간 2026.07.29~2026.09.04. 행사일은 2026.09.09~2026.11.25입니다.",
    reason: "저장값 2026-11-24는 교육/행사 일정으로 보이며, 접수 마감은 2026-09-04입니다.",
  },
  {
    id: "624e2a8a-b781-4b6f-94cc-34d2b3e5a374",
    action: "accept_stored",
    start: "2026-08-14",
    deadline: "2026-08-30",
    eventStart: "2026-09-03",
    eventEnd: "2026-11-12",
    confidence: 0.95,
    evidence: "모집기간: ~2026.08.30.(일)까지. 진행기간은 2026.09.03~11.12입니다.",
    reason: "저장 마감일 2026-08-30이 모집 마감이고, 2026-09-03은 활동 시작일입니다.",
  },
  {
    id: "756a954b-930a-426a-b195-ad37838fb6a4",
    action: "correct_deadline",
    start: "2026-08-24",
    deadline: "2026-09-06",
    confidence: 0.95,
    evidence: "기간: 2026. 8. 24.(월) ~ 2026. 9. 6.(일). 활동일정은 9/16 이후입니다.",
    reason: "운영자 수동 근거와 본문 기간은 2026-09-06까지이므로 신청기간 기준으로 교정합니다.",
  },
  {
    id: "073cc5a0-112a-4802-bc7e-979b344c7801",
    action: "accept_stored",
    deadline: "2026-09-04",
    confidence: 1,
    evidence: "사용자 수동 검수: 패션뷰티유통직무 청년모집 마감 2026-09-04 확인.",
    reason: "사용자 수동 검수로 2026-09-04가 맞다고 확인된 건입니다.",
  },
  {
    id: "f763cc80-a662-405b-a7bd-e21e851386b4",
    action: "accept_stored",
    deadline: "2026-09-20",
    confidence: 1,
    evidence: "사용자 수동 검수: 포스터 모집 기간은 2026-09-20까지이며, 2026-09-29는 면접 일정입니다.",
    reason: "사용자 수동 검수로 2026-09-20이 맞다고 확인된 건입니다.",
  },
  {
    id: "1b866954-f9d6-46d3-8e0b-8a325cac7ab9",
    action: "accept_stored",
    deadline: "2026-09-08",
    confidence: 0.95,
    evidence: "신청기간: ~ 2026년 9월 8일 14:00까지. 2026년 9월 9일은 선정발표일입니다.",
    reason: "저장 마감일 2026-09-08이 신청 마감이고, 2026-09-09는 선정발표일입니다.",
  },
  {
    id: "e07b6e24-6b25-4a47-8ef6-2c3f231a9d5e",
    action: "accept_stored",
    start: "2026-08-31",
    deadline: "2026-09-03",
    eventStart: "2026-09-12",
    eventEnd: "2026-09-13",
    confidence: 1,
    evidence: "사용자 수동 검수: 모집기간 2026. 8. 31. 10시 ~ 9. 3. 18시, 체험기간 9.12~9.13.",
    reason: "사용자 수동 검수로 2026-09-03이 모집 마감이고 2026-09-13은 체험 종료일임을 확인했습니다.",
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
    global: { headers: { "X-Client-Info": "posterlink-date-period-manual-corrections" } },
  });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function dateOnly(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? text.slice(0, 10)
    : new Date(parsed.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function mergeFieldVerification(row, correction) {
  const verification = asObject(row.field_verification);
  const nextConfidence = Math.max(
    Number.isFinite(Number(verification.confidence)) ? Number(verification.confidence) : 0,
    correction.confidence,
  );

  return {
    ...verification,
    deadlineMatches: true,
    correctedDeadline: null,
    dateIssues: [],
    decision: nextConfidence >= 0.9 ? "pass" : verification.decision,
    confidence: nextConfidence,
    reason: correction.reason,
    dateQuality: {
      ...asObject(verification.dateQuality),
      decision: "pass",
      storedDeadline: correction.deadline,
      extractedDeadline: correction.deadline,
      normalizedDeadline: correction.deadline,
      suggestedDeadline: correction.deadline,
      issues: [],
      updatedBy: EXTRACTOR,
      updatedAt: new Date().toISOString(),
    },
  };
}

async function fetchRows(supabase) {
  const ids = CORRECTIONS.map((item) => item.id);
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,poster_status,application_end_at,field_verification,data_confidence")
    .in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row]));
}

function buildPlan(rowsById) {
  return CORRECTIONS.map((correction) => {
    const row = rowsById.get(correction.id);
    if (!row) throw new Error(`Missing poster ${correction.id}`);
    return {
      ...correction,
      title: row.title,
      status: row.poster_status,
      old_deadline: dateOnly(row.application_end_at),
      old_confidence: row.data_confidence,
      next_field_verification: mergeFieldVerification(row, correction),
      next_data_confidence: Math.max(Number(row.data_confidence ?? 0), correction.confidence),
    };
  });
}

async function applyPlan(supabase, plan) {
  let updated = 0;
  const evidenceRows = [];

  for (const item of plan) {
    const patch = {
      field_verification: item.next_field_verification,
      data_confidence: item.next_data_confidence,
    };
    if (item.start) {
      patch.application_start_at = item.start;
    }
    if (item.eventStart) {
      patch.event_start_at = item.eventStart;
    }
    if (item.eventEnd) {
      patch.event_end_at = item.eventEnd;
    }
    if (item.action === "correct_deadline") {
      patch.application_end_at = item.deadline;
    }

    const { error } = await supabase
      .from("posters")
      .update(patch)
      .eq("id", item.id);
    if (error) throw error;
    updated += 1;

    evidenceRows.push({
      poster_id: item.id,
      field_key: "deadline_date",
      value_text: item.deadline,
      value_json: {
        date: item.deadline,
        start: item.start ?? null,
        eventStart: item.eventStart ?? null,
        eventEnd: item.eventEnd ?? null,
        action: item.action,
        reason: item.reason,
        previousDeadline: item.old_deadline,
      },
      confidence: item.confidence,
      evidence_text: item.evidence,
      evidence_src: item.confidence >= 1 ? "operator" : "body",
      extractor: EXTRACTOR,
    });
  }

  const { error } = await supabase
    .from("poster_field_evidence")
    .upsert(evidenceRows, { onConflict: "poster_id,field_key,extractor" });
  if (error) throw error;

  return { updated, evidence_rows: evidenceRows.length };
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  const supabase = createSupabase();
  const rowsById = await fetchRows(supabase);
  const plan = buildPlan(rowsById);
  const result = apply ? await applyPlan(supabase, plan) : { updated: 0, evidence_rows: 0 };

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    result,
    correct_deadline_count: plan.filter((item) => item.action === "correct_deadline").length,
    accept_stored_count: plan.filter((item) => item.action === "accept_stored").length,
    plan: plan.map(({ next_field_verification, ...item }) => item),
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(`mode=${report.mode}`);
  console.log(`correct_deadline=${report.correct_deadline_count}`);
  console.log(`accept_stored=${report.accept_stored_count}`);
  console.log(`updated=${report.result.updated}`);
  console.log(`evidence_rows=${report.result.evidence_rows}`);
  console.log(`report=${REPORT_PATH}`);
  for (const item of report.plan) {
    console.log(`- ${item.action} [${item.status}] ${item.title}: ${item.old_deadline ?? "-"} => ${item.deadline}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
