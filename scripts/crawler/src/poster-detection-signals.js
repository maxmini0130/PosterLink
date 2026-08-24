const DATE_TOKEN_RE = /(?:20\d{2}[.\-/년\s]+)?\d{1,2}[.\-/월\s]+\d{1,2}|(?:신청|접수|모집)\s*(?:기간|마감|일정)|D-\d+/i;
const CONTACT_TOKEN_RE = /(?:0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})|[\w.+-]+@[\w.-]+\.\w+|QR|문의|연락처/i;

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length >= 2));
}

export function titleSimilarity(title, text) {
  const titleTokens = tokenSet(title);
  const textTokens = tokenSet(text);
  if (titleTokens.size === 0 || textTokens.size === 0) return 0;
  let hits = 0;
  for (const token of titleTokens) {
    if (textTokens.has(token)) hits += 1;
  }
  return Math.round((hits / titleTokens.size) * 100) / 100;
}

export function extractPosterSignals({
  width,
  height,
  ocrText = "",
  title = "",
  sourceText = "",
  imageClassification = null,
} = {}) {
  const safeWidth = Number(width) || 0;
  const safeHeight = Number(height) || 0;
  const megapixels = safeWidth > 0 && safeHeight > 0
    ? Math.round((safeWidth * safeHeight / 1_000_000) * 1000) / 1000
    : null;
  const aspectRatio = safeWidth > 0 && safeHeight > 0
    ? Math.round((safeHeight / safeWidth) * 100) / 100
    : null;
  const combinedText = [ocrText, sourceText].filter(Boolean).join("\n");
  const visibleTextLength = normalizeText(ocrText).length;
  const textDensity = megapixels && megapixels > 0
    ? Math.round((visibleTextLength / megapixels) * 10) / 10
    : null;
  const similarity = titleSimilarity(title, combinedText);
  const classificationConfidence = Number(imageClassification?.confidence);
  const hasClassifierPoster = imageClassification?.isPoster === true && classificationConfidence >= 0.65;
  const hasClassifierReject = imageClassification?.isPoster === false && classificationConfidence >= 0.8;

  return {
    aspectRatio,
    megapixels,
    ocrTextLength: visibleTextLength,
    textDensity,
    fontSizeVariance: null,
    titleSimilarity: similarity,
    hasDateToken: DATE_TOKEN_RE.test(combinedText),
    hasContactToken: CONTACT_TOKEN_RE.test(combinedText),
    hasClassifierPoster,
    hasClassifierReject,
    classifierConfidence: Number.isFinite(classificationConfidence) ? classificationConfidence : null,
    classifierVisualType: imageClassification?.visualType ?? null,
  };
}

export function decidePosterDetection(signals) {
  const reasons = [];

  if (signals.hasClassifierReject) {
    return {
      isRealPoster: false,
      confidence: Math.max(0.8, signals.classifierConfidence ?? 0.8),
      route: "reject",
      needsVlm: false,
      reasons: ["classifier_reject"],
    };
  }

  if (signals.megapixels !== null && signals.megapixels < 0.05) {
    return {
      isRealPoster: false,
      confidence: 0.9,
      route: "reject",
      needsVlm: false,
      reasons: ["too_small"],
    };
  }

  if (signals.aspectRatio !== null && signals.aspectRatio < 0.4) {
    return {
      isRealPoster: false,
      confidence: 0.85,
      route: "reject",
      needsVlm: false,
      reasons: ["wide_banner"],
    };
  }

  if (
    signals.textDensity !== null &&
    signals.textDensity < 10 &&
    Number(signals.ocrTextLength) > 0 &&
    !signals.hasClassifierPoster
  ) {
    return {
      isRealPoster: false,
      confidence: 0.75,
      route: "reject",
      needsVlm: false,
      reasons: ["low_text_density"],
    };
  }

  if (signals.hasClassifierPoster) reasons.push("classifier_accept");
  if (signals.aspectRatio !== null && signals.aspectRatio >= 1.1 && signals.aspectRatio <= 1.8) {
    reasons.push("poster_aspect_ratio");
  }
  if (signals.textDensity !== null && signals.textDensity >= 40) reasons.push("text_dense");
  if (signals.titleSimilarity >= 0.2) reasons.push("title_overlap");
  if (signals.hasDateToken || signals.hasContactToken) reasons.push("date_or_contact");

  if (
    signals.hasClassifierPoster ||
    (
      reasons.includes("poster_aspect_ratio") &&
      reasons.includes("text_dense") &&
      reasons.includes("title_overlap") &&
      reasons.includes("date_or_contact")
    )
  ) {
    const confidence = signals.hasClassifierPoster
      ? Math.max(0.7, Math.min(0.98, signals.classifierConfidence ?? 0.7))
      : 0.82;
    return {
      isRealPoster: true,
      confidence,
      route: signals.hasClassifierPoster ? "classifier_accept" : "rule_accept",
      needsVlm: false,
      reasons,
    };
  }

  return {
    isRealPoster: null,
    confidence: 0.5,
    route: "needs_vlm",
    needsVlm: true,
    reasons: reasons.length > 0 ? reasons : ["insufficient_signals"],
  };
}

export function buildPosterDetectionEvidence({ posterId, decision, signals }) {
  if (!posterId || decision.isRealPoster === null) return null;
  return {
    poster_id: posterId,
    field_key: "is_real_poster",
    value_text: decision.isRealPoster ? "true" : "false",
    value_json: {
      value: decision.isRealPoster,
      route: decision.route,
      signals,
    },
    confidence: Math.round(decision.confidence * 100) / 100,
    evidence_text: decision.reasons.join(", ").slice(0, 300),
    evidence_src: "rule",
    extractor: "poster-detection-signals-v1",
  };
}
