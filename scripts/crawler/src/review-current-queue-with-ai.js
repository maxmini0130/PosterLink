#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { CATEGORY_CODE_BY_LABEL } from "./poster-category-classifier.js";

const TODAY_KST = process.env.REVIEW_TODAY_KST || "2026-09-09";
const MODEL = process.env.OPENAI_REVIEW_QUEUE_MODEL?.trim() || process.env.OPENAI_POSTER_CATEGORY_MODEL?.trim() || "gpt-5-mini";
const OUTPUT_DEFAULT = `data/results/review-queue-ai-review-${TODAY_KST.replaceAll("-", "")}.json`;
const CONFIRM_TOKEN = "AI_REVIEW_APPROVE_QUEUE";
const REVIEW_BATCH_SIZE = 15;
const VALID_DEADLINE_TYPES = ["fixed", "ongoing", "until_exhausted", "unknown"];
const VALID_CATEGORY_LABELS = Object.keys(CATEGORY_CODE_BY_LABEL);

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
    global: { headers: { "X-Client-Info": "posterlink-ai-review-queue" } },
  });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compact(value, maxLength = 2400) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeDateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/20\d{2}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function toKstStart(date) {
  return date ? `${date}T00:00:00+09:00` : null;
}

function toKstEnd(date) {
  return date ? `${date}T23:59:59+09:00` : null;
}

function normalizeLabels(labels) {
  return [...new Set(asArray(labels).filter((label) => VALID_CATEGORY_LABELS.includes(label)))].slice(0, 2);
}

function issueCodes(verification, key) {
  return asArray(verification[key]).map((issue) => issue?.code).filter(Boolean);
}

function deriveStatus(decision) {
  if (decision.status === "published" || decision.status === "closed") return decision.status;
  const end = decision.application_end_at ?? decision.event_end_at ?? decision.event_start_at;
  return end && end < TODAY_KST ? "closed" : "published";
}

async function fetchReviewRows(supabase, limit) {
  const { data, error } = await supabase
    .from("posters")
    .select(`
      id,title,source_org_name,organizer_name,application_organization_name,
      poster_status,application_start_at,application_end_at,event_start_at,event_end_at,
      deadline_type,source_key,summary_short,summary_long,field_verification,created_at,
      poster_links(url,title,link_type,is_primary),
      poster_categories(category_id,categories(code,name))
    `)
    .eq("poster_status", "review")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function fetchCategories(supabase) {
  const { data, error } = await supabase.from("categories").select("id,code,name");
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.code, row]));
}

function buildReviewInput(row) {
  const verification = asObject(row.field_verification);
  const readableNotice = asObject(verification.readableNotice);
  return {
    id: row.id,
    title: row.title,
    source_org_name: row.source_org_name,
    organizer_name: row.organizer_name,
    current_dates: {
      application_start_at: normalizeDateOnly(row.application_start_at),
      application_end_at: normalizeDateOnly(row.application_end_at),
      event_start_at: normalizeDateOnly(row.event_start_at),
      event_end_at: normalizeDateOnly(row.event_end_at),
      deadline_type: row.deadline_type,
    },
    current_categories: (row.poster_categories ?? []).map((entry) => entry.categories?.name).filter(Boolean),
    source_key: row.source_key,
    links: (row.poster_links ?? []).map((link) => ({
      type: link.link_type,
      title: link.title,
      url: link.url,
      primary: Boolean(link.is_primary),
    })),
    ai_issues: {
      date: issueCodes(verification, "dateIssues"),
      duplicate: issueCodes(verification, "duplicateIssues"),
      quality: issueCodes(verification, "qualityIssues"),
      classification: issueCodes(verification, "classificationIssues"),
    },
    stored_ai_classification: asObject(verification.classification),
    readable_facts: readableNotice.facts ?? null,
    readable_summary: readableNotice.summaryShort ?? null,
    summary_short: row.summary_short,
    source_text: compact(row.summary_long, 3600),
  };
}

function promptFor(items) {
  return [
    "You review Korean public-opportunity notice records for PosterLink.",
    `Today is ${TODAY_KST} in Asia/Seoul.`,
    "Read each item directly from the stored source text, readable facts, current AI evidence, and official links.",
    "Approve only if the notice is a real useful public opportunity/event/recruitment/application record and the date/category decision is safe.",
    "Be strict about dates: separate application/recruitment deadline from event/class/program dates. If there is only an event date for an open public event, use that date as the user-facing deadline and keep the event date too.",
    "Use closed status when the final deadline or event has already passed. Use published when it is still active. Do not invent always-open deadlines.",
    "Use at most two categories. Representative category must be first.",
    "",
    "Allowed deadline_type values: fixed, ongoing, until_exhausted, unknown.",
    `Allowed categories: ${VALID_CATEGORY_LABELS.join(", ")}.`,
    "",
    "Return JSON only.",
    JSON.stringify({ items }, null, 2),
  ].join("\n");
}

async function reviewBatch(items) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for AI queue review");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(90000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: promptFor(items) }] }],
      text: {
        format: {
          type: "json_schema",
          name: "posterlink_review_queue_decisions",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              decisions: {
                type: "array",
                minItems: items.length,
                maxItems: items.length,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    approve: { type: "boolean" },
                    status: { type: "string", enum: ["published", "closed", "keep_review"] },
                    application_start_at: { type: ["string", "null"] },
                    application_end_at: { type: ["string", "null"] },
                    event_start_at: { type: ["string", "null"] },
                    event_end_at: { type: ["string", "null"] },
                    deadline_type: { type: "string", enum: VALID_DEADLINE_TYPES },
                    category_labels: {
                      type: "array",
                      minItems: 1,
                      maxItems: 2,
                      items: { type: "string", enum: VALID_CATEGORY_LABELS },
                    },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    reason: { type: "string" },
                    concerns: { type: "array", items: { type: "string" }, maxItems: 4 },
                  },
                  required: [
                    "id",
                    "approve",
                    "status",
                    "application_start_at",
                    "application_end_at",
                    "event_start_at",
                    "event_end_at",
                    "deadline_type",
                    "category_labels",
                    "confidence",
                    "reason",
                    "concerns",
                  ],
                },
              },
            },
            required: ["decisions"],
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const outputText = payload.output_text
    ?? payload.output?.flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("\n")
    ?? "";
  return JSON.parse(outputText).decisions ?? [];
}

async function buildPlan(rows) {
  const decisions = [];
  for (let index = 0; index < rows.length; index += REVIEW_BATCH_SIZE) {
    const batch = rows.slice(index, index + REVIEW_BATCH_SIZE);
    console.error(`[ai-review] reviewing ${index + 1}-${index + batch.length}/${rows.length}`);
    decisions.push(...await reviewBatch(batch.map(buildReviewInput)));
  }

  const rowById = new Map(rows.map((row) => [row.id, row]));
  return decisions.map((decision) => {
    const row = rowById.get(decision.id);
    const labels = normalizeLabels(decision.category_labels);
    const nextCodes = labels.map((label) => CATEGORY_CODE_BY_LABEL[label]).filter(Boolean);
    const normalizedDecision = {
      ...decision,
      status: decision.approve ? deriveStatus(decision) : "keep_review",
      application_start_at: normalizeDateOnly(decision.application_start_at),
      application_end_at: normalizeDateOnly(decision.application_end_at),
      event_start_at: normalizeDateOnly(decision.event_start_at),
      event_end_at: normalizeDateOnly(decision.event_end_at),
      deadline_type: VALID_DEADLINE_TYPES.includes(decision.deadline_type) ? decision.deadline_type : "unknown",
      category_labels: labels,
      category_codes: nextCodes,
    };
    const currentCodes = (row?.poster_categories ?? []).map((entry) => entry.categories?.code).filter(Boolean);
    return {
      id: decision.id,
      title: row?.title ?? "",
      source_key: row?.source_key ?? "",
      current: {
        status: row?.poster_status ?? null,
        application_start_at: normalizeDateOnly(row?.application_start_at),
        application_end_at: normalizeDateOnly(row?.application_end_at),
        event_start_at: normalizeDateOnly(row?.event_start_at),
        event_end_at: normalizeDateOnly(row?.event_end_at),
        deadline_type: row?.deadline_type ?? null,
        category_codes: currentCodes,
        category_labels: (row?.poster_categories ?? []).map((entry) => entry.categories?.name).filter(Boolean),
      },
      decision: normalizedDecision,
      changed: Boolean(row) && (
        row.poster_status !== normalizedDecision.status
        || normalizeDateOnly(row.application_start_at) !== normalizedDecision.application_start_at
        || normalizeDateOnly(row.application_end_at) !== normalizedDecision.application_end_at
        || normalizeDateOnly(row.event_start_at) !== normalizedDecision.event_start_at
        || normalizeDateOnly(row.event_end_at) !== normalizedDecision.event_end_at
        || row.deadline_type !== normalizedDecision.deadline_type
        || currentCodes.slice().sort().join(",") !== nextCodes.slice().sort().join(",")
      ),
      applyable: Boolean(row) && normalizedDecision.approve && normalizedDecision.confidence >= 0.7 && nextCodes.length > 0,
    };
  });
}

function mergeFieldVerification(row, plan) {
  const verification = { ...asObject(row.field_verification) };
  const now = new Date().toISOString();
  verification.dateIssues = [];
  verification.classificationIssues = [];
  verification.deadlineMatches = true;
  verification.decision = "approved";
  verification.reason = compact(`AI 재검수 승인: ${plan.decision.reason}`, 700);
  verification.dateQuality = {
    ...asObject(verification.dateQuality),
    decision: "pass",
    storedDeadline: plan.decision.application_end_at,
    normalizedDeadline: plan.decision.application_end_at,
    suggestedDeadline: plan.decision.application_end_at,
    reviewedAt: now,
    reviewedBy: "ai-review-current-queue-20260909",
  };
  verification.classification = {
    ...asObject(verification.classification),
    categoryCodes: plan.decision.category_codes,
    primaryCategory: plan.decision.category_codes[0] ?? null,
    categories: plan.decision.category_codes.map((code, index) => ({
      code,
      label: plan.decision.category_labels[index],
      confidence: plan.decision.confidence,
      evidence: plan.decision.reason,
      source: "ai-review-current-queue",
      model: MODEL,
    })),
    confidence: plan.decision.confidence,
    reason: plan.decision.reason,
    model: MODEL,
    updatedBy: "ai-review-current-queue",
    updatedAt: now,
  };
  verification.aiQueueReview = {
    reviewer: "codex",
    model: MODEL,
    reviewedAt: now,
    todayKst: TODAY_KST,
    approve: plan.decision.approve,
    finalStatus: plan.decision.status,
    finalDeadlineType: plan.decision.deadline_type,
    finalApplicationStartAt: plan.decision.application_start_at,
    finalApplicationEndAt: plan.decision.application_end_at,
    finalEventStartAt: plan.decision.event_start_at,
    finalEventEndAt: plan.decision.event_end_at,
    finalCategories: plan.decision.category_labels,
    reason: plan.decision.reason,
    concerns: plan.decision.concerns,
  };
  return verification;
}

async function applyPlan(supabase, rows, categoryByCode, plan) {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const applied = [];
  for (const item of plan.filter((entry) => entry.applyable)) {
    const row = rowById.get(item.id);
    const posterUpdate = {
      poster_status: item.decision.status,
      published_at: new Date().toISOString(),
      rejection_reason: null,
      application_start_at: toKstStart(item.decision.application_start_at),
      application_end_at: toKstEnd(item.decision.application_end_at),
      event_start_at: toKstStart(item.decision.event_start_at),
      event_end_at: toKstEnd(item.decision.event_end_at),
      deadline_type: item.decision.deadline_type,
      field_verification: mergeFieldVerification(row, item),
    };
    const { data, error } = await supabase
      .from("posters")
      .update(posterUpdate)
      .eq("id", item.id)
      .eq("poster_status", "review")
      .select("id,title,poster_status,application_end_at,deadline_type")
      .maybeSingle();
    if (error) throw error;
    if (!data) continue;

    const { error: deleteError } = await supabase.from("poster_categories").delete().eq("poster_id", item.id);
    if (deleteError) throw deleteError;
    const categoryRows = item.decision.category_codes.map((code) => ({
      poster_id: item.id,
      category_id: categoryByCode.get(code)?.id,
    })).filter((entry) => entry.category_id);
    const { error: insertError } = await supabase.from("poster_categories").insert(categoryRows);
    if (insertError) throw insertError;

    applied.push(data);
  }

  if (applied.length > 0) {
    const { error } = await supabase.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "ai_review_current_queue",
      metadata_json: {
        reviewed_by: "codex",
        model: MODEL,
        today_kst: TODAY_KST,
        reviewed_count: plan.length,
        applied_count: applied.length,
        kept_review_count: plan.filter((item) => !item.applyable).length,
      },
    });
    if (error) throw error;
  }
  return applied;
}

async function main() {
  const args = parseArgs();
  const limit = Math.max(1, Number(args.limit ?? 200));
  const apply = args.apply === "1" || args.apply === "true";
  if (apply && args.confirm !== CONFIRM_TOKEN) {
    throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);
  }

  const supabase = createSupabase();
  const [rows, categoryByCode] = await Promise.all([
    fetchReviewRows(supabase, limit),
    fetchCategories(supabase),
  ]);
  const plan = await buildPlan(rows);
  const applied = apply ? await applyPlan(supabase, rows, categoryByCode, plan) : [];
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    today_kst: TODAY_KST,
    model: MODEL,
    review_count: rows.length,
    approve_count: plan.filter((item) => item.decision.approve).length,
    applyable_count: plan.filter((item) => item.applyable).length,
    applied_count: applied.length,
    kept_review_count: plan.filter((item) => !item.applyable).length,
    status_counts: plan.reduce((acc, item) => {
      const status = item.applyable ? item.decision.status : "keep_review";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {}),
    category_changes: plan.filter((item) =>
      item.current.category_codes.slice().sort().join(",") !== item.decision.category_codes.slice().sort().join(",")
    ).length,
    date_changes: plan.filter((item) =>
      item.current.application_start_at !== item.decision.application_start_at
      || item.current.application_end_at !== item.decision.application_end_at
      || item.current.event_start_at !== item.decision.event_start_at
      || item.current.event_end_at !== item.decision.event_end_at
      || item.current.deadline_type !== item.decision.deadline_type
    ).length,
    items: plan,
  };
  const output = path.resolve(args.output ?? OUTPUT_DEFAULT);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output: path.relative(process.cwd(), output),
    mode: report.mode,
    review_count: report.review_count,
    approve_count: report.approve_count,
    applyable_count: report.applyable_count,
    applied_count: report.applied_count,
    kept_review_count: report.kept_review_count,
    status_counts: report.status_counts,
    category_changes: report.category_changes,
    date_changes: report.date_changes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
