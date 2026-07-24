#!/usr/bin/env node
import "./load-env.js";
import { createClient } from "@supabase/supabase-js";
import { deletePostersWithStorage } from "./storage-cleanup.js";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
const readKey = serviceKey ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !readKey) throw new Error("Supabase URL/key is required");
if (apply && !serviceKey) throw new Error("--apply requires SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY");

const supabase = createClient(url, readKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const exactRejectTitles = [
  "[마포구가족센터] 공고 제 2026-5호 마포구가족센터 직원 채용공고",
  "마포구가족센터 - 건강관리 교육 및 근력운동 프로그램 강사 모집(안내)",
  "[채용공고] 마포구고용복지지원센터 신규사업 실시에 따른 계약직 직원 채용 재공고",
  "[채용공고] 마포구고용복지지원센터 신규사업 실시에 따른 계약직 직원 채용공고",
  "[채용공고] 마포구고용복지지원센터 청년도전 매니저 채용공고",
  "[채용공고] 마포구고용복지지원센터 계약직 사회복지사 채용공고",
  "[채용공고] 마포구고용복지지원센터 계약직 사회복지사 채용 연장공고",
  "2026년 제4회 마포문화재단 직원 채용 공고( ~ 7.10.(금) 18:00 한)",
  "2026년 마포구립예술단 (구립·소년소녀·윈드오케스트라) 단원 추가모집 심사 일정 공고",
  "통장 모집 공고(제7통)",
  "제107주년 삼일절 나라사랑 태극기 달기운동",
  "[소식] 마포청소년문화의집, 사회정서프로그램 '마음CONNECT'운영(2026. 06. 13.)",
  "[소식] 서울 마포청소년문화의집, AI부터 UAM까지… 미래기술 직업체험 운영(2026. 07. 06.)",
];

const duplicateTitleGroups = [
  [
    "2026년 금천구 생활체육교실 <여성풋살교실(8~10월 매주 월요일)> 참여자 모집",
    "2026년 금천구 생활체육교실 <여성풋살교실(8~10월 매주 금요일> 참여자 모집",
  ],
  [
    "여름맞이 배드민턴 소그룹 집중 레슨(특강) 신규 프로그램 안내",
    "여름맞이 배드민턴 소그룹 집중 레슨(특강) 8월",
  ],
];

const allTitles = [...new Set([...exactRejectTitles, ...duplicateTitleGroups.flat()])];
const { data, error } = await supabase
  .from("posters")
  .select("id,title,source_org_name,poster_status,created_at,thumbnail_url,source_key")
  .in("title", allTitles);
if (error) throw error;

const rows = data ?? [];
const rejectRows = rows.filter((row) => exactRejectTitles.includes(row.title));
const duplicateDeletes = [];
const duplicateKeeps = [];

for (const titles of duplicateTitleGroups) {
  const matches = rows
    .filter((row) => titles.includes(row.title))
    .sort((a, b) => {
      const statusRank = (row) => row.poster_status === "published" ? 0 : 1;
      return statusRank(a) - statusRank(b)
        || String(a.created_at).localeCompare(String(b.created_at));
    });
  if (matches.length > 0) duplicateKeeps.push(matches[0]);
  duplicateDeletes.push(...matches.slice(1));
}

const deleteRows = [...new Map(
  [...rejectRows, ...duplicateDeletes].map((row) => [row.id, row]),
).values()];

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  visibleMatchedRows: rows,
  duplicateKeeps,
  deleteRows,
}, null, 2));

if (apply && deleteRows.length > 0) {
  const result = await deletePostersWithStorage(
    supabase,
    deleteRows.map((row) => row.id),
  );
  console.log(JSON.stringify({ deleted: result }, null, 2));
}
