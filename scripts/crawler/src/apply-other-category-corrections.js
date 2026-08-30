#!/usr/bin/env node
import "./load-env.js";

import { createClient } from "@supabase/supabase-js";

const EXTRACTOR = "other-category-corrections-v1";
const TARGET_STATUSES = new Set(["published", "closed"]);
const OTHER_CODE = "CAT_OTHER";

const TARGETS = [
  {
    id: "02a333be-28dc-4f10-8151-f34b3cfe9f12",
    codes: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"],
    confidence: 0.9,
    evidence: "자원봉사자 모집, 기념행사, 포럼, 봉사분야 문화ㆍ체육ㆍ예술ㆍ관광",
  },
  {
    id: "5120f542-bc57-4e78-b437-2c21df38f337",
    codes: ["CAT_EVENT_RECRUIT"],
    confidence: 0.86,
    evidence: "서울 대학생 순찰대 추가 모집, 모집기간, 단체소개서/순찰계획서 제출",
  },
  {
    id: "476b1201-ab94-4324-9bf7-d0ab6e8fc01a",
    codes: ["CAT_COURSE", "CAT_EDUCATION"],
    confidence: 0.92,
    evidence: "생활과학교실 참가자 모집, 초등학교 2-5학년 대상 교육 프로그램",
  },
  {
    id: "24d2a373-982e-42ca-840a-dacdcad2ffc7",
    codes: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"],
    confidence: 0.88,
    evidence: "푸른 하늘의 날 인증 이벤트 참여자 모집, 미션 실천 인증사진 제출",
  },
  {
    id: "5a2d1c75-292f-4629-8474-3d78149ab2d9",
    codes: ["CAT_SUPPORT_PROGRAM", "CAT_WELFARE"],
    confidence: 0.92,
    evidence: "고유가 피해지원 지급사업 안내, 피해 시민 지원 프로그램",
  },
  {
    id: "90773707-2250-4be3-84f9-0dd257b006b0",
    codes: ["CAT_EVENT_RECRUIT"],
    confidence: 0.86,
    evidence: "서울 대학생 순찰대 추가 모집, 모집기간과 신청 접수 안내",
  },
  {
    id: "3b6bda3a-d1f2-4016-b48c-48163908d542",
    codes: ["CAT_EVENT_RECRUIT", "CAT_HEALTH"],
    confidence: 0.88,
    evidence: "서울 러닝 순찰대 대원 모집, 러닝과 방범순찰 참여",
  },
  {
    id: "5fe52b3e-3433-46ef-9d35-a09056e92250",
    codes: ["CAT_COURSE", "CAT_EDUCATION"],
    confidence: 0.93,
    evidence: "K-디지털트레이닝 반도체 품질 평가 및 불량 분석 전문가 양성과정 훈련생 모집",
  },
  {
    id: "7680f434-ccb0-44c9-b281-586ea6cce972",
    codes: ["CAT_COURSE", "CAT_CULTURE"],
    confidence: 0.9,
    evidence: "디지털드로잉으로 스톡작가 도전하기 참여자 모집, 문화/예술 교육 프로그램",
  },
  {
    id: "bcdf6bb8-f3d6-4e2d-847e-2dd87f3ef62a",
    codes: ["CAT_CULTURE", "CAT_LIFE_INFO"],
    confidence: 0.82,
    evidence: "성북마을미디어지원센터 편집실 신규 오픈 안내, 지역 문화/미디어 시설 정보",
  },
  {
    id: "1f286106-eb20-4d98-99b3-2e4f1928f08d",
    codes: ["CAT_POLICY_INFO"],
    confidence: 0.8,
    evidence: "탁구장 월/일일회원 정원 변경 알림, 시설 운영 공지",
  },
  {
    id: "38bee2f8-ec92-4e89-aa03-cf702f88e6d3",
    codes: ["CAT_SUPPORT_PROGRAM", "CAT_EDUCATION", "CAT_WELFARE"],
    confidence: 0.88,
    evidence: "북한이탈주민 정착지원 사업, 취업 관련 자격증 취득 지원",
  },
  {
    id: "4d56cc01-a53d-4a95-aef6-f4cac28f70ee",
    codes: ["CAT_FAMILY", "CAT_HEALTH", "CAT_EVENT_RECRUIT"],
    confidence: 0.88,
    evidence: "가족센터 면접교섭 프로그램, 자녀양육 프로그램, 심리상담, 참여자 안내",
  },
  {
    id: "4f2b6e37-3492-454e-8fec-eea8aec60d41",
    codes: ["CAT_HEALTH", "CAT_FAMILY"],
    confidence: 0.86,
    evidence: "청소년 상담 및 심리검사 안내, 심리 상담 서비스",
  },
  {
    id: "94e2dfec-f886-4394-8820-62bdbf64cfed",
    codes: ["CAT_SUPPORT_PROGRAM", "CAT_EDUCATION"],
    confidence: 0.88,
    evidence: "청년 면접정장 대여사업 신청자 모집, 취업 준비 지원",
  },
  {
    id: "f324f854-32e3-4ef6-bb62-2173d3be141b",
    codes: ["CAT_CONTEST"],
    confidence: 0.95,
    evidence: "서울꿈새김판 문안 공모, 공모기간 및 문안 응모",
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
    global: { headers: { "X-Client-Info": "posterlink-other-category-corrections" } },
  });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanClassificationIssues(issues) {
  if (!Array.isArray(issues)) return [];
  return issues.filter((issue) => {
    const code = String(issue?.code ?? "");
    return code !== "low-category-confidence" && code !== "ambiguous-category";
  });
}

function buildCategoryEntries(target, categoryByCode) {
  return target.codes.map((code) => ({
    code,
    label: categoryByCode.get(code)?.name ?? code,
    confidence: target.confidence,
    evidence: target.evidence,
    source: EXTRACTOR,
  }));
}

function mergeFieldVerification(row, target, categoryByCode) {
  const now = new Date().toISOString();
  const verification = asObject(row.field_verification);
  const classification = asObject(verification.classification);
  const categories = buildCategoryEntries(target, categoryByCode);

  return {
    ...verification,
    confidence: Math.max(Number(verification.confidence ?? 0), target.confidence),
    decision: verification.decision ?? "pass",
    reason: [verification.reason, "기타 단독 분류를 원문 근거로 보정"].filter(Boolean).join(" | ").slice(0, 800),
    classification: {
      ...classification,
      categories,
      categoryCodes: target.codes,
      primaryCategory: target.codes[0],
      confidence: Math.max(Number(classification.confidence ?? 0), target.confidence),
      updatedBy: EXTRACTOR,
      updatedAt: now,
    },
    classificationIssues: cleanClassificationIssues(verification.classificationIssues),
  };
}

function buildEvidenceRow(row, target, categoryByCode) {
  return {
    poster_id: row.id,
    field_key: "category",
    value_text: target.codes.join(","),
    value_json: {
      categoryCodes: target.codes,
      categories: buildCategoryEntries(target, categoryByCode),
    },
    confidence: target.confidence,
    evidence_text: target.evidence,
    evidence_src: "operator",
    extractor: EXTRACTOR,
  };
}

async function fetchCurrentLinks(supabase, posterIds, categoryById) {
  const { data, error } = await supabase
    .from("poster_categories")
    .select("poster_id,category_id")
    .in("poster_id", posterIds);
  if (error) throw error;

  const linksByPoster = new Map();
  for (const row of data ?? []) {
    const list = linksByPoster.get(row.poster_id) ?? [];
    const category = categoryById.get(row.category_id);
    list.push({
      category_id: row.category_id,
      code: category?.code ?? null,
      name: category?.name ?? null,
    });
    linksByPoster.set(row.poster_id, list);
  }
  return linksByPoster;
}

function buildPlans(rows, linksByPoster, categoryByCode, categoryById) {
  return TARGETS.map((target) => {
    const row = rows.find((item) => item.id === target.id);
    const currentCategories = linksByPoster.get(target.id) ?? [];
    const targetCategories = target.codes.map((code) => categoryByCode.get(code)).filter(Boolean);
    const otherCategory = [...categoryById.values()].find((category) => category.code === OTHER_CODE);
    const missingCodes = target.codes.filter((code) => !currentCategories.some((category) => category.code === code));
    const hasOther = currentCategories.some((category) => category?.code === OTHER_CODE);
    const skippedReason = !row
      ? "missing_poster"
      : !TARGET_STATUSES.has(row.poster_status)
        ? `unsupported_status:${row.poster_status}`
        : targetCategories.length !== target.codes.length
          ? "missing_category"
          : null;

    return {
      target,
      row,
      currentCategories,
      missingCodes,
      hasOther,
      otherCategoryId: otherCategory?.id ?? null,
      skippedReason,
      shouldApply: !skippedReason,
    };
  });
}

async function main() {
  const args = parseArgs();
  const apply = Boolean(args.apply);
  const supabase = createSupabase();

  const { data: categories, error: categoryError } = await supabase
    .from("categories")
    .select("id,code,name")
    .in("code", [...new Set([OTHER_CODE, ...TARGETS.flatMap((target) => target.codes)])]);
  if (categoryError) throw categoryError;

  const categoryByCode = new Map((categories ?? []).map((category) => [category.code, category]));
  const categoryById = new Map((categories ?? []).map((category) => [category.id, category]));
  const posterIds = TARGETS.map((target) => target.id);
  const { data: rows, error: posterError } = await supabase
    .from("posters")
    .select("id,title,source_org_name,poster_status,source_key,summary_short,summary_long,field_verification")
    .in("id", posterIds);
  if (posterError) throw posterError;

  const linksByPoster = await fetchCurrentLinks(supabase, posterIds, categoryById);
  const plans = buildPlans(rows ?? [], linksByPoster, categoryByCode, categoryById);

  const applied = [];
  const skipped = [];

  for (const plan of plans) {
    if (!plan.shouldApply) {
      skipped.push({
        id: plan.target.id,
        title: plan.row?.title ?? null,
        reason: plan.skippedReason ?? "already_classified",
        current_codes: plan.currentCategories.map((category) => category.code),
      });
      continue;
    }

    const categoryRows = plan.target.codes.map((code) => ({
      poster_id: plan.target.id,
      category_id: categoryByCode.get(code).id,
    }));
    const fieldVerification = mergeFieldVerification(plan.row, plan.target, categoryByCode);
    const evidenceRow = buildEvidenceRow(plan.row, plan.target, categoryByCode);

    if (apply) {
      const { error: categoryUpsertError } = await supabase
        .from("poster_categories")
        .upsert(categoryRows, { onConflict: "poster_id,category_id", ignoreDuplicates: true });
      if (categoryUpsertError) throw categoryUpsertError;

      if (plan.hasOther && plan.otherCategoryId && !plan.target.codes.includes(OTHER_CODE)) {
        const { error: removeOtherError } = await supabase
          .from("poster_categories")
          .delete()
          .eq("poster_id", plan.target.id)
          .eq("category_id", plan.otherCategoryId);
        if (removeOtherError) throw removeOtherError;
      }

      const { error: posterUpdateError } = await supabase
        .from("posters")
        .update({ field_verification: fieldVerification })
        .eq("id", plan.target.id);
      if (posterUpdateError) throw posterUpdateError;

      const { error: evidenceError } = await supabase
        .from("poster_field_evidence")
        .upsert(evidenceRow, { onConflict: "poster_id,field_key,extractor" });
      if (evidenceError) throw evidenceError;

      await supabase.from("admin_actions").insert({
        actor_user_id: null,
        target_type: "poster",
        target_id: plan.target.id,
        action_type: "update",
        action_reason: "other_category_correction",
        metadata_json: {
          extractor: EXTRACTOR,
          previous_category_codes: plan.currentCategories.map((category) => category.code),
          assigned_category_codes: plan.target.codes,
          evidence: plan.target.evidence,
        },
      });
    }

    applied.push({
      id: plan.target.id,
      title: plan.row.title,
      status: plan.row.poster_status,
      previous_codes: plan.currentCategories.map((category) => category.code),
      assigned_codes: plan.target.codes,
      confidence: plan.target.confidence,
      evidence: plan.target.evidence,
    });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    checked: plans.length,
    applied: applied.length,
    skipped: skipped.length,
    applied_items: applied,
    skipped_items: skipped,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
