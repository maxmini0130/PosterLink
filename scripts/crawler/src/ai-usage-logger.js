import { buildAiUsageLogRow } from "./ai-model-routing.js";

function shouldLogAiUsage() {
  return process.env.POSTER_AI_USAGE_LOG !== "0";
}

export async function logAiUsage(supabase, row) {
  if (!shouldLogAiUsage() || !supabase || !row) {
    return { status: "skipped", reason: "disabled_or_missing_client" };
  }

  const { error } = await supabase.from("ai_usage_log").insert(row);
  if (error) {
    return { status: "failed", error: error.message };
  }
  return { status: "logged" };
}

export function attachAiUsageMetadata(result, usage) {
  if (!result || typeof result !== "object" || !usage) return result;

  Object.defineProperty(result, "__aiUsage", {
    value: usage,
    enumerable: false,
    configurable: true,
  });
  return result;
}

export function extractAiUsageMetadata(result) {
  return result && typeof result === "object" ? result.__aiUsage ?? null : null;
}

export function buildTextModelUsageRow({
  jobName = "crawler-upload",
  stageLabel = "cheap_text",
  posterId,
  model,
  operation,
  fieldKey = null,
  status = "success",
  inputTokens = null,
  outputTokens = null,
  metadata = {},
} = {}) {
  return buildAiUsageLogRow({
    jobName,
    stageLabel,
    model,
    operation,
    posterId,
    fieldKey,
    status,
    inputTokens,
    outputTokens,
    imageCount: 0,
    metadata,
  });
}

export function buildImageClassificationUsageRow({ posterId, model, status = "success", metadata = {} } = {}) {
  return buildAiUsageLogRow({
    jobName: "image-classification-backfill",
    stageLabel: "vlm",
    model,
    operation: "is_real_poster",
    posterId,
    fieldKey: "is_real_poster",
    status,
    inputTokens: null,
    outputTokens: null,
    imageCount: 1,
    metadata,
  });
}

export function buildTextVerificationUsageRow({
  posterId,
  model,
  operation = "field_verification",
  fieldKey = null,
  status = "success",
  inputTokens = null,
  outputTokens = null,
  metadata = {},
} = {}) {
  return buildTextModelUsageRow({
    jobName: "field-verification-backfill",
    stageLabel: "high_text",
    model,
    operation,
    posterId,
    fieldKey,
    status,
    inputTokens,
    outputTokens,
    imageCount: 0,
    metadata,
  });
}
