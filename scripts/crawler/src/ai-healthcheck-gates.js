export const DEFAULT_HEALTHCHECK_THRESHOLDS = Object.freeze({
  min_embedding_coverage_percent: 99,
  min_field_verification_coverage_percent: 45,
  min_image_ai_coverage_percent: 20,
  max_review_queue_reject_candidates: 0,
  max_image_ai_nonposter_count: 0,
  max_image_ai_low_confidence_count: 0,
  max_application_source_key_count: 0,
  max_field_correction_candidates: 0,
  max_nonposter_reject_candidates: 0,
});

const HEALTHCHECK_GATE_DEFINITIONS = [
  {
    metric: "embedding_coverage_percent",
    threshold: "min_embedding_coverage_percent",
    comparison: "min",
  },
  {
    metric: "field_verification_coverage_percent",
    threshold: "min_field_verification_coverage_percent",
    comparison: "min",
  },
  {
    metric: "image_ai_coverage_percent",
    threshold: "min_image_ai_coverage_percent",
    comparison: "min",
  },
  {
    metric: "review_queue_reject_candidates",
    threshold: "max_review_queue_reject_candidates",
    comparison: "max",
  },
  {
    metric: "image_ai_nonposter_count",
    threshold: "max_image_ai_nonposter_count",
    comparison: "max",
  },
  {
    metric: "image_ai_low_confidence_count",
    threshold: "max_image_ai_low_confidence_count",
    comparison: "max",
  },
  {
    metric: "application_source_key_count",
    threshold: "max_application_source_key_count",
    comparison: "max",
  },
  {
    metric: "field_correction_candidates",
    threshold: "max_field_correction_candidates",
    comparison: "max",
  },
  {
    metric: "nonposter_reject_candidates",
    threshold: "max_nonposter_reject_candidates",
    comparison: "max",
  },
];

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateHealthcheckGates(
  summary,
  thresholds = DEFAULT_HEALTHCHECK_THRESHOLDS,
) {
  const violations = [];

  for (const definition of HEALTHCHECK_GATE_DEFINITIONS) {
    const actual = finiteNumber(summary?.[definition.metric]);
    const threshold = finiteNumber(thresholds?.[definition.threshold]);

    if (actual === null || threshold === null) {
      violations.push({
        metric: definition.metric,
        actual,
        comparison: definition.comparison,
        threshold,
        reason: "missing-or-invalid-metric",
      });
      continue;
    }

    const violated =
      definition.comparison === "min" ? actual < threshold : actual > threshold;
    if (violated) {
      violations.push({
        metric: definition.metric,
        actual,
        comparison: definition.comparison,
        threshold,
        reason: "threshold-exceeded",
      });
    }
  }

  return {
    passed: violations.length === 0,
    thresholds,
    violations,
  };
}
