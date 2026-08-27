#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_INPUT = "data/eval/reports/auto-publish-plan-dryrun-20260827-after-review-tier-apply.json";
const DEFAULT_OUTPUT = "data/eval/reports/review-tier-a-candidates-current-db-20260827.csv";
const DEFAULT_REFERENCE_DATE = "2026-08-27";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-review-tier-candidates-export" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return text.includes(",") || text.includes("\"") || text.includes("\r") || text.includes("\n")
    ? `"${text.replaceAll("\"", "\"\"")}"`
    : text;
}

function day(value) {
  return value ? String(value).slice(0, 10) : "";
}

function classifyCurrentDb(row, { imageCount, referenceDate }) {
  const reasons = [];
  const deadline = day(row.application_end_at);
  if (deadline && deadline < referenceDate) reasons.push("마감일 지남");
  if (deadline.startsWith("2023-")) reasons.push("마감 연도 이상");
  if (!row.thumbnail_url) reasons.push("썸네일 없음");
  if (imageCount <= 0) reasons.push("이미지 행 없음");
  if (!row.organizer_name) reasons.push("주관기관 없음");
  if (row.verification_status === "needs_review") reasons.push("구조화 검증 needs_review");
  if (row.field_verification?.decision === "needs_review") reasons.push("field_verification needs_review");
  return {
    decision: reasons.length > 0 ? "보류 검토" : "공개 가능",
    reason: reasons.length > 0 ? reasons.join("; ") : "기준 통과",
  };
}

async function fetchInChunks(supabase, table, select, ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase.from(table).select(select).in("poster_id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function main() {
  const input = path.resolve(REPO_ROOT, args.input || DEFAULT_INPUT);
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const referenceDate = String(args["reference-date"] || DEFAULT_REFERENCE_DATE);
  const plan = JSON.parse(await fs.readFile(input, "utf8"));
  const candidateIds = (plan.plans ?? [])
    .filter((entry) => entry.eligible && String(entry.exposure_tier).toUpperCase() === "A")
    .map((entry) => entry.poster_id);

  const supabase = createSupabase();
  const posters = [];
  for (let i = 0; i < candidateIds.length; i += 100) {
    const chunk = candidateIds.slice(i, i + 100);
    const { data, error } = await supabase
      .from("posters")
      .select(
        [
          "id",
          "title",
          "poster_status",
          "exposure_tier",
          "source_org_name",
          "organizer_name",
          "application_end_at",
          "deadline_type",
          "thumbnail_url",
          "source_key",
          "summary_short",
          "eligibility_summary",
          "benefits_summary",
          "application_method",
          "contact_info",
          "verification_status",
          "data_confidence",
          "verified_at",
          "tier_reason",
          "field_verification",
        ].join(","),
      )
      .in("id", chunk);
    if (error) throw error;
    posters.push(...(data ?? []));
  }

  const links = await fetchInChunks(supabase, "poster_links", "poster_id,link_type,title,url,is_primary", candidateIds);
  const images = await fetchInChunks(supabase, "poster_images", "poster_id,image_type,storage_path,width,height", candidateIds);
  const posterById = new Map(posters.map((poster) => [poster.id, poster]));
  const linksByPoster = new Map();
  for (const link of links) {
    const list = linksByPoster.get(link.poster_id) ?? [];
    list.push(link);
    linksByPoster.set(link.poster_id, list);
  }
  const imageCountByPoster = new Map();
  for (const image of images) {
    imageCountByPoster.set(image.poster_id, (imageCountByPoster.get(image.poster_id) ?? 0) + 1);
  }

  const header = [
    "No",
    "판정",
    "추가 확인 사유",
    "poster_id",
    "제목",
    "현재상태",
    "노출등급",
    "검증상태",
    "데이터신뢰도",
    "수집출처",
    "주관기관",
    "마감일",
    "마감유형",
    "썸네일",
    "이미지수",
    "공식원문",
    "신청URL",
    "요약",
    "field_verification_reason",
  ];

  const rows = candidateIds.map((id, index) => {
    const poster = posterById.get(id) ?? {};
    const posterLinks = linksByPoster.get(id) ?? [];
    const imageCount = imageCountByPoster.get(id) ?? 0;
    const official = posterLinks.find((link) => link.link_type === "official_notice")?.url ?? "";
    const apply = posterLinks.find((link) => link.link_type === "official_apply")?.url ?? "";
    const current = classifyCurrentDb(poster, { imageCount, referenceDate });
    return [
      index + 1,
      current.decision,
      current.reason,
      id,
      poster.title,
      poster.poster_status,
      poster.exposure_tier,
      poster.verification_status,
      poster.data_confidence,
      poster.source_org_name,
      poster.organizer_name,
      day(poster.application_end_at),
      poster.deadline_type,
      poster.thumbnail_url,
      imageCount,
      official,
      apply,
      poster.summary_short,
      poster.field_verification?.reason ?? "",
    ];
  });

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `\uFEFF${[header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`, "utf8");

  const byDecision = {};
  const byVerification = {};
  for (const row of rows) byDecision[row[1]] = (byDecision[row[1]] ?? 0) + 1;
  for (const poster of posters) {
    const key = poster.verification_status ?? "null";
    byVerification[key] = (byVerification[key] ?? 0) + 1;
  }
  console.log(JSON.stringify({
    output,
    count: rows.length,
    by_decision: byDecision,
    by_verification_status: byVerification,
    low_data_confidence_count: posters.filter((poster) => Number(poster.data_confidence ?? 1) < 0.7).length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
