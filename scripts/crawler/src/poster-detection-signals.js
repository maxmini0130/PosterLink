const DATE_TOKEN_RE = /(?:20\d{2}\s*(?:년|[.\-/])\s*)?\d{1,2}\s*(?:월|[.\-/])\s*\d{1,2}\s*(?:일)?|(?:\uC2E0\uCCAD|\uC811\uC218|\uBAA8\uC9D1)\s*(?:\uAE30\uAC04|\uB9C8\uAC10|\uC77C\uC815)|D-\d+/i;
const CONTACT_TOKEN_RE = /(?:0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})|[\w.+-]+@[\w.-]+\.\w+|QR|\uBB38\uC758|\uC5F0\uB77D\uCC98/i;
const NON_POSTER_NOTICE_RE = new RegExp([
  "QA\\s*(?:\\uD14C\\uC2A4\\uD2B8)?",
  "\\uBBFC\\uBC29\\uC704",
  "\\uAD50\\uC721\\s*\\uBC0F\\s*\\uD1B5\\uC9C0\\uC11C\\s*\\uC218\\uB839\\s*\\uC548\\uB0B4",
  "\\uBB34\\uC5F0\\uACE0\\s*\\uC0AC\\uB9DD\\uC790",
  "\\uCC44\\uC6A9\\s*\\uACF5\\uACE0",
  "\\uC9C1\\uC6D0\\s*\\uCC44\\uC6A9",
  "\\uD1B5\\uC7A5\\s*\\uBAA8\\uC9D1\\s*\\uACF5\\uACE0",
  "\\uACF5\\uC911\\uD654\\uC7A5\\uC2E4\\s*\\uAD00\\uB9AC\\uC778",
  "\\uACF5\\uAC1C\\uBAA8\\uC9D1\\s*\\uACF5\\uACE0",
].join("|"), "i");
const CONTAMINATED_EVENT_NOTICE_RE = /(?:\uC81C\uB85C\uB9C8\uCF13|(?:\uAC1C\uCD5C\s*\uC548\uB0B4[\s\S]{0,500}\uB2E4\uC74C\uAE00)|(?:\uB2E4\uC74C\uAE00[\s\S]{0,500}\uAC1C\uCD5C\s*\uC548\uB0B4))/i;
const APPLICATION_PERIOD_RE = /(?:\uC2E0\uCCAD|\uC811\uC218|\uBAA8\uC9D1)\s*(?:\uAE30\uAC04|\uBC29\uBC95|\uB9C8\uAC10)/i;

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
  const noticeText = [title, sourceText].filter(Boolean).join(" ");
  const hasNonPosterNotice = NON_POSTER_NOTICE_RE.test(noticeText) ||
    (CONTAMINATED_EVENT_NOTICE_RE.test(noticeText) && !APPLICATION_PERIOD_RE.test(noticeText));

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
    hasNonPosterNotice,
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

  if (signals.hasNonPosterNotice) {
    return {
      isRealPoster: false,
      confidence: 0.95,
      route: "reject",
      needsVlm: false,
      reasons: ["non_poster_notice"],
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
