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
