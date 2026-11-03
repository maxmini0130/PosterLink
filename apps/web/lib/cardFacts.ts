/**
 * Poster card lines 1–2 (UI plan 3-4 C, 「포스터 카드」 and 「지역 문구」).
 * Only values confirmed in the source are shown; anything unconfirmed returns
 * null so the card leaves the whole line out instead of guessing.
 */

export type RegionBasis = "venue" | "eligibility" | "institution" | "related";

export type CardRegion = {
  id: string;
  code?: string | null;
  name: string;
  level?: string | null;
  /** poster_regions.basis; null until classified. */
  basis?: RegionBasis | null;
};

/** One entry of field_verification.classification.regions. */
export type RegionEvidence = {
  code?: string | null;
  source?: string | null;
  evidence?: string | null;
};

const BASIS_ORDER: Record<RegionBasis, number> = {
  eligibility: 0,
  venue: 1,
  institution: 2,
  related: 3,
};

/**
 * Infers a region's basis while poster_regions.basis is not stored yet: a
 * residence condition in the source → eligibility, a keyword that is part of
 * the event place → venue, anything else → related.
 */
export function inferRegionBasis(
  region: CardRegion,
  evidence: RegionEvidence[],
  eventLocation?: string | null,
): RegionBasis {
  if (region.basis) return region.basis;
  const own = evidence.filter((item) => item.code === region.code);
  if (own.some((item) => item.source === "eligibility_scope"))
    return "eligibility";
  const place = (eventLocation ?? "").replace(/\s+/g, "");
  const short = region.name.replace(
    /(특별시|광역시|특별자치시|특별자치도)$/,
    "",
  );
  if (place && short.length >= 2 && place.includes(short)) return "venue";
  return "related";
}

function shortName(region: CardRegion) {
  if (region.level === "sido") return region.name.replace(/특별시|광역시/, "");
  return region.name;
}

/**
 * `마포구에서` (venue), `마포구 주민` (residence confirmed), `마포구 관련`
 * (keyword only), `서울 전체`, `전국`. A 시·군·구 wins over 시·도 and 전국.
 */
export function regionPhrase(
  regions: CardRegion[],
  evidence: RegionEvidence[] = [],
  eventLocation?: string | null,
): string | null {
  const local = regions
    .filter((region) => region.level === "sigungu")
    .map((region) => ({
      region,
      basis: inferRegionBasis(region, evidence, eventLocation),
    }))
    .sort((a, b) => BASIS_ORDER[a.basis] - BASIS_ORDER[b.basis]);
  if (local.length) {
    const { basis } = local[0];
    const same = local.filter((item) => item.basis === basis);
    const names =
      same.length === 1
        ? same[0].region.name
        : same.length === 2
          ? `${same[0].region.name}·${same[1].region.name}`
          : `${same[0].region.name} 외 ${same.length - 1}곳`;
    if (basis === "eligibility") return `${names} 주민`;
    if (basis === "venue") return `${names}에서`;
    return `${names} 관련`;
  }
  const sido = regions.find((region) => region.level === "sido");
  if (sido) return `${shortName(sido)} 전체`;
  if (regions.some((region) => region.level === "nation")) return "전국";
  return null;
}

const AUDIENCE_LABELS: Array<[RegExp, string]> = [
  [/제한\s*없|누구나|전\s*연령|일반\s*시민/, "누구나"],
  [/예비\s*창업|창업\s*기업|스타트업|초기\s*창업/, "창업기업"],
  [/소상공인|자영업/, "소상공인"],
  [/1인\s*가구/, "1인 가구"],
  [/신혼\s*부부/, "신혼부부"],
  [/다문화/, "다문화가족"],
  [/한부모/, "한부모가족"],
  [/영유아|임산부/, "영유아 가정"],
  // 중소기업 as the applicant, not "중소기업 근로자" (people who work there).
  [/중소\s*기업(?!\s*(근로자|재직자|직원|종사자))/, "중소기업"],
  [/초등/, "초등학생"],
  [/중\s*[·ㆍ,]?\s*고등|중학생|고등학생/, "중·고등학생"],
  [/대학생/, "대학생"],
  [/청소년/, "청소년"],
  [/청년/, "청년"],
  [/학부모|부모/, "부모"],
  [/어르신|노인|시니어|65세\s*이상/, "어르신"],
  [/장애인/, "장애인"],
  [/구직자|미취업/, "구직자"],
  [/직장인|재직자|근로자/, "직장인"],
];

/**
 * Short applicant label from the labelled 대상 text or the stored age range.
 * A label is never taken from a title or an organization name (청년센터 is not
 * a statement that applicants must be 청년).
 */
export function targetLabel(input: {
  eligibilitySummary?: string | null;
  targetAgeMin?: number | null;
  targetAgeMax?: number | null;
}): string | null {
  const { targetAgeMin: min, targetAgeMax: max } = input;
  if (min != null && max != null) return `만 ${min}~${max}세`;
  if (min != null) return `만 ${min}세 이상`;
  if (max != null) return `만 ${max}세 이하`;
  const text = (input.eligibilitySummary ?? "").slice(0, 300);
  if (!text.trim()) return null;
  for (const [pattern, label] of AUDIENCE_LABELS)
    if (pattern.test(text)) return label;
  return null;
}

/** `지역 문구 · 신청 대상`; a 주민 target repeats nothing the region says. */
export function cardMetaLine(
  region: string | null,
  target: string | null,
): string | null {
  const parts = [region, region?.endsWith("주민") ? null : target].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length ? parts.join(" · ") : null;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function kstParts(value: string | number | Date) {
  const date = new Date(new Date(value).getTime() + 9 * 3600000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
    key: date.toISOString().slice(0, 10),
  };
}

/** KST calendar date (YYYY-MM-DD) of an instant. */
export function kstDateKey(value: string | number | Date) {
  return kstParts(value).key;
}

/** `11.15(토)` in Asia/Seoul. */
export function eventDayLabel(value: string) {
  const p = kstParts(value);
  return `${p.month}.${p.day}(${WEEKDAYS[p.weekday]})`;
}

export type CardSchedule = {
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  /** posters.event_schedule_kind when stored. */
  scheduleKind?: string | null;
};

const DAY = 86400000;

/**
 * The day an event takes place, for 행사·교육 cards: single days and short
 * runs (up to a week) only. Long programmes and recurring sessions say
 * nothing here, and a run that already ended returns null.
 */
export function eventDayFor(schedule: CardSchedule, now: Date): string | null {
  const { eventStartAt: start, eventEndAt: end, scheduleKind } = schedule;
  if (!start || Number.isNaN(Date.parse(start))) return null;
  if (scheduleKind === "recurring" || scheduleKind === "unknown") return null;
  const last = end && !Number.isNaN(Date.parse(end)) ? end : start;
  if (kstDateKey(last) < kstDateKey(now)) return null;
  const length = Date.parse(last) - Date.parse(start);
  if (length < 0 || length > 7 * DAY) return null;
  return eventDayLabel(start);
}

/** Whether the event already took place (home leaves such posters out). */
export function eventEnded(schedule: CardSchedule, now: Date) {
  const last = schedule.eventEndAt || schedule.eventStartAt;
  if (!last || Number.isNaN(Date.parse(last))) return false;
  return kstDateKey(last) < kstDateKey(now);
}

const EVENT_LIKE = new Set([
  "CAT_EVENT_RECRUIT",
  "CAT_COURSE",
  "CAT_CULTURE",
  "CAT_EDUCATION",
  "CAT_CONTEST",
]);

export type CardBenefit = CardSchedule & {
  benefitSummary?: string | null;
  /** posters.card_facts_status; only verified values reach the card. */
  cardFactsStatus?: string | null;
  primaryCategoryCode?: string | null;
};

/**
 * Card line 2: the confirmed key fact, with the event day for 행사·교육
 * (`무료 · 11.15(토) 진행`). Null when nothing is confirmed.
 */
export function benefitLine(input: CardBenefit, now: Date): string | null {
  const benefit =
    input.cardFactsStatus === "verified" && input.benefitSummary?.trim()
      ? input.benefitSummary.trim()
      : null;
  const day =
    input.primaryCategoryCode && EVENT_LIKE.has(input.primaryCategoryCode)
      ? eventDayFor(input, now)
      : null;
  const when = day ? `${day} 진행` : null;
  if (benefit && when && !benefit.includes(day!)) return `${benefit} · ${when}`;
  return benefit ?? when;
}
