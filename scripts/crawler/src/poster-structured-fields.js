import {
  sanitizeNoticeFacts,
  sanitizeNoticeFactValue,
} from "./notice-fact-normalizer.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function compactText(value, limit = 2000) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, limit) : null;
}

function firstText(values, limit) {
  for (const value of values) {
    const text = compactText(value, limit);
    if (text) return text;
  }
  return null;
}

function firstSafeFactText(values, key, limit) {
  for (const value of values) {
    const safeValue = sanitizeNoticeFactValue(value, key);
    const text = compactText(safeValue, limit);
    if (text) return text;
  }
  return null;
}

function excludeLlmFilledFacts(facts, readableNotice) {
  const factsLlmMeta = asObject(readableNotice.factsLlmMeta);
  const filledByLlm = new Set(
    Array.isArray(factsLlmMeta.filledByLlm)
      ? factsLlmMeta.filledByLlm.map((key) => String(key))
      : [],
  );

  return Object.fromEntries(
    Object.entries(facts).filter(([key]) => !filledByLlm.has(key)),
  );
}

function normalizeIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sameDayScheduleFallback({
  applicationStartAt,
  applicationEndAt,
  eventStartAt,
  eventEndAt,
  sourceText,
  periodText,
} = {}) {
  const normalizedEndAt = normalizeIsoDate(applicationEndAt);
  if (!normalizedEndAt) return null;
  if (applicationStartAt || eventStartAt || eventEndAt) return null;

  const text = compactText([sourceText, periodText].filter(Boolean).join(" "), 4000) ?? "";
  if (!text) return null;
  if (!/선착순/.test(text)) return null;
  if (/(?:신청|접수|모집|공모)\s*(?:기간|일시|마감|기한)/.test(text)) return null;
  if (!/(?:영화관|영화|상영|애니메이션|공연|강연|특강|체험|행사|클래스|프로그램)/.test(text)) return null;

  return normalizedEndAt;
}

export function normalizeStructuredDeadlineType(value) {
  switch (
    String(value ?? "")
      .trim()
      .toLowerCase()
  ) {
    case "fixed":
    case "고정":
      return "fixed";
    case "ongoing":
    case "상시":
      return "ongoing";
    case "until_exhausted":
    case "소진시":
    case "소진 시":
      return "until_exhausted";
    case "scheduled":
    case "예정":
      return "scheduled";
    default:
      return "unknown";
  }
}

export function inferStructuredDeadlineType({
  deadlineType,
  applicationEndAt,
  periodText,
  sourceText,
} = {}) {
  const explicit = normalizeStructuredDeadlineType(deadlineType);
  if (explicit !== "unknown") return explicit;

  const text = `${periodText ?? ""} ${sourceText ?? ""}`;
  if (/(?:상시|수시)\s*(?:모집|접수|신청|운영)/.test(text)) return "ongoing";
  if (/(?:예산|재원|인원)?\s*소진\s*시/.test(text)) return "until_exhausted";
  if (applicationEndAt) return "fixed";
  if (/(?:모집|접수|신청)\s*(?:예정|추후\s*공고)/.test(text))
    return "scheduled";
  return "unknown";
}

export function buildStructuredPosterFields({
  fieldVerification,
  readableFacts,
  deadlineType,
  applicationStartAt,
  applicationEndAt,
  eventStartAt,
  eventEndAt,
  sourceText,
  fallbackOrganizerName,
  target,
  supportScale,
  verificationStatus = "needs_review",
} = {}) {
  const verification = asObject(fieldVerification);
  const organization = asObject(verification.organization);
  const readableNotice = asObject(verification.readableNotice);
  const rawFacts = {
    ...asObject(readableNotice.facts),
    ...asObject(readableFacts),
  };
  const facts = sanitizeNoticeFacts({
    ...rawFacts,
    content: rawFacts.content ?? rawFacts.benefits,
  });
  const trustedFacts = excludeLlmFilledFacts(facts, readableNotice);
  const normalizedEndAt = normalizeIsoDate(applicationEndAt);
  const sameDayFallback = sameDayScheduleFallback({
    applicationStartAt,
    applicationEndAt: normalizedEndAt,
    eventStartAt,
    eventEndAt,
    sourceText,
    periodText: trustedFacts.period,
  });
  const normalizedStartAt = normalizeIsoDate(applicationStartAt) ?? sameDayFallback;
  const normalizedEventStartAt = normalizeIsoDate(eventStartAt) ?? sameDayFallback;
  const normalizedEventEndAt = normalizeIsoDate(eventEndAt) ?? sameDayFallback;
  const confidence = Number(verification.confidence ?? organization.confidence);

  return {
    organizer_name: firstText(
      [
        organization.organizerName,
        organization.displayOrgName,
        verification.correctedOrgName,
        fallbackOrganizerName,
      ],
      300,
    ),
    application_organization_name: firstText(
      [
        organization.applicationOrganizationName,
        organization.applicationOrgName,
        verification.applicationOrganizationName,
      ],
      300,
    ),
    deadline_type: inferStructuredDeadlineType({
      deadlineType,
      applicationEndAt: normalizedEndAt,
      periodText: trustedFacts.period,
      sourceText,
    }),
    application_start_at: normalizedStartAt,
    application_end_at: normalizedEndAt,
    event_start_at: normalizedEventStartAt,
    event_end_at: normalizedEventEndAt,
    eligibility_summary: firstSafeFactText(
      [target, trustedFacts.target],
      "target",
      2000,
    ),
    benefits_summary: firstSafeFactText(
      [supportScale, trustedFacts.benefits, trustedFacts.content],
      "content",
      4000,
    ),
    application_method: firstSafeFactText(
      [trustedFacts.application],
      "application",
      4000,
    ),
    contact_info: firstSafeFactText([trustedFacts.contact], "contact", 1000),
    event_location: firstSafeFactText(
      [trustedFacts.location],
      "location",
      1000,
    ),
    verification_status: verificationStatus,
    data_confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : null,
  };
}
