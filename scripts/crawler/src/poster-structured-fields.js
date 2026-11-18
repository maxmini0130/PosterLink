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

const DATE_ONLY_VALUE = /^\d{4}-\d{2}-\d{2}$/;

// "진행일정: 2026-11-26 14:00 ~ 16:00 (Asia/Seoul)" (youth portal overview) and
// the same shape with an end date ("… ~ 2026-11-27 16:00").
const SCHEDULE_TIME_PATTERN =
  /진행\s*일정\s*:?\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2})\s*:\s*(\d{2})\s*~\s*(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{1,2})\s*:\s*(\d{2})/;

function pad2(value) {
  return String(value).padStart(2, "0");
}

// "진행일정: 2026-12-03 ~ 2026-12-17 14:00 ~ 16:00": a date range, then the daily
// time range (start time on the first day, end time on the last day).
const SCHEDULE_RANGE_TIME_PATTERN =
  /진행\s*일정\s*:?\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2})\s*:\s*(\d{2})\s*~\s*(\d{1,2})\s*:\s*(\d{2})/;

/** Start/end wall-clock times stated by a 진행일정 line, keyed by date. */
export function extractScheduleTimes(text) {
  const source = String(text ?? "");
  const range = source.match(SCHEDULE_RANGE_TIME_PATTERN);
  const single = range ? null : source.match(SCHEDULE_TIME_PATTERN);
  if (!range && !single) return null;
  const [startDate, sh, sm, endDateRaw, eh, em] = range
    ? [range[1], range[3], range[4], range[2], range[5], range[6]]
    : single.slice(1);
  const valid = (h, m) => Number(h) <= 23 && Number(m) <= 59;
  if (!valid(sh, sm) || !valid(eh, em)) return null;
  // "00:00 ~ 00:00" is the portal's placeholder for "no time".
  if (Number(sh) === 0 && Number(sm) === 0 && Number(eh) === 0 && Number(em) === 0) return null;
  return {
    startDate,
    startTime: `${pad2(sh)}:${sm}`,
    endDate: endDateRaw ?? startDate,
    endTime: `${pad2(eh)}:${em}`,
  };
}

/**
 * An event day known only by its date is stored at Seoul midnight, so its
 * Seoul calendar day stays right (UTC midnight would read as 09:00 KST). When
 * a 진행일정 line states the time for that day, the time is used instead.
 * Values that came in with an explicit time are returned unchanged.
 */
export function toEventIso(value, { hadTime, schedule, edge }) {
  if (!value) return null;
  if (hadTime) return normalizeIsoDate(value);
  const iso = normalizeIsoDate(value);
  // Only the internal date-only form (UTC midnight) is a bare day; anything
  // else already carries a time and is kept.
  if (!iso || !iso.endsWith("T00:00:00.000Z")) return iso;
  const day = iso.slice(0, 10);
  const scheduleDay = edge === "end" ? schedule?.endDate : schedule?.startDate;
  const time = scheduleDay === day ? (edge === "end" ? schedule.endTime : schedule.startTime) : "00:00";
  return normalizeIsoDate(`${day}T${time}:00+09:00`);
}

// A date token as notices write it: 2026. 11. 21. / 2026-11-21 / 11. 21. / 11/21 / 11월 21일.
const NOTICE_DATE = String.raw`(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*[.일]?`;
const WEEKDAY = String.raw`(?:\s*\(\s*[월화수목금토일]\s*\))?`;
const PERIOD_LABEL = String.raw`(?:신청|접수|모집)\s*(?:기간|일시|기한)\s*[:：]?`;
// "접수기간: 2026. 11. 23.(월) 10:00 ~ 12. 14.(월) 17:00"
const PERIOD_END_TIME = new RegExp(
  `${PERIOD_LABEL}[^~]{0,60}~\\s*${NOTICE_DATE}${WEEKDAY}\\s*(\\d{1,2})\\s*:\\s*(\\d{2})`,
  "g",
);
// "신청기간 : 11. 09.(월) ~ 11. 23.(월) 평일 09:00 ~ 18:00" (daily hours: the last day closes at the end time)
const PERIOD_END_DAILY_HOURS = new RegExp(
  `${PERIOD_LABEL}[^~]{0,60}~\\s*${NOTICE_DATE}${WEEKDAY}\\s*(?:평일|매일)?\\s*\\d{1,2}\\s*:\\s*\\d{2}\\s*~\\s*(\\d{1,2})\\s*:\\s*(\\d{2})`,
  "g",
);

/**
 * The closing time a notice states for its application period when the
 * deadline is otherwise known only by its day (YYYY-MM-DD, Asia/Seoul).
 * Only a time on the same month/day as the deadline counts; "00:00" is the
 * portal's no-time placeholder and is ignored. Returns "HH:MM" or null.
 */
export function extractDeadlineTime(text, deadlineDay) {
  const day = String(deadlineDay ?? "");
  if (!DATE_ONLY_VALUE.test(day)) return null;
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  const source = compactText(text, 12000) ?? "";
  for (const pattern of [PERIOD_END_DAILY_HOURS, PERIOD_END_TIME]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const [, year, m, d, hh, mm] = match;
      if (Number(m) !== month || Number(d) !== date) continue;
      if (year && Number(year) !== Number(day.slice(0, 4))) continue;
      const hours = Number(hh);
      const minutes = Number(mm);
      if (hours > 23 || minutes > 59 || (hours === 0 && minutes === 0)) continue;
      return `${pad2(hours)}:${pad2(minutes)}`;
    }
  }
  return null;
}

const SEOUL_DISTRICTS =
  "강남|강동|강북|강서|관악|광진|구로|금천|노원|도봉|동대문|동작|마포|서대문|서초|성동|성북|송파|양천|영등포|용산|은평|종로|중구|중랑";
const YOUTH_CENTER_BRANCH = new RegExp(
  `서울청년센터\\s*[\\[(]?\\s*(${SEOUL_DISTRICTS})(\\s*신림동쓰리룸)?`,
);
// Names that say where a notice was collected, not who runs the program.
const GENERIC_ORGANIZER = /^(?:서울청년센터|청년몽땅정보통|서울시\s*청년몽땅정보통)$/;
// "양천외국인주민센터 <세계요리나눔…>", "영등포구청 <드론산업…>": the issuing body
// written before the program name.
const TITLE_PREFIX_ORGANIZER =
  /^\s*\[?\s*([가-힣A-Za-z0-9·()]+(?:\s+[가-힣A-Za-z0-9·()]+){0,3}?(?:센터|구청|시청|재단|도서관|복지관|학교|협회|공단|공사|진흥원|청|위원회|문화의집|가족센터))\s*\]?\s*[<\[「《〈]/;

/**
 * The organizer when the extracted name is only a collection placeholder.
 * The youth portal fills 담당기관 with a bare "서울청년센터" for many notices:
 * the branch ("서울청년센터 성동") or the real issuer written at the start of
 * the title is used instead. Any other name is returned unchanged.
 */
export function refineOrganizerName(name, title) {
  const current = compactText(name, 300);
  if (current && !GENERIC_ORGANIZER.test(current)) return current;
  const text = compactText(title, 300) ?? "";
  const branch = text.match(YOUTH_CENTER_BRANCH);
  if (branch) return `서울청년센터 ${branch[1]}${branch[2] ? ` ${branch[2].trim()}` : ""}`;
  const prefix = text.match(TITLE_PREFIX_ORGANIZER);
  if (prefix && !/서울청년센터|청년몽땅정보통/.test(prefix[1])) return prefix[1].trim();
  return current;
}

/** A day-only deadline at the time the notice states, else 23:59:59 KST. */
function deadlineAtStatedTime(day, text) {
  const time = extractDeadlineTime(text, day);
  return time ? normalizeIsoDate(`${day}T${time}:00+09:00`) : toApplicationEndIso(day);
}

function hasExplicitTime(value) {
  const text = String(value ?? "").trim();
  return Boolean(text) && !DATE_ONLY_VALUE.test(text) && Boolean(normalizeIsoDate(text));
}

/**
 * A deadline known only by its date stays open through that whole day in
 * Asia/Seoul. Stored as UTC midnight it would read as 09:00 and close then.
 * Values that already carry a time are returned normalized, unchanged.
 */
export function toApplicationEndIso(value) {
  const text = String(value ?? "").trim();
  return DATE_ONLY_VALUE.test(text)
    ? normalizeIsoDate(`${text}T23:59:59+09:00`)
    : normalizeIsoDate(text);
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

    const englishMonths = new Map([
      ["january", 1],
      ["jan", 1],
      ["february", 2],
      ["feb", 2],
      ["march", 3],
      ["mar", 3],
      ["april", 4],
      ["apr", 4],
      ["may", 5],
      ["june", 6],
      ["jun", 6],
      ["july", 7],
      ["jul", 7],
      ["august", 8],
      ["aug", 8],
      ["september", 9],
      ["sept", 9],
      ["sep", 9],
      ["october", 10],
      ["oct", 10],
      ["november", 11],
      ["nov", 11],
      ["december", 12],
      ["dec", 12],
    ]);
    const englishMonthPattern =
      /(^|[^A-Za-z\d])(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?/gi;
    while ((match = englishMonthPattern.exec(source)) !== null) {
      const month = englishMonths.get(match[2].toLowerCase());
      const iso = makeDateOnly(yearHint, month, match[3]);
      if (!iso) continue;
      const index = (match.index ?? 0) + (match[1]?.length ?? 0);
      const key = `${iso}:${index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dates.push({
        iso,
        index,
        endIndex: englishMonthPattern.lastIndex,
      });
    }
  }

  return dates.sort((a, b) => a.index - b.index);
}

function inferApplicationDateRangeFromPeriod(periodText, { yearHint } = {}) {
  const text = compactText(periodText, 12000) ?? "";
  if (!text) return {};

  const labelPattern = /(?:모집|신청|접수)\s*(?:기간|일시|마감|기한)/g;
  const snippets = [];
  let eventDayEnd = null;
  let labelMatch;
  while ((labelMatch = labelPattern.exec(text)) !== null) {
    let snippet = text.slice(labelMatch.index, labelMatch.index + 180);
    // Stop at the next overview field: in "신청기간 상시 대상 … 진행일정: 2026-11-20"
    // the date belongs to the event schedule, not to the application period.
    const nextField = snippet
      .slice(labelMatch[0].length)
      .search(/(?:진행\s*일정|행사\s*일(?:시|정)|교육\s*기간|담당\s*기관|대\s*상\s|대상\s*:)/);
    if (nextField >= 0) {
      const own = snippet.slice(0, labelMatch[0].length + nextField);
      // The period itself states no date (e.g. "상시"): keep the old end-of-event
      // fallback for the deadline so the notice still closes, but no start.
      if (extractDateOnlyTokens(own, { yearHint }).length === 0) {
        const borrowed = extractDateOnlyTokens(snippet, { yearHint })[0];
        if (borrowed && !eventDayEnd) eventDayEnd = toIsoDateTime(borrowed.iso);
        continue;
      }
      snippet = own;
    }
    snippets.push(snippet);
  }
  if (snippets.length === 0 && !eventDayEnd) snippets.push(text);

  let fallback = eventDayEnd ? { applicationStartAt: null, applicationEndAt: eventDayEnd } : {};
  for (const rangeText of snippets) {
    const dates = extractDateOnlyTokens(rangeText, { yearHint });
    if (dates.length === 0) continue;

    // "신청기간 ~ 2026-11-18": the only date is the end; there is no start.
    const endOnly =
      dates.length >= 1 &&
      /(?:~|～|〜|∼)\s*$/.test(rangeText.slice(0, dates[0].index));
    const start = endOnly ? null : dates[0]?.iso ?? null;
    if (endOnly) {
      if (!fallback.applicationStartAt && !fallback.applicationEndAt) {
        fallback = { applicationStartAt: null, applicationEndAt: toIsoDateTime(dates[0].iso) };
      }
      continue;
    }
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
      !/00\s*:\s*00/.test(rangeText) &&
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
    if (!/(?:일시|행사일|강연|특강|체험|공연|상영|만남|개최|진행|screening|movie|film|event)/i.test(text))
      continue;

    const dates = extractDateOnlyTokens(text, { yearHint });
    const uniqueDates = [...new Set(dates.map((date) => date.iso))];
    const eventKeywordPattern =
      /(?:일시|행사일|강연|특강|체험|공연|상영|만남|개최|진행|screening|movie|film|event)/gi;
    const eventKeywordMatches = [...text.matchAll(eventKeywordPattern)];
    const eventKeywordIndex =
      eventKeywordMatches.length > 0
        ? eventKeywordMatches[eventKeywordMatches.length - 1].index
        : -1;
    if (eventKeywordIndex >= 0) {
      const eventDates = [
        ...new Set(
          dates
            .filter((date) => date.index >= eventKeywordIndex)
            .map((date) => date.iso),
        ),
      ];
      if (eventDates.length === 1) {
        const eventAt = toIsoDateTime(eventDates[0]);
        return { eventStartAt: eventAt, eventEndAt: eventAt };
      }
    }
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

// A whole number only: "070-77153-3893" (a typo in a notice) is not cut to "070-7715".
const PHONE = String.raw`(?<!\d)(?:0\d{1,2}[-)\s.]?\d{3,4}[-.\s]\d{4}|1\d{3}-\d{4}|\d{3,4}-\d{4})(?![\d-])`;
const CONTACT_LINE = new RegExp(
  String.raw`(?:문\s*의(?:\s*처)?|연\s*락\s*처|☎|📞)\s*[:：)\]]?\s*((?:(?!문\s*의|신청|접수|대상|장소|일시|기간)[^\n]){0,50}?${PHONE}(?:\s*[,~/·]\s*(?:${PHONE}|\d{3,4}))*)`,
);

/**
 * Contact from a labeled line ("문의: 서울청년센터 은평 조이 매니저 02-351-3711").
 * Only a phone number written after a 문의/연락처 label counts; an unlabeled
 * number anywhere in the page is not used.
 */
export function extractContactInfo(text) {
  const source = compactText(text, 12000) ?? "";
  const match = source.match(CONTACT_LINE);
  if (!match) return null;
  let value = match[1]
    .replace(/^[\s:：\-–]+/, "")
    .replace(/^(?:전화\s*)?번호\s*[:：]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  // "중랑구 사회적경제지원센터 (☎ 02-2094-1302" → close the bracket the match cut.
  const open = (value.match(/\(/g) ?? []).length - (value.match(/\)/g) ?? []).length;
  if (open > 0) value = `${value}${")".repeat(open)}`;
  return value.length >= 7 ? value.slice(0, 120) : null;
}

const FEE_LINE =
  /(?:참가비|참여비|참가\s*비용|수강료|교육비|이용료|재료비|비용|참가료)\s*[:：]?\s*(무료|전액\s*무료|(?:\d{1,3}(?:,\d{3})+|\d{1,7})\s*원)/;

/** Fee from a labeled line: "참가비 무료", "수강료 : 10,000원". */
export function extractParticipationFee(text) {
  const source = compactText(text, 12000) ?? "";
  const match = source.match(FEE_LINE);
  if (!match) return null;
  // "수강료 80,000원 0원" (list and sale price on a shop page): which one applies is unclear.
  const after = source.slice(match.index + match[0].length, match.index + match[0].length + 12);
  if (/^\s*(?:\d{1,3}(?:,\d{3})+|\d{1,7})\s*원/.test(after)) return null;
  return /무료/.test(match[1]) ? "무료" : match[1].replace(/\s+/g, "");
}

function extractRecruitmentCount(text) {
  const source = compactText(text, 12000) ?? "";
  if (!source) return null;

  // "모집규모 : 15개사 내외", "선발규모: 2개사 내외"
  const scale = source.match(
    /(?:모집|선발|지원)\s*규모\s*[:：]?\s*(\d{1,4})\s*(명|팀|가구|개사|기관)(\s*내외)?/,
  );
  if (scale) return `${scale[1]}${scale[2]}${scale[3] ? " 내외" : ""}`;

  const labeled = source.match(
    /(?:(?:모집|참가|참여|교육|신청|선발|수강)\s*(?:대상|인원|정원)|모집정원|정원|대상)\s*[:：]?\s*.{0,80}?(\d{1,4})\s*(명|팀|가구|가족|개사|기관|명\s*내외)/,
  );
  if (labeled) return `${labeled[1]}${labeled[2].replace(/\s+/g, "")}`;

  const firstCome = source.match(/선착순\s*(\d{1,4})\s*(명|팀|가구|개사|기관)/);
  if (firstCome) return `${firstCome[1]}${firstCome[2]}`;

  return null;
}

/** "참가인원: 서울시민 20명" -> "서울시민": who may join, stated next to the count. */
const AUDIENCE_WORD_RE =
  /(?:시민|구민|주민|도민|군민|거주자|청년|청소년|어린이|아동|학생|성인|어르신|노인|가족|부모|여성|남성|장애인|누구나|직장인|소상공인|대학생|초등학생|중학생|고등학생)/u;

const PARTICIPANT_LINE_RE =
  /(?:참가|참여|모집|교육|신청|선발|수강)\s*(?:인원|정원)\s*[:：]\s*([^\d:：]{0,30}?)\s*(\d{1,4})\s*(명|팀|가구|가족|쌍)/u;

/**
 * Who and how many from one labeled line ("참가인원: 서울시민 20명"), or nulls.
 * Stricter than the general extractors: used to backfill stored posters.
 */
export function extractStatedParticipants(text) {
  const source = compactText(text, 12000) ?? "";
  const match = source.match(PARTICIPANT_LINE_RE);
  if (!match) return { eligibility: null, count: null };
  const audience = match[1].replace(/[()（）\[\]·,\s]+$/u, "").trim();
  return {
    eligibility: AUDIENCE_WORD_RE.test(audience) ? audience : null,
    count: `${match[2]}${match[3]}`,
  };
}

function extractAudienceBeforeCount(source) {
  return extractStatedParticipants(source).eligibility;
}

function extractEligibilitySummary(text) {
  const source = compactText(text, 12000) ?? "";
  if (!source) return null;

  const labeledTarget = matchLabeledTarget(source);
  if (labeledTarget) return labeledTarget;
  return extractAudienceBeforeCount(source);
}

// The youth portal header shows an empty "대상" followed by "담당기관 …": that
// next header is not the target (52 of 256 stored targets read like this).
const PORTAL_HEADER_START = /^(?:담당\s*기관|진행\s*일정|신청\s*기간|접수\s*기간|상세\s*정보)/u;

function matchLabeledTarget(source) {
  const pattern =
    /(?:모집\s*)?대상\s*[:：]?\s*(.{1,180}?)(?=\s*(?:🎯|📢|🔗|📆|🚩|모집\s*기간|신청|일정|장소|문의|$))/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const value = compactText(match[1], 300);
    if (value && !PORTAL_HEADER_START.test(value)) return value;
    // Look again right after this label: a later "모집대상: …" may be inside the skipped text.
    pattern.lastIndex = match.index + match[0].indexOf("대상") + 2;
  }
  return null;
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

function shouldUseSingleEventDayAsApplicationPeriod({
  applicationEndAt,
  eventStartAt,
  eventEndAt,
  sourceText,
  periodText,
} = {}) {
  if (!eventStartAt) return false;
  if (eventEndAt && eventEndAt.slice(0, 10) !== eventStartAt.slice(0, 10))
    return false;

  const text = compactText([sourceText, periodText].filter(Boolean).join(" "), 5000) ?? "";
  if (!text) return false;
  if (!/(?:선착순|first\s*come)/i.test(text)) return false;
  if (!/(?:영화관|영화|상영|애니메이션|공연|강연|특강|체험|행사|클래스|프로그램|screening|movie|film|event)/i.test(text))
    return false;

  const hasApplicationPeriodLabel =
    /(?:신청|접수|모집)\s*(?:기간|일시|마감|기한)?/u.test(text);
  const hasInvalidOpenEndedMidnightPeriod =
    /00\s*:\s*00/.test(String(periodText ?? ""));
  if (applicationEndAt && !hasInvalidOpenEndedMidnightPeriod) return false;

  return hasInvalidOpenEndedMidnightPeriod || !hasApplicationPeriodLabel;
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

const ONGOING_EVIDENCE_RE = /(?:상시|수시|연중)\s*(?:모집|접수|신청|운영)/u;
const UNTIL_EXHAUSTED_EVIDENCE_RE =
  /소진|선착순|선착\s*\d|(?:정원|인원|모집|예약|접수)\s*(?:이\s*)?(?:마감|완료|충족|초과|도달)\s*(?:시|되면|될\s*때)|(?:마감|모집|접수)\s*시\s*까지|조기\s*(?:마감|종료)|(?:정원|인원)\s*(?:이\s*)?(?:차면|채워지면)/u;

/**
 * Screen plan v1.0 section 09: 상시 and 소진 시 마감 are shown only when the
 * notice says so. A model's or reviewer's open-ended type without that wording
 * in the text becomes unknown (접수 상태 확인 필요), never a guess.
 */
export function hasOpenEndedDeadlineEvidence(type, text) {
  const source = String(text ?? "").normalize("NFKC");
  if (type === "ongoing") return ONGOING_EVIDENCE_RE.test(source);
  if (type === "until_exhausted") return UNTIL_EXHAUSTED_EVIDENCE_RE.test(source);
  return true;
}

export function inferStructuredDeadlineType({
  deadlineType,
  applicationEndAt,
  periodText,
  sourceText,
} = {}) {
  // A separator keeps wording from matching across the two values: the period
  // "상시" followed by "신청기간 …" must not read as "상시 신청".
  const text = `${periodText ?? ""} / ${sourceText ?? ""}`;
  const explicit = normalizeStructuredDeadlineType(deadlineType);
  if (explicit !== "unknown") {
    if (hasOpenEndedDeadlineEvidence(explicit, text)) return explicit;
    // Fall through: an unsupported open-ended type is re-read from the text,
    // so a stated fixed end date still wins and nothing is invented.
  }

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
  title,
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
  const posterImageOcr = asObject(verification.posterImageOcr);
  const posterTextSummary = compactText(posterImageOcr.posterTextSummary, 1000);
  const sourceEvidenceText = [
    sourceText,
    trustedFacts.period,
    trustedFacts.target,
    trustedFacts.content,
    trustedFacts.location,
  ]
    .filter(Boolean)
    .join("\n");
  const eventEvidenceText = [sourceEvidenceText, posterTextSummary]
    .filter(Boolean)
    .join("\n");
  const yearHint = inferYearHint(eventEvidenceText);
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
    sourceText: eventEvidenceText,
    yearHint,
  });
  // Both the date-only input and a range inferred from the text have no time.
  const applicationEndHasNoTime =
    DATE_ONLY_VALUE.test(String(applicationEndAt ?? "").trim()) ||
    (!normalizeIsoDate(applicationEndAt) &&
      Boolean(inferredApplicationRange.applicationEndAt));
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
  let normalizedEventStartAt =
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
  if (
    /00\s*:\s*00/.test(String(trustedFacts.period ?? "")) &&
    normalizedEventStartAt &&
    normalizedEventEndAt &&
    inferredStartAt &&
    normalizedEventStartAt.slice(0, 10) === inferredStartAt.slice(0, 10) &&
    normalizedEventEndAt.slice(0, 10) !== normalizedEventStartAt.slice(0, 10)
  ) {
    normalizedEventStartAt = normalizedEventEndAt;
  }
  const singleEventDayApplicationFallback =
    shouldUseSingleEventDayAsApplicationPeriod({
      applicationEndAt: normalizedEndAt,
      eventStartAt: normalizedEventStartAt,
      eventEndAt: normalizedEventEndAt,
      sourceText: eventEvidenceText,
      periodText: trustedFacts.period,
    })
      ? normalizedEventStartAt
      : null;
  const finalApplicationStartAt =
    singleEventDayApplicationFallback ?? normalizedStartAt;
  const finalApplicationEndAt =
    singleEventDayApplicationFallback ?? normalizedEndAt;
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
    organizer_name: refineOrganizerName(
      firstText(
        [
          organization.organizerName,
          organization.displayOrgName,
          verification.correctedOrgName,
          fallbackOrganizerName,
        ],
        300,
      ),
      title ?? String(sourceText ?? "").split("\n")[0],
    ),
    application_organization_name: firstText(
      [
        organization.applicationOrganizationName,
        organization.applicationOrgName,
        verification.applicationOrganizationName,
      ],
      300,
    ),
    deadline_type: singleEventDayApplicationFallback
      ? "fixed"
      : inferStructuredDeadlineType({
          deadlineType,
          applicationEndAt: finalApplicationEndAt,
          periodText: trustedFacts.period,
          sourceText,
        }),
    // A bare start day opens at Seoul midnight, not 09:00 KST (UTC midnight).
    application_start_at: toEventIso(finalApplicationStartAt, {
      hadTime: hasExplicitTime(applicationStartAt) && finalApplicationStartAt === normalizeIsoDate(applicationStartAt),
      schedule: null,
      edge: "start",
    }),
    application_end_at:
      applicationEndHasNoTime &&
      finalApplicationEndAt &&
      !singleEventDayApplicationFallback
        ? deadlineAtStatedTime(finalApplicationEndAt.slice(0, 10), sourceEvidenceText)
        : finalApplicationEndAt,
    event_start_at: toEventIso(normalizedEventStartAt, {
      hadTime: hasExplicitTime(eventStartAt) && normalizedEventStartAt === normalizeIsoDate(eventStartAt),
      schedule: extractScheduleTimes(eventEvidenceText),
      edge: "start",
    }),
    event_end_at: toEventIso(normalizedEventEndAt, {
      hadTime: hasExplicitTime(eventEndAt) && normalizedEventEndAt === normalizeIsoDate(eventEndAt),
      schedule: extractScheduleTimes(eventEvidenceText),
      edge: "end",
    }),
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
    contact_info: firstSafeFactText(
      [trustedFacts.contact, extractContactInfo(sourceEvidenceText)],
      "contact",
      1000,
    ),
    participation_fee: extractParticipationFee(sourceEvidenceText),
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

// ── Poster OCR fills for image-only notices (2026-11-19) ─────────────────
//
// Some notices put everything in the poster image (에코마일리지: the body is a
// title and a placeholder). The crawler already transcribes the chosen poster
// (poster-ocr.js, post.posterOcr) but only the relevance router read it.
// Here that transcription fills 대상 / 모집기간 / 문의 when the body has no
// value for them. Each value comes from a labeled line only (the same
// extractors the body uses), is recorded with source "ocr" and a lowered
// confidence, and the poster is kept for a person (ocrFactsNeedPersonReview).

export const OCR_FILL_RULES = "poster-ocr-fill-20261119";
export const OCR_MIN_CONFIDENCE = 0.6;
// Field confidence for a value read from the image, never above this.
export const OCR_FIELD_CONFIDENCE_CAP = 0.5;
const IMAGE_ONLY_BODY_MAX_CHARS = 80;

// Portal overview lines and placeholders that are not notice body text.
const OVERVIEW_LINE =
  /^\s*(?:신청\s*기간|접수\s*기간|모집\s*기간|대\s*상|담당\s*기관|진행\s*일정|상세\s*정보|신청\s*링크|모집\s*인원|담당기관\s*바로가기).*$/gmu;
const IMAGE_ONLY_PLACEHOLDER = /상세\s*내용은\s*이미지로\s*제공됩니다\.?[^\n]*/gu;

function letterCount(value) {
  return (String(value ?? "").match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/**
 * True when the notice body says almost nothing beyond the title and the
 * portal header, i.e. its content lives in the poster image.
 */
export function isImageOnlyBody(sourceText, title = "") {
  let text = String(sourceText ?? "")
    .replace(IMAGE_ONLY_PLACEHOLDER, " ")
    .replace(OVERVIEW_LINE, " ")
    .replace(/https?:\/\/\S+/g, " ");
  const head = compactText(title, 300);
  if (head) text = text.split(head).join(" ");
  return letterCount(text) < IMAGE_ONLY_BODY_MAX_CHARS;
}

/** The usable OCR transcription of the poster, or null. */
export function usablePosterOcr(posterOcr) {
  const ocr = asObject(posterOcr);
  const text = String(ocr.ocrText ?? "").trim();
  const confidence = Number(ocr.confidence);
  if (!ocr.hasReadableText || !text || letterCount(text) < 20) return null;
  if (!Number.isFinite(confidence) || confidence < OCR_MIN_CONFIDENCE) return null;
  return {
    text: text.slice(0, 4000),
    confidence,
    model: ocr.model ?? null,
    checkedAt: ocr.checkedAt ?? null,
  };
}

const OCR_PERIOD_LABEL = /(?:모집|신청|접수)\s*(?:기간|일시|기한)/u;

/**
 * Values to add from the poster OCR text, for fields the body left empty.
 * Returns null when nothing is filled.
 *
 * @param structured  buildStructuredPosterFields result (body-derived)
 * @param posterOcr   post.posterOcr ({ocrText, hasReadableText, confidence, model, checkedAt})
 * @param sourceText  title + body the structured fields were read from
 */
export function buildOcrFieldFills({ structured = {}, posterOcr, sourceText = "", title = "" } = {}) {
  const ocr = usablePosterOcr(posterOcr);
  if (!ocr || !isImageOnlyBody(sourceText, title)) return null;
  const text = compactText(ocr.text, 4000) ?? "";
  const columns = {};
  const fields = {};
  const record = (column, value, evidence) => {
    columns[column] = value;
    fields[column] = { value, evidence: compactText(evidence, 240) };
  };

  if (!structured.eligibility_summary) {
    const target = sanitizeNoticeFactValue(matchLabeledTarget(text), "target");
    if (target) {
      const at = Math.max(0, text.indexOf(target));
      record("eligibility_summary", compactText(target, 2000), text.slice(Math.max(0, at - 20), at + target.length));
    }
  }

  if (!structured.application_end_at && !structured.application_start_at && OCR_PERIOD_LABEL.test(text)) {
    // A year must be written somewhere (poster or body); none is invented.
    const yearHint = inferYearHint(text, sourceText);
    const range = yearHint ? inferApplicationDateRangeFromPeriod(text, { yearHint }) : {};
    const evidenceAt = text.search(OCR_PERIOD_LABEL);
    const evidence = text.slice(evidenceAt, evidenceAt + 120);
    if (range.applicationEndAt) {
      const day = range.applicationEndAt.slice(0, 10);
      record("application_end_at", deadlineAtStatedTime(day, text), evidence);
    }
    if (range.applicationStartAt && range.applicationStartAt !== range.applicationEndAt) {
      record("application_start_at", toEventIso(range.applicationStartAt, { hadTime: false, schedule: null, edge: "start" }), evidence);
    }
  }

  if (!structured.contact_info) {
    const contact = sanitizeNoticeFactValue(extractContactInfo(text), "contact");
    if (contact) record("contact_info", compactText(contact, 1000), contact);
  }

  if (Object.keys(columns).length === 0) return null;
  if (columns.application_end_at && (!structured.deadline_type || structured.deadline_type === "unknown")) {
    columns.deadline_type = "fixed";
  }
  const fieldConfidence = Math.min(ocr.confidence, OCR_FIELD_CONFIDENCE_CAP);
  const current = Number(structured.data_confidence);
  columns.data_confidence = Number.isFinite(current) ? Math.min(current, fieldConfidence) : fieldConfidence;
  columns.verification_status = "needs_review";
  return {
    columns,
    record: {
      rules: OCR_FILL_RULES,
      source: "ocr",
      model: ocr.model,
      ocrConfidence: ocr.confidence,
      fieldConfidence,
      checkedAt: ocr.checkedAt,
      needsPersonReview: true,
      fields,
    },
  };
}

/** True when OCR-derived values wait for a person (blocks AI auto-approval). */
export function ocrFactsNeedPersonReview(fieldVerification) {
  return asObject(asObject(fieldVerification).ocrFacts).needsPersonReview === true;
}

/** "대상: … · 기간: … · 문의: …" from OCR fills, for an image-only notice without a summary of facts. */
export function ocrFactsSummaryLine(fills) {
  const fields = asObject(fills?.record?.fields);
  const day = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) : null);
  const period = [day(fields.application_start_at?.value), day(fields.application_end_at?.value)].filter(Boolean);
  const parts = [
    fields.eligibility_summary?.value ? `대상: ${fields.eligibility_summary.value}` : null,
    period.length ? `기간: ${period.length === 2 ? `${period[0]} ~ ${period[1]}` : `~ ${period[0]}`}` : null,
    fields.contact_info?.value ? `문의: ${fields.contact_info.value}` : null,
  ].filter(Boolean);
  return parts.length ? Array.from(parts.join(" · ")).slice(0, 300).join("") : null;
}
