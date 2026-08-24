export const FIELD_IMPORTANCE = Object.freeze({
  deadline_date: "critical",
  deadline_type: "critical",
  host_org: "critical",
  official_url: "critical",
  is_real_poster: "critical",
  apply_start: "major",
  category: "major",
  region: "major",
  age_min: "minor",
  age_max: "minor",
  target_desc: "minor",
  benefit: "minor",
  apply_method: "minor",
  apply_url: "minor",
  cost: "minor",
  contact: "minor",
  capacity: "minor",
  venue: "minor",
});

export const THRESHOLD_STEPS = Object.freeze([
  0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5,
  0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1,
]);

function normalizeForMatch(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function normalizeDate(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function predictionValue(row) {
  const json = row?.value_json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    if (json.date) return json.date;
    if (json.url) return json.url;
    if (json.name) return json.name;
    if (json.type) return json.type;
    if (json.min !== undefined) return json.min;
    if (json.max !== undefined) return json.max;
    if (json.value !== undefined) return json.value;
  }
  return row?.value_text ?? null;
}

export function valuesMatch(fieldKey, predicted, truth) {
  if (truth === undefined) return null;
  if (truth === null || truth === "") return predicted === null || predicted === undefined || predicted === "";

  if (["deadline_date", "apply_start"].includes(fieldKey)) {
    return normalizeDate(predicted) === normalizeDate(truth);
  }

  if (["age_min", "age_max", "capacity"].includes(fieldKey)) {
    return normalizeNumber(predicted) === normalizeNumber(truth);
  }

  if (["official_url", "apply_url"].includes(fieldKey)) {
    return String(predicted ?? "").trim().replace(/\/$/, "") === String(truth ?? "").trim().replace(/\/$/, "");
  }

  if (typeof truth === "boolean") {
    return Boolean(predicted) === truth;
  }

  const normalizedPredicted = normalizeForMatch(predicted);
  const normalizedTruth = normalizeForMatch(truth);
  if (!normalizedPredicted || !normalizedTruth) return false;
  return normalizedPredicted.includes(normalizedTruth) || normalizedTruth.includes(normalizedPredicted);
}

export function bestEvidenceByField(rows = []) {
  const byField = new Map();
  for (const row of rows) {
    const fieldKey = row?.field_key;
    if (!fieldKey) continue;
    const existing = byField.get(fieldKey);
    if (!existing || Number(row.confidence ?? 0) > Number(existing.confidence ?? 0)) {
      byField.set(fieldKey, row);
    }
  }
  return byField;
}

export function evaluateGoldenSet(goldens = [], evidenceRows = []) {
  const evidenceByPoster = new Map();
  for (const row of evidenceRows) {
    const list = evidenceByPoster.get(row.poster_id) ?? [];
    list.push(row);
    evidenceByPoster.set(row.poster_id, list);
  }

  const fieldResults = new Map();
  const observations = [];

  for (const golden of goldens) {
    const posterId = golden.poster_id ?? golden.posterId;
    const truth = golden.truth ?? {};
    const bestByField = bestEvidenceByField(evidenceByPoster.get(posterId) ?? []);

    for (const [fieldKey, truthValue] of Object.entries(truth)) {
      if (!(fieldKey in FIELD_IMPORTANCE)) continue;
      const prediction = bestByField.get(fieldKey) ?? null;
      const predicted = predictionValue(prediction);
      const matched = valuesMatch(fieldKey, predicted, truthValue);
      if (matched === null) continue;

      const observation = {
        poster_id: posterId,
        field_key: fieldKey,
        importance: FIELD_IMPORTANCE[fieldKey],
        truth: truthValue,
        predicted,
        confidence: prediction ? Number(prediction.confidence ?? 0) : null,
        correct: matched,
        has_prediction: Boolean(prediction),
        evidence_text: prediction?.evidence_text ?? null,
        extractor: prediction?.extractor ?? null,
      };
      observations.push(observation);

      const metric = fieldResults.get(fieldKey) ?? {
        field_key: fieldKey,
        importance: FIELD_IMPORTANCE[fieldKey],
        labeled: 0,
        predicted: 0,
        correct: 0,
        missing: 0,
        false_positive: 0,
        thresholds: {},
      };
      metric.labeled += 1;
      if (prediction) metric.predicted += 1;
      else metric.missing += 1;
      if (matched) metric.correct += 1;
      if (prediction && (truthValue === null || truthValue === "")) metric.false_positive += 1;
      fieldResults.set(fieldKey, metric);
    }
  }

  const fieldMetrics = {};
  for (const [fieldKey, metric] of fieldResults.entries()) {
    const fieldObservations = observations.filter((item) => item.field_key === fieldKey);
    for (const threshold of THRESHOLD_STEPS) {
      const above = fieldObservations.filter(
        (item) => item.confidence !== null && item.confidence >= threshold,
      );
      const correctAbove = above.filter((item) => item.correct).length;
      metric.thresholds[threshold.toFixed(2)] = {
        predictions: above.length,
        correct: correctAbove,
        precision: above.length > 0 ? correctAbove / above.length : null,
        coverage: metric.labeled > 0 ? above.length / metric.labeled : null,
      };
    }
    metric.accuracy = metric.labeled > 0 ? metric.correct / metric.labeled : null;
    metric.prediction_coverage = metric.labeled > 0 ? metric.predicted / metric.labeled : null;
    metric.hallucination_rate = metric.predicted > 0 ? metric.false_positive / metric.predicted : null;
    metric.recommended_threshold = recommendThreshold(metric);
    fieldMetrics[fieldKey] = metric;
  }

  const labeledFields = Object.values(fieldMetrics);
  const macroAccuracy = labeledFields.length > 0
    ? labeledFields.reduce((sum, metric) => sum + (metric.accuracy ?? 0), 0) / labeledFields.length
    : null;

  return {
    labeled_posters: goldens.length,
    labeled_field_count: observations.length,
    macro_accuracy: macroAccuracy,
    field_metrics: fieldMetrics,
    observations,
  };
}

export function recommendThreshold(metric) {
  const target = metric.importance === "critical" ? 0.98 : 0.9;
  for (const [threshold, values] of Object.entries(metric.thresholds)) {
    if (values.predictions > 0 && values.precision !== null && values.precision >= target) {
      return {
        threshold: Number(threshold),
        target_precision: target,
        precision: values.precision,
        coverage: values.coverage,
        predictions: values.predictions,
      };
    }
  }
  return {
    threshold: null,
    target_precision: target,
    precision: null,
    coverage: null,
    predictions: 0,
  };
}
