export const AI_MODEL_STAGES = Object.freeze({
  rule: Object.freeze({
    stage: 0,
    label: "rule",
    model: "none",
    defaultUnitCost: 0,
  }),
  cheap_text: Object.freeze({
    stage: 1,
    label: "cheap_text",
    model: process.env.OPENAI_POSTER_CHEAP_TEXT_MODEL?.trim() || "gpt-5-mini",
    defaultUnitCost: 1,
  }),
  high_text: Object.freeze({
    stage: 2,
    label: "high_text",
    model: process.env.OPENAI_POSTER_HIGH_TEXT_MODEL?.trim() || "gpt-5",
    defaultUnitCost: 10,
  }),
  vlm: Object.freeze({
    stage: 3,
    label: "vlm",
    model: process.env.OPENAI_POSTER_VLM_MODEL?.trim() || "gpt-5-mini",
    defaultUnitCost: 25,
  }),
});

const RULE_FIELDS = new Set([
  "deadline_date",
  "deadline_type",
  "apply_start",
  "official_url",
  "apply_url",
  "cost",
  "contact",
  "capacity",
]);

const CHEAP_TEXT_FIELDS = new Set([
  "category",
  "region",
  "content_type",
  "target_desc",
  "benefit",
  "apply_method",
  "venue",
]);

const HIGH_TEXT_FIELDS = new Set([
  "host_org",
  "age_min",
  "age_max",
]);

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function stageByLabel(label) {
  return AI_MODEL_STAGES[label] ?? AI_MODEL_STAGES.high_text;
}

export function fieldDefaultStage(fieldKey) {
  if (fieldKey === "is_real_poster") return AI_MODEL_STAGES.vlm;
  if (RULE_FIELDS.has(fieldKey)) return AI_MODEL_STAGES.rule;
  if (CHEAP_TEXT_FIELDS.has(fieldKey)) return AI_MODEL_STAGES.cheap_text;
  if (HIGH_TEXT_FIELDS.has(fieldKey)) return AI_MODEL_STAGES.high_text;
  return AI_MODEL_STAGES.high_text;
}

export function chooseAiStage({
  fieldKey,
  confidence = null,
  threshold = 0.9,
  hasRuleCandidate = false,
  needsVlm = false,
  critical = false,
} = {}) {
  if (fieldKey === "is_real_poster") {
    return needsVlm
      ? { ...AI_MODEL_STAGES.vlm, reason: "poster_detection_needs_vlm" }
      : { ...AI_MODEL_STAGES.rule, reason: "poster_detection_rule_or_existing_signal" };
  }

  const defaultStage = fieldDefaultStage(fieldKey);
  if (defaultStage.label === "rule") {
    return { ...AI_MODEL_STAGES.rule, reason: hasRuleCandidate ? "rule_candidate_available" : "rule_first_field" };
  }

  const safeConfidence = confidence === null || confidence === undefined ? null : clamp(confidence);
  if (safeConfidence !== null && safeConfidence >= threshold) {
    return { ...AI_MODEL_STAGES.rule, reason: "existing_evidence_above_threshold" };
  }

  if (critical && defaultStage.stage < AI_MODEL_STAGES.high_text.stage) {
    return { ...AI_MODEL_STAGES.high_text, reason: "critical_field_escalation" };
  }

  return { ...defaultStage, reason: `${defaultStage.label}_field_default` };
}

function parseUnitCosts() {
  const configured = process.env.POSTER_AI_STAGE_UNIT_COSTS?.trim();
  if (!configured) return {};
  try {
    const parsed = JSON.parse(configured);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function estimateAiUnitCost({ stageLabel, calls = 1, inputTokens = 0, outputTokens = 0, imageCount = 0 } = {}) {
  const stage = stageByLabel(stageLabel);
  const configuredCosts = parseUnitCosts();
  const unitCost = Number(configuredCosts[stage.label] ?? stage.defaultUnitCost);
  const tokenUnits = Math.max(1, Math.ceil((Number(inputTokens) + Number(outputTokens)) / 1000) || 1);
  const imageUnits = Math.max(0, Number(imageCount) || 0);
  const callCount = Math.max(0, Number(calls) || 0);
  const weightedUnits = stage.label === "vlm" ? Math.max(tokenUnits, imageUnits, 1) : tokenUnits;
  return Math.round(unitCost * weightedUnits * callCount * 100) / 100;
}

export function buildAiUsageLogRow({
  jobName,
  stageLabel,
  model = null,
  operation,
  posterId = null,
  fieldKey = null,
  status = "success",
  inputTokens = null,
  outputTokens = null,
  imageCount = 0,
  unitCost = null,
  metadata = {},
} = {}) {
  const stage = stageByLabel(stageLabel);
  return {
    job_name: jobName ?? "posterlink-ai",
    stage: stage.stage,
    stage_label: stage.label,
    model: model ?? stage.model,
    operation: operation ?? fieldKey ?? "unknown",
    poster_id: posterId,
    field_key: fieldKey,
    status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    image_count: imageCount,
    estimated_unit_cost: unitCost ?? estimateAiUnitCost({ stageLabel: stage.label, inputTokens, outputTokens, imageCount }),
    metadata,
  };
}
