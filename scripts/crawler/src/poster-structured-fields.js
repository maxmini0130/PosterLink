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

function toIsoDateTime(dateOnly) {
  return dateOnly ? normalizeIsoDate(`${dateOnly}T00:00:00.000Z`) : null;
}

function makeDateOnly(yearValue, monthValue, dayValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31)
    return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inferYearHint(...values) {
  for (const value of values) {
    const text = String(value ?? "");
    const match = text.match(/(?:^|[^\d])((?:20|19)\d{2})\s*(?:년|[./-])/);
    if (match) return Number(match[1]);
  }
  return null;
}

function extractDateOnlyTokens(text, { yearHint } = {}) {
  const source = String(text ?? "");
  const dates = [];
  const seen = new Set();
  const pattern =
    /(^|[^\d])(\d{4})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*(?:일)?/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const iso = makeDateOnly(match[2], match[3], match[4]);
    if (!iso) continue;
    const index = (match.index ?? 0) + (match[1]?.length ?? 0);
    seen.add(`${iso}:${index}`);
    dates.push({
      iso,
      index,
      endIndex: pattern.lastIndex,
    });
  }

  if (yearHint) {
    const monthDayPatterns = [
      /(^|[^\d])(\d{1,2})\s*월\s*(\d{1,2})\s*일?/g,
      /(^|[^\d])(\d{1,2})\s*[./]\s*(\d{1,2})\s*(?:[.)]|$)/g,
    ];
    for (const monthDayPattern of monthDayPatterns) {
      while ((match = monthDayPattern.exec(source)) !== null) {
        const index = (match.index ?? 0) + (match[1]?.length ?? 0);
        const prefix = source.slice(Math.max(0, index - 8), index);
        if (/\d{4}\s*(?:년|[./-])\s*$/.test(prefix)) continue;

        const iso = makeDateOnly(yearHint, match[2], match[3]);
        if (!iso) continue;
        const key = `${iso}:${index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dates.push({
          iso,
          index,
          endIndex: monthDayPattern.lastIndex,
        });
      }
    }
  }

  return dates.sort((a, b) => a.index - b.index);
}

function inferApplicationDateRangeFromPeriod(periodText, { yearHint } = {}) {
  const text = compactText(periodText, 12000) ?? "";
  if (!text) return {};

  const labelPattern = /(?:모집|신청|접수)\s*(?:기간|일시|마감|기한)/g;
  const snippets = [];
  let labelMatch;
  while ((labelMatch = labelPattern.exec(text)) !== null) {
    snippets.push(text.slice(labelMatch.index, labelMatch.index + 180));
  }
  if (snippets.length === 0) snippets.push(text);

  let fallback = {};
  for (const rangeText of snippets) {
    const dates = extractDateOnlyTokens(rangeText, { yearHint });
    if (dates.length === 0) continue;

    const start = dates[0]?.iso ?? null;
    let end = null;
    for (let index = 0; index + 1 < dates.length; index += 1) {
      const between = rangeText.slice(
        dates[index].endIndex,
        dates[index + 1].index,
      );
      if (between.length <= 30 && /(?:~|～|〜|∼|-|부터|에서)/.test(between)) {
        end = dates[index + 1].iso;
        break;
      }
    }

    if (
      !end &&
      dates.length === 1 &&
      !/(?:~|～|〜|∼|-)\s*\[/.test(rangeText) &&
      !/(?:선착순|선착)\s*(?:모집|접수|신청|마감)?/.test(rangeText) &&
      /(?:모집|신청|접수)\s*(?:기간|일시)?|(?:까지|마감)/.test(rangeText)
    ) {
      end = start;
    }

    const candidate = {
      applicationStartAt: toIsoDateTime(start),
      applicationEndAt: toIsoDateTime(end),
    };
    if (
      candidate.applicationStartAt &&
      candidate.applicationEndAt &&
      candidate.applicationStartAt !== candidate.applicationEndAt
    ) {
      return candidate;
    }
    if (!fallback.applicationStartAt && !fallback.applicationEndAt) {
      fallback = candidate;
    }
  }

  return fallback;
}

function inferEventDateRangeFromFacts({
  contentText,
  sourceText,
  yearHint,
} = {}) {
  const explicitEventLabelPattern = "(?:탐방|행사)\\s*일(?:시|자)?";
  for (const value of [contentText, sourceText]) {
    const source = compactText(value, 12000) ?? "";
    if (!source) continue;

    const label = new RegExp(explicitEventLabelPattern, "g");
    let match;
    while ((match = label.exec(source)) !== null) {
      const snippet = source.slice(match.index, match.index + 120);
      const dates = extractDateOnlyTokens(snippet, { yearHint });
      if (dates.length === 0) continue;
      const eventAt = toIsoDateTime(dates[0].iso);
      return { eventStartAt: eventAt, eventEndAt: eventAt };
    }
  }

  const labelPattern =
    "(?:(?:탐방|행사|교육|강연|공연|상영|운영|진행)\\s*(?:일시|일자|일|기간|일정)|일정(?=\\s*(?:\\d{4}|\\d{1,2}\\s*월|\\d{1,2}[./])))";

  for (const value of [sourceText, contentText]) {
    const source = compactText(value, 12000) ?? "";
    if (!source) continue;

    const label = new RegExp(labelPattern, "g");
    let match;
    while ((match = label.exec(source)) !== null) {
      const snippet = source.slice(match.index, match.index + 220);
      const dates = extractDateOnlyTokens(snippet, { yearHint });
      if (dates.length === 0) continue;

      for (let index = 0; index + 1 < dates.length; index += 1) {
        const between = snippet.slice(
          dates[index].endIndex,
          dates[index + 1].index,
        );
        if (/(?:장소|대상|모집\s*기간|신청\s*방법|문의|\d+\.\s*)/.test(between))
          continue;
        if (between.length <= 80 && /(?:~|～|〜|∼|부터|에서)/.test(between)) {
          return {
            eventStartAt: toIsoDateTime(dates[index].iso),
            eventEndAt: toIsoDateTime(dates[index + 1].iso),
          };
        }
      }

      if (match[0].includes("일정") && dates[0].index > 30) continue;

      if (dates.length >= 1) {
        const eventAt = toIsoDateTime(dates[0].iso);
        return { eventStartAt: eventAt, eventEndAt: eventAt };
      }
    }
  }

  for (const value of [contentText, sourceText]) {
    const text = compactText(value, 3000) ?? "";
    if (!text) continue;
    if (!/(?:일시|행사일|강연|특강|체험|공연|상영|만남|개최|진행)/.test(text))
      continue;

    const dates = extractDateOnlyTokens(text, { yearHint });
    const uniqueDates = [...new Set(dates.map((date) => date.iso))];
    if (uniqueDates.length === 1) {
      const eventAt = toIsoDateTime(uniqueDates[0]);
      return { eventStartAt: eventAt, eventEndAt: eventAt };
    }
  }

  return {};
}

function extractGradeAgeRange(text) {
  const source = compactText(text, 3000) ?? "";
  if (!source) return {};

  const schoolMatch = source.match(
    /(초등(?:학교|학생)?|중(?:학교|학생)?|고(?:등학교|등학생)?)[^\d]{0,12}(\d)\s*(?:~|-|부터|∼)\s*(\d)\s*학년/,
  );
  if (!schoolMatch) return {};

  const minGrade = Number(schoolMatch[2]);
  const maxGrade = Number(schoolMatch[3]);
  if (!minGrade || !maxGrade || minGrade > maxGrade) return {};

  let baseAge = null;
  if (schoolMatch[1].startsWith("초")) baseAge = 6;
  if (schoolMatch[1].startsWith("중")) baseAge = 12;
  if (schoolMatch[1].startsWith("고")) baseAge = 15;
  if (!baseAge) return {};

  return {
    targetAgeMin: baseAge + minGrade,
    targetAgeMax: baseAge + maxGrade,
  };
}

function extractExplicitAgeRange(text) {
  const source = compactText(text, 3000) ?? "";
  if (!source) return {};

  const rangeMatch = source.match(
    /만?\s*(\d{1,2})\s*세\s*(?:~|-|부터|∼)\s*만?\s*(\d{1,2})\s*세/,
  );
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (min <= max) return { targetAgeMin: min, targetAgeMax: max };
  }

  const singleMatch = source.match(/만?\s*(\d{1,2})\s*세\s*(?:이상|부터)/);
  if (singleMatch) return { targetAgeMin: Number(singleMatch[1]) };

  return {};
}

function extractTargetAgeRange(text) {
  return {
    ...extractGradeAgeRange(text),
    ...extractExplicitAgeRange(text),
  };
}

function extractRecruitmentCount(text) {
  const source = compactText(text, 12000) ?? "";
  if (!source) return null;

  const labeled = source.match(
    /(?:모집\s*(?:대상|인원)|선발\s*인원|모집정원|정원|대상)\s*[:：]?\s*.{0,80}?(\d{1,4})\s*(명|팀|가구|개사|기관|명\s*내외)/,
  );
  if (labeled) return `${labeled[1]}${labeled[2].replace(/\s+/g, "")}`;

  const firstCome = source.match(/선착순\s*(\d{1,4})\s*(명|팀|가구|개사|기관)/);
  if (firstCome) return `${firstCome[1]}${firstCome[2]}`;

  return null;
}

function extractEligibilitySummary(text) {
  const source = compactText(text, 12000) ?? "";
  if (!source) return null;

  const match = source.match(
    /(?:모집\s*)?대상\s*[:：]?\s*(.{1,180}?)(?=\s*(?:🎯|📢|🔗|📆|🚩|모집\s*기간|신청|일정|장소|문의|$))/,
  );
  if (!match) return null;

  return compactText(match[1], 300);
}

function extractEventLocation(text) {
  const source = compactText(text, 12000) ?? "";
  if (!source) return null;

  const match = source.match(
    /(?:탐방|행사|교육|강연|공연|상영|운영|진행)?\s*장소\s*[:：]?\s*(.{1,160}?)(?=\s*(?:🎯|📢|🔗|📆|모집대상|대상|모집기간|신청방법|문의|$))/,
  );
  if (!match) return null;

  return compactText(
    match[1]
      .replace(
        /\s*(?:탐방주제|행사주제|주\s*관|모집대상|모집기간|신청방법|문의|접수).*$/,
        "",
      )
      .replace(/\s+\d+\.\s*$/, ""),
    200,
  );
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

  const text =
    compactText([sourceText, periodText].filter(Boolean).join(" "), 4000) ?? "";
  if (!text) return null;
  if (!/선착순/.test(text)) return null;
  if (/(?:신청|접수|모집|공모)\s*(?:기간|일시|마감|기한)/.test(text))
    return null;
  if (
    !/(?:영화관|영화|상영|애니메이션|공연|강연|특강|체험|행사|클래스|프로그램)/.test(
      text,
    )
  )
    return null;

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
  const hasFirstCome = /(?:선착순|선착)\s*(?:모집|접수|신청|마감)?/.test(text);
  if (/(?:상시|수시)\s*(?:모집|접수|신청|운영)/.test(text)) return "ongoing";
  if (/(?:예산|재원|인원)?\s*소진\s*시/.test(text)) return "until_exhausted";
  if (
    hasFirstCome &&
    /(?:모집\s*(?:대상|인원)|선발\s*인원|모집정원|정원|대상)\s*[:：]?\s*.{0,80}?\d{1,4}\s*(?:명|팀|가구|개사|기관)|\d{1,4}\s*(?:명|팀|가구|개사|기관).{0,80}?(?:선착순|선착)/.test(
      text,
    )
  )
    return "until_exhausted";
  if (applicationEndAt) return "fixed";
  if (hasFirstCome) return "until_exhausted";
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
  const sourceEvidenceText = [
    sourceText,
    trustedFacts.period,
    trustedFacts.target,
    trustedFacts.content,
    trustedFacts.location,
  ]
    .filter(Boolean)
    .join("\n");
  const yearHint = inferYearHint(sourceEvidenceText);
  const factApplicationRange = inferApplicationDateRangeFromPeriod(
    trustedFacts.period,
    { yearHint },
  );
  const sourceApplicationRange = inferApplicationDateRangeFromPeriod(
    sourceEvidenceText,
    { yearHint },
  );
  const sourceRangeIsComplete =
    sourceApplicationRange.applicationStartAt &&
    sourceApplicationRange.applicationEndAt &&
    sourceApplicationRange.applicationStartAt !==
      sourceApplicationRange.applicationEndAt;
  const inferredApplicationRange = {
    applicationStartAt:
      (sourceRangeIsComplete
        ? sourceApplicationRange.applicationStartAt
        : factApplicationRange.applicationStartAt) ??
      sourceApplicationRange.applicationStartAt,
    applicationEndAt:
      (sourceRangeIsComplete
        ? sourceApplicationRange.applicationEndAt
        : factApplicationRange.applicationEndAt) ??
      sourceApplicationRange.applicationEndAt,
  };
  const inferredEventRange = inferEventDateRangeFromFacts({
    contentText: trustedFacts.content,
    sourceText: sourceEvidenceText,
    yearHint,
  });
  const normalizedEndAt =
    normalizeIsoDate(applicationEndAt) ??
    inferredApplicationRange.applicationEndAt ??
    null;
  const inferredStartAt = inferredApplicationRange.applicationStartAt;
  const sameDayFallback = sameDayScheduleFallback({
    applicationStartAt: applicationStartAt ?? inferredStartAt,
    applicationEndAt: normalizedEndAt,
    eventStartAt,
    eventEndAt,
    sourceText,
    periodText: trustedFacts.period,
  });
  const normalizedStartAt =
    normalizeIsoDate(applicationStartAt) ?? inferredStartAt ?? sameDayFallback;
  const normalizedEventStartAt =
    normalizeIsoDate(eventStartAt) ??
    inferredEventRange.eventStartAt ??
    sameDayFallback;
  let normalizedEventEndAt =
    normalizeIsoDate(eventEndAt) ??
    inferredEventRange.eventEndAt ??
    sameDayFallback;
  if (
    normalizedEventStartAt &&
    normalizedEventEndAt &&
    normalizedEventEndAt < normalizedEventStartAt
  ) {
    normalizedEventEndAt = normalizedEventStartAt;
  }
  const confidence = Number(verification.confidence ?? organization.confidence);
  const inferredEligibilitySummary =
    extractEligibilitySummary(sourceEvidenceText);
  const eligibilitySummary = firstSafeFactText(
    [target, trustedFacts.target, inferredEligibilitySummary],
    "target",
    2000,
  );
  const inferredAgeRange = extractTargetAgeRange(
    [eligibilitySummary, sourceEvidenceText].filter(Boolean).join("\n"),
  );
  const inferredRecruitmentCount = extractRecruitmentCount(sourceEvidenceText);
  const inferredEventLocation = extractEventLocation(sourceEvidenceText);

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
    eligibility_summary: eligibilitySummary,
    target_age_min: inferredAgeRange.targetAgeMin ?? null,
    target_age_max: inferredAgeRange.targetAgeMax ?? null,
    benefits_summary: firstSafeFactText(
      [supportScale, trustedFacts.benefits, trustedFacts.content],
      "content",
      4000,
    ),
    recruitment_count: inferredRecruitmentCount,
    application_method: firstSafeFactText(
      [trustedFacts.application],
      "application",
      4000,
    ),
    contact_info: firstSafeFactText([trustedFacts.contact], "contact", 1000),
    event_location: firstSafeFactText(
      [trustedFacts.location, inferredEventLocation],
      "location",
      1000,
    ),
    verification_status: verificationStatus,
    data_confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : null,
  };
}
