#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_REVIEW_QUEUE_APPROVAL_20260916";
const REPORT_DEFAULT = "data/results/review-queue-approval-20260916.json";
const REVIEWER = "codex-review-queue-20260916";

const DECISIONS = [
  { id: "b80efd92-eac9-44d1-9cec-f64eb36c8c94", status: "published", appStart: "2026-09-11", appEnd: "2026-09-21", eventStart: "2026-09-22", eventEnd: "2026-09-22", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_BUSINESS"], reason: "K-Startup design-startup seminar application runs 2026-09-11 to 2026-09-21 18:00; seminar is 2026-09-22." },
  { id: "84e366cc-42eb-4295-bceb-a10a36c29e8d", status: "published", appStart: "2026-09-14", appEnd: "2026-09-18", eventStart: "2026-09-30", eventEnd: "2026-10-01", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_BUSINESS"], reason: "Restart healing-camp application runs 2026-09-14 to 2026-09-18 16:00; camp runs 2026-09-30 to 2026-10-01." },
  { id: "07170a0f-db54-41e7-b22f-9c9e90756fd8", status: "published", appStart: "2026-09-08", appEnd: "2026-09-22", eventStart: "2026-12-15", eventEnd: "2026-12-18", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_SUPPORT_PROGRAM"], reason: "Istanbul food fair company recruitment runs 2026-09-08 to 2026-09-22; fair support is for 2026-12-15 to 2026-12-18." },
  { id: "d9688755-b5cc-4ba4-976c-dd2e92f07419", status: "published", appStart: "2026-09-14", deadlineType: "until_exhausted", categories: ["CAT_COURSE", "CAT_CULTURE"], reason: "Songjeong small library tote-bag program opens applications on 2026-09-14 and is first-come; no fixed end date is stated." },
  {
    id: "ce73d81b-ce0a-4fa7-8329-7ea7808f2672",
    status: "published",
    appEnd: "2026-10-12",
    eventStart: "2026-10-13",
    eventEnd: "2026-10-13",
    deadlineType: "fixed",
    categories: ["CAT_RECRUITMENT", "CAT_COURSE"],
    reason: "Dobong job-strategy lecture is on 2026-10-13 and accepts applications until one day before the lecture.",
    links: [
      ["official_apply", "공식 신청 링크", "https://m.site.naver.com/1YGha", true],
      ["other", "멘토 정보", "https://www.itdaa.net/mentors/75494", false],
      ["official_notice", "공식 공고 원문", "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=73973", false],
    ],
  },
  { id: "084189a6-7de3-4da2-88c5-f9a296fc8812", status: "published", appEnd: "2026-09-28", eventStart: "2026-10-14", eventEnd: "2026-10-28", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_RECRUITMENT"], reason: "Dobong Birkman career-course application closes 2026-09-28; course runs 2026-10-14 to 2026-10-28." },
  { id: "00838b09-6646-4e57-b783-45ac75817696", status: "published", eventStart: "2026-09-16", eventEnd: "2026-11-04", deadlineType: "until_exhausted", categories: ["CAT_COURSE", "CAT_CULTURE"], reason: "Yeongdeungpo theater-picture-book program runs 2026-09-16 to 2026-11-04 and is first-come without a fixed application deadline." },
  { id: "c5781d43-f624-4d2d-a786-1c82e86a00a6", status: "published", appStart: "2026-09-10", eventStart: "2026-10-17", eventEnd: "2026-10-17", deadlineType: "until_exhausted", categories: ["CAT_COURSE", "CAT_FAMILY"], reason: "Gwanak couple future-prep class opens applications on 2026-09-10 and is first-come; event is 2026-10-17." },
  { id: "6dcde054-6579-4aa9-9a3d-b71f231da1c1", status: "published", appStart: "2026-09-09", appEnd: "2026-09-27", eventStart: "2026-11-04", eventEnd: "2026-12-27", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"], reason: "Gwanak art fair artist recruitment runs 2026-09-09 to 2026-09-27 24:00; fair runs 2026-11-04 to 2026-12-27." },
  { id: "6e26ab69-9f5d-4005-a694-b1b8a1cb1aeb", status: "published", appEnd: "2026-10-11", eventStart: "2026-10-05", eventEnd: "2026-10-11", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"], reason: "Film Seongsu is a free film festival running 2026-10-05 to 2026-10-11; use final festival day as user-facing deadline." },
  { id: "61616100-8e22-45a1-b8d5-69bd63176ab2", status: "published", eventStart: "2026-10-14", eventEnd: "2026-10-15", deadlineType: "until_exhausted", categories: ["CAT_RECRUITMENT", "CAT_COURSE"], reason: "Seongdong youth-career program runs 2026-10-14 to 2026-10-15; no fixed application deadline is stated, and the stored 2023 date was stale." },
  { id: "30b642c0-0e1d-41a2-a6fa-c6919676441d", status: "published", appEnd: "2026-10-18", eventStart: "2026-09-19", eventEnd: "2026-10-18", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"], reason: "Hipdog Seoul outdoor library events run 2026-09-19 to 2026-09-20 and 2026-10-17 to 2026-10-18." },
  { id: "fff289a2-dd54-499f-b88b-6a6cb49ab2cc", status: "published", appEnd: "2026-09-19", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"], reason: "MAP-O youth festival parent notice is a real event on 2026-09-19; detail events may also be published separately." },
  { id: "bffd68c9-2e35-4f0b-8bc5-d043905d5f8c", status: "published", appEnd: "2026-09-19", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"], reason: "MAP-O silent disco is a separate detailed participation event on 2026-09-19." },
  { id: "1c17f260-4fee-48d8-bc31-71d3a5e33706", status: "published", appStart: "2026-09-08", eventStart: "2026-09-30", eventEnd: "2026-09-30", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT", "CAT_HEALTH"], reason: "Seongbuk stream run and tea-meditation tour recruitment starts 2026-09-08; event is 2026-09-30 and no fixed close date is stated." },
  { id: "99dddb9c-c392-4f38-96f5-7e97aa88c188", status: "published", appEnd: "2026-09-19", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "Yangcheon youth policy package is an open youth event on 2026-09-19." },
  { id: "05940198-4892-4603-a5a8-c4e6a23d4293", status: "published", appStart: "2026-09-14", appEnd: "2026-10-05", eventStart: "2026-10-20", eventEnd: "2026-10-27", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_RECRUITMENT"], reason: "National Library AI prompt course recruitment runs 2026-09-14 to 2026-10-05; course runs 2026-10-20 to 2026-10-27." },
  { id: "9672de53-7aa6-4855-8601-2d87d4e33605", status: "published", appStart: "2026-09-10", appEnd: "2026-09-21", eventStart: "2026-10-01", eventEnd: "2026-11-30", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_SUPPORT_PROGRAM"], reason: "Public-interest activity member recruitment runs 2026-09-10 to 2026-09-21; activity period is October to November 2026." },
  { id: "413e804c-b353-4cf8-b056-6fc23c22215b", title: "SEOUL SAFE 2026 Track B 참가팀 모집", status: "published", appStart: "2026-08-31", appEnd: "2026-09-20", deadlineType: "fixed", categories: ["CAT_CONTEST", "CAT_POLICY_INFO"], reason: "Stored title was generic, but source text is SEOUL SAFE 2026 Track B team recruitment; recruitment runs 2026-08-31 to 2026-09-20." },
  { id: "286e3db5-a549-47fd-96f1-4c0f48e27870", status: "published", appStart: "2026-09-15", appEnd: "2026-09-30", eventStart: "2026-10-06", eventEnd: "2026-10-27", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_RECRUITMENT"], reason: "Gangdong career reading/writing program application runs 2026-09-15 to 2026-09-30; course runs 2026-10-06 to 2026-10-27." },
  { id: "3c92ae3a-8dad-4aff-b02e-7fda54c94866", status: "published", appStart: "2026-09-11", appEnd: "2026-09-25", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Geumcheon one-person household social dining recruitment runs 2026-09-11 to 2026-09-25 16:00." },
  {
    id: "760abd3e-142d-4931-9e8c-3842fcf83c45",
    status: "published",
    appStart: "2026-08-31",
    eventStart: "2026-09-18",
    eventEnd: "2026-09-18",
    deadlineType: "until_exhausted",
    categories: ["CAT_COURSE", "CAT_LIFE_INFO"],
    reason: "Gangseo youth-center finance class accepts applications from 2026-08-31 until capacity fills; event is 2026-09-18.",
    links: [
      ["official_apply", "담당기관 바로가기", "https://forms.gle/3qdj5cXQ3D8akSFk9", true],
      ["official_notice", "공식 공고 원문", "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=73366", false],
    ],
  },
  {
    id: "a02dabc4-ec1f-4aab-9891-cfcd6c3afb6c",
    status: "published",
    deadlineType: "unknown",
    categories: ["CAT_HEALTH", "CAT_SUPPORT_PROGRAM"],
    reason: "Gangseo mental-health counseling voucher is a standing support notice with no confirmed application period; keep deadline unknown rather than inventing an always-open date.",
    links: [["official_notice", "공식 공고 원문", "https://www.gangseo.seoul.kr/health/ht020307", true]],
  },
  { id: "21f32906-9581-4888-9476-ba21727f870a", status: "closed", appStart: "2026-08-25", appEnd: "2026-09-11", eventStart: "2026-10-01", eventEnd: "2026-12-20", deadlineType: "fixed", categories: ["CAT_RECRUITMENT", "CAT_SUPPORT_PROGRAM"], reason: "Jongno youth work project application period was 2026-08-25 to 2026-09-11; it has passed as of 2026-09-16, and the stored 2007 date was the age eligibility cutoff." },
  { id: "abe52050-96a3-4107-b9a8-722be48eb271", status: "published", appEnd: "2026-09-18", eventStart: "2026-09-18", eventEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"], reason: "Gangnam environmental festival is an open public event on 2026-09-18 with no advance application." },
  { id: "a6df0c74-c3af-4dbb-a9c3-3f6d842450a8", status: "published", appEnd: "2026-09-18", eventStart: "2026-09-15", eventEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"], reason: "Seongbuk youth-week event runs 2026-09-15 to 2026-09-18; use final event day as user-facing deadline." },
  { id: "3f53770f-03bf-474c-a2fd-0a70e0e465c2", status: "published", appEnd: "2026-10-02", eventStart: "2026-10-08", eventEnd: "2026-10-08", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_RECRUITMENT"], reason: "Eulji Unique Factory strength-discovery workshop accepts applications until 2026-10-02; workshop is 2026-10-08." },
  { id: "25ccb216-a381-49d9-b225-53da3e7fdf69", status: "published", appStart: "2026-09-10", appEnd: "2026-09-16", eventStart: "2026-09-23", eventEnd: "2026-09-30", deadlineType: "fixed", categories: ["CAT_RECRUITMENT", "CAT_COURSE"], reason: "Gwangjin customized career counseling recruitment runs 2026-09-10 to 2026-09-16; counseling days are 2026-09-23 and 2026-09-30." },
  { id: "c508a637-43df-4836-8601-b95741ca609c", status: "published", appStart: "2026-09-14", appEnd: "2026-09-28", eventStart: "2026-10-01", eventEnd: "2026-12-31", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_LIFE_INFO"], reason: "Seocho lifelong-learning fourth-quarter classes have visible reception period 2026-09-14 to 2026-09-28 and course period in 2026 Q4." },
  { id: "a78393cd-40f6-4cc3-81ad-30ebe4c68a54", status: "published", appStart: "2026-09-10", appEnd: "2026-09-23", eventStart: "2026-09-28", eventEnd: "2026-12-18", deadlineType: "fixed", categories: ["CAT_HEALTH", "CAT_COURSE"], reason: "Visiting first-aid education applications run 2026-09-10 to 2026-09-23; education period is 2026-09-28 to 2026-12-18." },
  { id: "b8c3f4ab-86ad-492e-a149-f854b7552b62", keep: true, reason: "Stored source text is too weak to verify exact program details, dates, and application structure safely." },
  { id: "81f7414a-3290-4a96-b686-27c3e1e548c8", keep: true, reason: "Stored source text is too weak to verify exact program details, dates, and application structure safely." },
];

function parseArgs() {
  return Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }));
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Supabase URL and service role key are required");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "posterlink-review-approval-20260916" } },
  });
}

const toKstStart = (date) => (date ? `${date}T00:00:00+09:00` : null);
const toKstEnd = (date) => (date ? `${date}T23:59:59+09:00` : null);
const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

function mergeVerification(row, decision, categoryNamesByCode) {
  const now = new Date().toISOString();
  const verification = { ...asObject(row.field_verification) };
  verification.dateIssues = decision.keep ? verification.dateIssues : [];
  verification.classificationIssues = decision.keep ? verification.classificationIssues : [];
  verification.deadlineMatches = !decision.keep;
  verification.decision = decision.keep ? "review" : decision.status === "closed" ? "closed" : "approved";
  verification.reason = `AI direct queue review ${decision.keep ? "kept in review" : decision.status}: ${decision.reason}`;
  verification.dateQuality = {
    ...asObject(verification.dateQuality),
    decision: decision.keep ? "review" : "pass",
    storedDeadline: decision.appEnd ?? null,
    normalizedDeadline: decision.appEnd ?? null,
    suggestedDeadline: decision.appEnd ?? null,
    reviewedAt: now,
    reviewedBy: REVIEWER,
  };
  verification.classification = {
    ...asObject(verification.classification),
    categoryCodes: decision.categories ?? [],
    primaryCategory: decision.categories?.[0] ?? null,
    categories: (decision.categories ?? []).map((code) => ({
      code,
      label: categoryNamesByCode.get(code) ?? code,
      confidence: 0.9,
      evidence: decision.reason,
      source: REVIEWER,
    })),
    confidence: decision.keep ? 0.5 : 0.9,
    reason: decision.reason,
    updatedBy: REVIEWER,
    updatedAt: now,
  };
  verification.aiQueueReview = {
    reviewer: "codex",
    reviewedAt: now,
    todayKst: "2026-09-16",
    approve: !decision.keep,
    finalStatus: decision.keep ? "review" : decision.status,
    finalDeadlineType: decision.deadlineType ?? null,
    finalApplicationStartAt: decision.appStart ?? null,
    finalApplicationEndAt: decision.appEnd ?? null,
    finalEventStartAt: decision.eventStart ?? null,
    finalEventEndAt: decision.eventEnd ?? null,
    finalCategories: decision.categories ?? [],
    reason: decision.reason,
  };
  return verification;
}

async function replaceCategories(supabase, decision, categoryByCode) {
  const { error: deleteError } = await supabase.from("poster_categories").delete().eq("poster_id", decision.id);
  if (deleteError) throw deleteError;
  const rows = decision.categories.map((code) => ({ poster_id: decision.id, category_id: categoryByCode.get(code).id }));
  const { error: insertError } = await supabase.from("poster_categories").insert(rows);
  if (insertError) throw insertError;
}

async function replaceLinks(supabase, decision) {
  if (!decision.links) return;
  const { error: deleteError } = await supabase.from("poster_links").delete().eq("poster_id", decision.id);
  if (deleteError) throw deleteError;
  const rows = decision.links.map(([linkType, title, url, isPrimary]) => ({
    poster_id: decision.id,
    link_type: linkType,
    title,
    url,
    is_primary: Boolean(isPrimary),
  }));
  const { error: insertError } = await supabase.from("poster_links").insert(rows);
  if (insertError) throw insertError;
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  if (apply && args.confirm !== CONFIRM_TOKEN) throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);

  const supabase = createSupabase();
  const ids = DECISIONS.map((decision) => decision.id);
  const [{ data: rows, error: rowsError }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase.from("posters").select("id,title,poster_status,field_verification").in("id", ids),
    supabase.from("categories").select("id,code,name"),
  ]);
  if (rowsError) throw rowsError;
  if (categoriesError) throw categoriesError;

  const rowById = new Map((rows ?? []).map((row) => [row.id, row]));
  const categoryByCode = new Map((categories ?? []).map((row) => [row.code, row]));
  const categoryNamesByCode = new Map((categories ?? []).map((row) => [row.code, row.name]));
  const missing = ids.filter((id) => !rowById.has(id));
  if (missing.length) throw new Error(`Missing posters: ${missing.join(", ")}`);

  const applied = [];
  const kept = [];
  const skipped = [];
  for (const decision of DECISIONS) {
    const row = rowById.get(decision.id);
    if (row.poster_status !== "review") {
      skipped.push({ id: decision.id, title: row.title, status: row.poster_status, reason: "not_review" });
      continue;
    }
    if (decision.keep) {
      kept.push({ id: decision.id, title: row.title, reason: decision.reason });
      continue;
    }
    for (const code of decision.categories ?? []) {
      if (!categoryByCode.has(code)) throw new Error(`Unknown category ${code} for ${decision.id}`);
    }
    if (!apply) {
      applied.push({ id: decision.id, title: decision.title ?? row.title, plannedStatus: decision.status, categories: decision.categories, reason: decision.reason, dryRun: true });
      continue;
    }

    const posterUpdate = {
      poster_status: decision.status,
      published_at: decision.status === "published" ? new Date().toISOString() : null,
      rejection_reason: null,
      application_start_at: toKstStart(decision.appStart),
      application_end_at: toKstEnd(decision.appEnd),
      event_start_at: toKstStart(decision.eventStart),
      event_end_at: toKstEnd(decision.eventEnd),
      deadline_type: decision.deadlineType,
      field_verification: mergeVerification(row, decision, categoryNamesByCode),
    };
    if (decision.title) posterUpdate.title = decision.title;

    const { data: updated, error: updateError } = await supabase
      .from("posters")
      .update(posterUpdate)
      .eq("id", decision.id)
      .eq("poster_status", "review")
      .select("id,title,poster_status,application_start_at,application_end_at,event_start_at,event_end_at,deadline_type")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      skipped.push({ id: decision.id, title: row.title, reason: "update_race" });
      continue;
    }
    await replaceCategories(supabase, decision, categoryByCode);
    await replaceLinks(supabase, decision);
    applied.push({ ...updated, category_codes: decision.categories, reason: decision.reason });
  }

  if (apply && applied.length > 0) {
    const { error } = await supabase.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "review_queue_approval_20260916",
      metadata_json: { reviewed_by: "codex", applied_count: applied.length, kept_review_count: kept.length, skipped_count: skipped.length, cleaned_link_count: DECISIONS.filter((d) => d.links).length, no_exposure_tier_changes: true },
    });
    if (error) throw error;
  }

  const report = { generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry-run", input_count: DECISIONS.length, applied_count: applied.length, kept_review_count: kept.length, skipped_count: skipped.length, kept, skipped, applied };
  const output = path.resolve(args.output ?? REPORT_DEFAULT);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ output: path.relative(process.cwd(), output), mode: report.mode, input_count: report.input_count, applied_count: report.applied_count, kept_review_count: report.kept_review_count, skipped_count: report.skipped_count }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
