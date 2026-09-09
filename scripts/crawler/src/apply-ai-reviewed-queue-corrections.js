#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const TODAY_KST = "2026-09-09";
const CONFIRM_TOKEN = "APPLY_AI_REVIEWED_QUEUE_CORRECTIONS";
const OUTPUT_DEFAULT = "data/results/ai-reviewed-queue-corrections-20260909.json";

const PLAN = [
  ["5a084e4d-9821-4472-8273-1714603535b4", { status: "published", appStart: "2026-09-01", appEnd: "2026-09-20", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_BUSINESS"], reason: "AX 전환 PBL 교육 과정 모집이며 신청기간은 2026-09-01~2026-09-20." }],
  ["eaa94756-f95f-45d1-94c9-59c9b6923d0f", { status: "published", appStart: "2026-09-07", appEnd: "2026-09-30", deadlineType: "fixed", categories: ["CAT_BUSINESS"], reason: "메이커스페이스 프로젝트 모집이며 접수기간은 2026-09-07~2026-09-30." }],
  ["442d7b31-dd67-4f7a-9cfd-805cc85c45a4", { status: "published", appStart: "2026-09-03", appEnd: "2026-10-02", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_BUSINESS"], reason: "바이오 산업 교육 수강자 모집이며 신청 마감은 2026-10-02." }],
  ["2e0fe529-d62a-4109-84b0-70fc77debef2", { status: "published", appStart: "2026-09-03", appEnd: "2026-09-17", deadlineType: "fixed", categories: ["CAT_BUSINESS"], reason: "스타트업 투자/수출 컨설팅 참여 모집이며 접수기간은 2026-09-03~2026-09-17." }],
  ["9ceff024-e972-4736-8f61-b49bb20524dc", { status: "published", appStart: "2026-09-03", appEnd: "2026-09-10", eventStart: "2026-09-10", eventEnd: "2026-09-10", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_BUSINESS"], reason: "오픈이노베이션 네트워킹 행사 신청 마감은 행사일 전 2026-09-10 12:00." }],
  ["c079a0ae-2a82-4e0c-8e5d-d9de1f1832b4", { status: "published", appEnd: "2026-09-11", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "탄소중립 실천 인증 이벤트로 모집 마감은 제목과 본문 기준 2026-09-11." }],
  ["e4752ece-16b4-4bcb-b5c2-9cc4275c96f5", { status: "published", appEnd: "2026-09-16", eventStart: "2026-09-16", eventEnd: "2026-09-16", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "현직자 취업준비 콘서트 참여 모집으로 2026-09-16 행사/마감." }],
  ["ae0845b2-ea66-4de2-ac81-2212cb59ff3a", { status: "published", appStart: "2026-09-01", appEnd: "2026-09-17", deadlineType: "fixed", categories: ["CAT_SUPPORT_PROGRAM"], reason: "서울커리업 구직지원금 5차 모집이며 모집기간은 2026-09-01~2026-09-17." }],
  ["bbe74913-ca9d-45df-a755-b150a79f0ba3", { status: "published", title: "영등포문화재단 <마음공작소> 성인 원데이 워크숍 모집", appEnd: "2026-09-16", eventStart: "2026-09-17", eventEnd: "2026-09-17", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "성인 대상 창작 워크숍 모집으로 신청 마감은 2026-09-16." }],
  ["e8905f86-bbe2-4a6f-b4d3-f21242d11eca", { status: "published", appEnd: "2026-09-13", eventStart: "2026-09-09", eventEnd: "2026-09-13", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "상상의 정원 전시 개최 안내로 행사기간은 2026-09-09~2026-09-13." }],
  ["1cff81d7-5393-4f72-a579-5de06a26a58f", { status: "published", appStart: "2026-09-07", appEnd: "2026-10-02", eventStart: "2026-10-15", eventEnd: "2026-10-29", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_BUSINESS"], reason: "청년 창업 아카데미 참여자 모집이며 모집기간은 2026-09-07~2026-10-02." }],
  ["7567e2dd-eab2-4f2b-98fa-28e14df27840", { status: "published", appStart: "2026-09-01", appEnd: "2026-10-20", eventStart: "2026-11-05", eventEnd: "2026-12-03", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "민회 구민 참가자 모집이며 모집기간은 2026-09-01~2026-10-20." }],
  ["882e2bda-a4f0-4e82-b86d-dda416050ae5", { status: "published", appStart: "2026-09-07", appEnd: "2026-09-20", eventStart: "2026-10-02", eventEnd: "2026-10-02", deadlineType: "fixed", categories: ["CAT_FAMILY", "CAT_COURSE"], reason: "가족돌봄청년 자기돌봄 가죽공예 프로그램 모집이며 신청기간은 2026-09-07~2026-09-20." }],
  ["fdb58000-4843-4237-8dac-a0b9b29ac5f5", { status: "published", appStart: "2026-09-07", appEnd: "2026-09-28", eventStart: "2026-10-06", eventEnd: "2026-11-24", deadlineType: "fixed", categories: ["CAT_HEALTH", "CAT_COURSE"], reason: "청년 심리학 프로그램 모집이며 모집기간은 2026-09-07~2026-09-28." }],
  ["f30b695e-9868-4918-9ff2-267832387eea", { status: "published", title: "성동청소년문화의집 <퍼스널컬러 - 나를 빛내는 컬러> 참가자 모집", appStart: "2026-09-03", appEnd: "2026-09-14", eventStart: "2026-09-17", eventEnd: "2026-09-17", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "퍼스널컬러 진단 클래스 참가자 모집이며 모집기간은 2026-09-03~2026-09-14." }],
  ["811363d1-e6cb-478e-81a5-6ce080715c57", { status: "closed", appStart: "2026-08-20", appEnd: "2026-09-02", deadlineType: "fixed", categories: ["CAT_HOUSING", "CAT_COURSE"], reason: "부동산 재테크 1회차 강의 모집으로 1회차 신청기간은 2026-08-20~2026-09-02라 오늘 기준 종료." }],
  ["bac8c41b-4c1b-4370-93b5-4ff4e334cf4c", { status: "published", appEnd: "2026-09-17", eventStart: "2026-09-17", eventEnd: "2026-09-17", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "노무 상담/진로 상담 참여 모집이며 행사일은 2026-09-17." }],
  ["b360af42-e2f1-4ec7-9f2c-45333b941e9f", { status: "published", appStart: "2026-09-08", appEnd: null, eventStart: "2026-10-15", eventEnd: "2026-10-15", deadlineType: "until_exhausted", categories: ["CAT_HOUSING"], reason: "10월 대면 주거 상담은 2026-09-08부터 선착순 마감시까지 접수이며 기존 2023년 날짜는 오인." }],
  ["590b7c86-67f8-42fd-9f66-e98d0641cd70", { status: "closed", appEnd: "2026-09-06", eventStart: "2026-09-09", eventEnd: "2026-09-11", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_BUSINESS"], reason: "모두의 창업 집중특강 모집 마감은 2026-09-06으로 오늘 기준 종료." }],
  ["323e2cb6-369a-4e1b-8c29-3faec704dddd", { status: "published", appEnd: "2026-09-12", eventStart: "2026-09-12", eventEnd: "2026-09-12", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "9월 유기견 봉사활동 참여자 모집으로 활동일은 2026-09-12." }],
  ["59f4e99a-9c6f-4a05-9e51-35282a624ae4", { status: "published", appStart: "2026-09-08", appEnd: "2026-09-15", eventStart: "2026-09-17", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "건강한 밥상+ 1기 모집기간은 2026-09-08 10:00~2026-09-15 17:00." }],
  ["24ae9069-96e0-4e46-b159-9250ef8b3c88", { status: "published", appEnd: "2026-09-21", eventStart: "2026-09-28", eventEnd: "2026-11-30", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "노원구 청년 활동가 모집 마감은 2026-09-21." }],
  ["f16f6f48-514b-45a0-81e0-7c98ff5d115f", { status: "published", appEnd: null, eventStart: "2026-09-10", eventEnd: "2026-10-08", deadlineType: "unknown", categories: ["CAT_COURSE"], reason: "독서모임 참여 신청은 있으나 별도 모집 마감일이 없어 행사기간만 보존." }],
  ["75d80735-0df3-4148-b00e-b293e609babc", { status: "published", appStart: "2026-09-08", appEnd: "2026-09-22", deadlineType: "fixed", categories: ["CAT_SUPPORT_PROGRAM", "CAT_EVENT_RECRUIT"], reason: "청년 동아리 활동지원사업 하반기 모집이며 신청 마감은 2026-09-22 23:59." }],
  ["f46aafc7-2423-46ae-90fe-50c89b1229a1", { status: "published", appStart: "2026-09-07", appEnd: "2026-09-15", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_COURSE"], reason: "강동 청년축제 내 우리동네멘토 상담은 후보 중복 의심이나 공개 포스터 중복은 아니며 독립 신청 프로그램." }],
  ["9375774b-6566-42fc-a23c-a67e31a275a9", { status: "published", appStart: "2026-09-11", appEnd: "2026-09-18", eventStart: "2026-09-20", eventEnd: "2026-09-20", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "학마을도서관 꼴라주 강연/체험 접수기간은 2026-09-11~2026-09-18." }],
  ["58e576fe-ae69-40a0-971e-fd99be78af7b", { status: "published", appStart: "2026-09-08", appEnd: "2026-09-18", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "이정모 과학자 특강 접수기간은 2026-09-08~2026-09-18." }],
  ["90f337d6-082d-4319-a76e-151b67c16900", { status: "published", appStart: "2026-09-08", appEnd: "2026-09-17", eventStart: "2026-09-18", eventEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "최고민수 경제사 특강 접수기간은 2026-09-08~2026-09-17." }],
  ["7755951f-f64a-4d8c-8c36-b3971e1ab199", { status: "published", appStart: "2026-09-01", appEnd: "2026-09-14", eventStart: "2026-09-18", eventEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "서초 1인가구 송편 만들기 저녁반 모집기간은 2026-09-01~2026-09-14." }],
  ["c83fb546-ef96-4c88-bfd3-82032872d0c3", { status: "published", appStart: "2026-09-14", appEnd: "2026-09-27", eventStart: "2026-09-28", eventEnd: "2026-10-08", deadlineType: "fixed", categories: ["CAT_CONTEST", "CAT_HEALTH"], reason: "강남구 치매안심센터 명칭 공모전 모집기간은 2026-09-14~2026-09-27." }],
  ["fdc77734-6570-4c8f-9152-87210b6a8e01", { status: "published", appEnd: "2026-09-12", eventStart: "2026-09-12", eventEnd: "2026-09-12", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "신월청소년문화센터 WE즐 축제 개최 안내이며 행사일은 2026-09-12." }],
  ["d83ffa3e-580f-4280-9c1a-639d6078bbdb", { status: "published", appStart: "2026-09-08", appEnd: "2026-09-21", eventStart: "2026-10-02", eventEnd: "2026-11-30", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "외국인 유학생 대상 서울 정착 프로그램 모집기간은 2026-09-08~2026-09-21." }],
  ["1f32ca5d-aa15-4ccd-8439-37c7d86f0370", { status: "published", appStart: "2026-10-19", appEnd: "2026-10-23", eventStart: "2026-11-07", eventEnd: "2026-11-07", deadlineType: "fixed", categories: ["CAT_CONTEST", "CAT_FAMILY"], reason: "서울아이 뛰움 체조 경연대회 접수기간은 공고기간이 아닌 2026-10-19~2026-10-23." }],
  ["1c01b8c0-f495-401b-a6a2-2a0ad54544b2", { status: "published", title: "솜솜협동조합 <익산시 고향올래(로컬벤처)_솜솜스쿨 5기 - 라면 끓이고 갈래?> 참여자 모집", appEnd: "2026-09-17", eventStart: "2026-09-17", eventEnd: "2026-09-20", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "익산 로컬벤처 솜솜스쿨 5기 참여자 모집으로 프로그램은 2026-09-17~2026-09-20." }],
  ["1777f1d4-b070-48cc-9281-24fc5753a861", { status: "published", title: "동덕여대 ANCHOR사업단 <AI기반 온라인창업 마케팅 과정> 수강생 모집", appStart: "2026-09-01", appEnd: "2026-09-30", eventStart: "2026-10-06", eventEnd: "2026-11-06", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_BUSINESS"], reason: "원문 상세는 AI기반 온라인창업 마케팅 직업훈련 과정이며 모집 마감은 2026-09-30 18:00." }],
  ["4710e551-060c-45ab-ad67-2e5d72e0a831", { status: "published", appEnd: "2026-09-13", eventStart: "2026-09-16", eventEnd: "2026-09-16", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "노원청년일삶센터 동네반상회 참여자 모집 마감은 2026-09-13." }],
  ["daf240f9-f3c9-4516-b009-49842a228cc3", { status: "published", appEnd: "2026-09-12", eventStart: "2026-09-12", eventEnd: "2026-09-12", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "광진 반함축제 개최 안내와 일부 사전신청 프로그램이며 행사일은 2026-09-12." }],
  ["8db99649-34e1-4115-bcdc-59210646801e", { status: "published", appStart: "2026-08-31", appEnd: "2026-09-14", eventStart: "2026-09-18", eventEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_HOUSING"], reason: "경제 대전망 강연 참여자 모집이며 모집기간은 2026-08-31~2026-09-14." }],
  ["774fe1a3-bd31-4036-beb2-7c6b2388ed20", { status: "published", appEnd: "2026-09-18", eventStart: "2026-09-02", eventEnd: "2026-09-18", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT", "CAT_COURSE"], reason: "4.19 도자기 체험은 2회차가 2026-09-18에 남아 있고 미달 시 행사 전까지 모집하므로 9/2 마감은 첫 회차 오인." }],
  ["6e4b3d43-5332-488a-b1fd-d352ad88cfc2", { status: "published", appStart: "2026-08-24", appEnd: "2026-09-21", deadlineType: "fixed", categories: ["CAT_CONTEST", "CAT_POLICY_INFO"], reason: "광진구 청년 참여예산 제안사업 공모 접수기간은 2026-08-24~2026-09-21." }],
  ["02a7ffa6-f240-4426-8534-4e69aaca9335", { status: "published", appStart: "2026-09-05", appEnd: null, eventStart: "2026-09-16", eventEnd: "2026-09-16", deadlineType: "until_exhausted", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "꿈달다 9월 독서회는 2026-09-05부터 선착순 접수이며 행사 예정일은 2026-09-16." }],
  ["0212f9aa-929c-4e8c-8aeb-d40fcdbaf8b0", { status: "published", appEnd: "2026-09-16", eventStart: "2026-09-16", eventEnd: "2026-09-16", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "9월 티톡 정책/글쓰기 프로그램은 2026년 9월 프로그램이며 기존 2023년 날짜는 오인." }],
  ["bfd7684b-70de-4714-aa1e-23290e4062b6", { status: "published", appStart: "2026-09-16", appEnd: null, eventStart: "2026-09-30", eventEnd: "2026-09-30", deadlineType: "until_exhausted", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "도서관 문화가 있는 날 체험은 2026-09-16부터 선착순 접수이며 행사일은 2026-09-30." }],
  ["4e90b8da-4eaf-4dbb-a8f6-360dfa3381f9", { status: "published", appEnd: "2026-09-10", eventStart: "2026-09-10", eventEnd: "2026-09-10", deadlineType: "fixed", categories: ["CAT_HEALTH", "CAT_EVENT_RECRUIT"], reason: "자살예방의 날 캠페인으로 행사일은 2026-09-10." }],
  ["e0f5821e-e560-4be3-9f28-3e649545ab1c", { status: "published", appEnd: "2026-09-14", eventStart: "2026-09-14", eventEnd: "2026-09-28", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "디지털 문화시민 프로젝트 온라인 특강은 2026년 9월 14일과 9월 28일 강의이며 기존 2023년 날짜는 오인." }],
  ["7e51a88b-08a8-4ac0-b126-68ddc206b9a8", { status: "published", appEnd: "2026-09-12", eventStart: "2026-09-12", eventEnd: "2026-09-12", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "묵동 밤도깨비 야시장 행사일은 2026-09-12." }],
  ["f0644a16-7cc0-496e-af80-ab3180473b2c", { status: "published", appEnd: "2026-09-18", eventStart: "2026-09-18", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "사가정 먹자골목 거리축제 행사기간은 2026-09-18~2026-09-19." }],
  ["a7be13d7-e9d8-4da5-a558-e46c3ddcad53", { status: "published", appEnd: "2026-09-18", eventStart: "2026-09-18", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "서울청년주간 행사 안내이며 행사기간은 2026-09-18~2026-09-19, 사전예약 링크가 있다." }],
  ["ced7a8fb-bbe4-49f9-a162-cbfdc516bc9d", { status: "published", appStart: "2026-09-07", appEnd: "2026-09-10", deadlineType: "fixed", categories: ["CAT_HEALTH", "CAT_SUPPORT_PROGRAM"], reason: "서울시 청년 마음건강 지원사업 4차 모집 신청기간은 2026-09-07 10:00~2026-09-10 17:00." }],
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
  if (!url || !key) throw new Error("Supabase URL and service key are required");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "posterlink-ai-reviewed-queue-corrections" } },
  });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeDateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/20\d{2}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function toKstStart(value) {
  return value ? `${value}T00:00:00+09:00` : null;
}

function toKstEnd(value) {
  return value ? `${value}T23:59:59+09:00` : null;
}

async function fetchRows(supabase, ids) {
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,poster_status,application_start_at,application_end_at,event_start_at,event_end_at,deadline_type,field_verification,poster_categories(categories(code,name))")
    .in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function fetchCategories(supabase) {
  const { data, error } = await supabase.from("categories").select("id,code,name");
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.code, row]));
}

function buildVerification(row, decision) {
  const now = new Date().toISOString();
  const verification = { ...asObject(row.field_verification) };
  verification.dateIssues = [];
  verification.duplicateIssues = [];
  verification.qualityIssues = [];
  verification.classificationIssues = [];
  verification.deadlineMatches = true;
  verification.decision = "approved";
  verification.reason = `AI 직접 검수 승인: ${decision.reason}`;
  verification.dateQuality = {
    ...asObject(verification.dateQuality),
    decision: "pass",
    storedDeadline: decision.appEnd,
    normalizedDeadline: decision.appEnd,
    suggestedDeadline: decision.appEnd,
    reviewedAt: now,
    reviewedBy: "ai-reviewed-queue-corrections-20260909",
  };
  verification.classification = {
    ...asObject(verification.classification),
    categoryCodes: decision.categories,
    primaryCategory: decision.categories[0] ?? null,
    categories: decision.categories.map((code) => ({
      code,
      label: code,
      confidence: 0.9,
      evidence: decision.reason,
      source: "ai-reviewed-queue-corrections",
    })),
    confidence: 0.9,
    reason: decision.reason,
    updatedBy: "ai-reviewed-queue-corrections",
    updatedAt: now,
  };
  verification.aiQueueReview = {
    reviewer: "codex",
    reviewedAt: now,
    todayKst: TODAY_KST,
    decision: "approve",
    finalStatus: decision.status,
    finalDeadlineType: decision.deadlineType,
    finalApplicationStartAt: decision.appStart ?? null,
    finalApplicationEndAt: decision.appEnd ?? null,
    finalEventStartAt: decision.eventStart ?? null,
    finalEventEndAt: decision.eventEnd ?? null,
    finalCategories: decision.categories,
    reason: decision.reason,
  };
  return verification;
}

function buildReportItem(id, decision, row) {
  return {
    id,
    title: decision.title ?? row?.title ?? null,
    previous: row ? {
      status: row.poster_status,
      application_start_at: normalizeDateOnly(row.application_start_at),
      application_end_at: normalizeDateOnly(row.application_end_at),
      event_start_at: normalizeDateOnly(row.event_start_at),
      event_end_at: normalizeDateOnly(row.event_end_at),
      deadline_type: row.deadline_type,
      categories: (row.poster_categories ?? []).map((entry) => entry.categories?.code).filter(Boolean),
    } : null,
    next: {
      status: decision.status,
      application_start_at: decision.appStart ?? null,
      application_end_at: decision.appEnd ?? null,
      event_start_at: decision.eventStart ?? null,
      event_end_at: decision.eventEnd ?? null,
      deadline_type: decision.deadlineType,
      categories: decision.categories,
    },
    reason: decision.reason,
    applyable: Boolean(row && row.poster_status === "review"),
  };
}

async function applyOne(supabase, categoryByCode, row, id, decision) {
  const update = {
    poster_status: decision.status,
    published_at: new Date().toISOString(),
    rejection_reason: null,
    application_start_at: toKstStart(decision.appStart ?? null),
    application_end_at: toKstEnd(decision.appEnd ?? null),
    event_start_at: toKstStart(decision.eventStart ?? null),
    event_end_at: toKstEnd(decision.eventEnd ?? null),
    deadline_type: decision.deadlineType,
    field_verification: buildVerification(row, decision),
  };
  if (decision.title) update.title = decision.title;

  const { data, error } = await supabase
    .from("posters")
    .update(update)
    .eq("id", id)
    .eq("poster_status", "review")
    .select("id,title,poster_status")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { error: deleteError } = await supabase.from("poster_categories").delete().eq("poster_id", id);
  if (deleteError) throw deleteError;
  const categoryRows = decision.categories.map((code) => ({
    poster_id: id,
    category_id: categoryByCode.get(code)?.id,
  })).filter((entry) => entry.category_id);
  const { error: insertError } = await supabase.from("poster_categories").insert(categoryRows);
  if (insertError) throw insertError;
  return data;
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  if (apply && args.confirm !== CONFIRM_TOKEN) {
    throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);
  }

  const supabase = createSupabase();
  const entries = PLAN.map(([id, decision]) => ({ id, decision }));
  const [rowById, categoryByCode] = await Promise.all([
    fetchRows(supabase, entries.map((entry) => entry.id)),
    fetchCategories(supabase),
  ]);
  const missingCategories = [...new Set(entries.flatMap((entry) => entry.decision.categories))]
    .filter((code) => !categoryByCode.has(code));
  if (missingCategories.length > 0) throw new Error(`Missing categories: ${missingCategories.join(", ")}`);

  const reportItems = entries.map(({ id, decision }) => buildReportItem(id, decision, rowById.get(id)));
  const applied = [];
  if (apply) {
    for (const { id, decision } of entries) {
      const row = rowById.get(id);
      if (!row || row.poster_status !== "review") continue;
      const result = await applyOne(supabase, categoryByCode, row, id, decision);
      if (result) applied.push(result);
    }
    if (applied.length > 0) {
      const { error } = await supabase.from("admin_actions").insert({
        actor_user_id: null,
        target_type: "poster",
        target_id: null,
        action_type: "approve",
        action_reason: "ai_reviewed_queue_corrections_20260909",
        metadata_json: {
          reviewed_by: "codex",
          today_kst: TODAY_KST,
          reviewed_count: 51,
          approved_count: applied.length,
          kept_review_count: 2,
          excluded_review_ids: [
            "d4d1a1eb-fa4f-4a57-96d4-a108dc3d26bd",
            "67878f7c-7b6f-4363-bfbd-3117b3749892",
          ],
        },
      });
      if (error) throw error;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    today_kst: TODAY_KST,
    reviewed_count: 51,
    planned_approval_count: reportItems.filter((item) => item.applyable).length,
    applied_count: applied.length,
    kept_review: [
      {
        id: "d4d1a1eb-fa4f-4a57-96d4-a108dc3d26bd",
        title: "서울청년센터 도봉 <청년의 날 행사 '청년log: 담다, 닮다' 햇반 용기 교환 이벤트> 참여자 모집",
        reason: "이미 공개된 도봉 청년의 날 행사 공고의 세부 이벤트라 중복 노출 운영 판단이 필요.",
      },
      {
        id: "67878f7c-7b6f-4363-bfbd-3117b3749892",
        title: "서울청년센터 양천<청년정책패키지 CHECK IN : 양천 릴레이 강연 토크쇼 사전 모집>",
        reason: "이미 공개된 양천 청년정책패키지 행사 공고의 세부 프로그램이라 중복 노출 운영 판단이 필요.",
      },
    ],
    items: reportItems,
  };
  const output = path.resolve(args.output ?? OUTPUT_DEFAULT);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output: path.relative(process.cwd(), output),
    mode: report.mode,
    reviewed_count: report.reviewed_count,
    planned_approval_count: report.planned_approval_count,
    applied_count: report.applied_count,
    kept_review_count: report.kept_review.length,
    status_counts: report.items.reduce((acc, item) => {
      acc[item.next.status] = (acc[item.next.status] ?? 0) + 1;
      return acc;
    }, {}),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
