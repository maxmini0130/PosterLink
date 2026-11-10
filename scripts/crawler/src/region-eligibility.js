/**
 * Who may apply, by region, read from a poster's target text (docs/design/v6.1
 * SPEC 8 '지역과 신청 자격'). Used to fill poster_regions.basis and to add the
 * 서울 link a 서울-wide poster needs to show in every 구 of the home.
 *
 * Kinds (first match wins):
 *   seoul_wide       서울 as a whole: "서울특별시 권역 청년", "서울시 생활권", "서울시
 *                    거주", "서울시 소재 기업", "서울시민", "서울 청년".
 *   gu_restricted    residents (or people active) of a 구 only: "강북구민",
 *                    "금천구 주민", "영등포구 거주 청년", "마포구민 누구나".
 *   gu_preferred     open, with a 구 preferred: "송파구민 우대", "강동·송파
 *                    생활권 등 우대", "마포구·서대문구 거주자 우선".
 *   open             no regional limit stated: "청년 누구나", "제한없음".
 *   review           both a 구 limit and an open clause ("성북구민 및 방문객
 *                    누구나"): a person decides.
 *   unknown          nothing about region in the text.
 *
 * Pure. The evidence is the matched phrase, kept with every decision.
 */

export const REGION_ELIGIBILITY_RULES_VERSION = "region-eligibility-20261110";

const MAX_EVIDENCE = 160;

function compact(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

/** "대상: …" lines of a long summary (참여·신청·모집·지원·교육 대상). */
export function targetLines(summaryLong) {
  const lines = [];
  const pattern =
    /(?:^|\n)\s*[-•·*▶▪◦○◎■□✔✅📌🔸]?\s*(?:참여|신청|모집|지원|교육|참가)?\s*대상\s*[:：]?\s*([^\n]{1,200})/g;
  for (const match of String(summaryLong ?? "").matchAll(pattern))
    lines.push(compact(match[1]));
  return lines;
}

/** The texts that say who may apply. */
export function targetTexts(row = {}) {
  const facts = asObject(
    asObject(asObject(row.field_verification).readableNotice).facts,
  );
  return [
    row.eligibility_summary,
    row.facts?.target ?? facts.target,
    ...targetLines(row.summary_long),
  ]
    .map(compact)
    .filter(Boolean);
}

// 서울 named as the applicants' area. 서울청년센터·서울청년정책 and the like are
// organisation names, not an area, so "서울 청년" must not run into them.
const SEOUL_WIDE = [
  /서울(?:특별)?시?\s*(?:권역|거점|생활권)/,
  /서울(?:특별)?시?\s*(?:에서|내|에)?\s*(?:거주|소재|재학|재직|활동|일하)/,
  /서울(?:특별)?시민/,
  /서울(?:특별)?시?\s+청년(?!\s*(?:센터|공간|몽땅|정책|문화|허브|취업|일자리|수당|활동|지원|동행|창업))/,
];

// A 구 named as the applicants' area.
const GU = "[가-힣]{1,4}구";
const GU_LIMIT = new RegExp(
  `(${GU})(?:\\s*(?:·\\s*[가-힣]{1,4}구)*)\\s*(?:민|주민|에\\s*(?:거주|소재)|거주|소재\\s*(?:대학|학교|사업장|직장|기업))`,
  "g",
);
const PREFERENCE = /^[^.,;]{0,24}?(?:우대|우선|가점)/;
const AREA_PREFERENCE = /(?:생활권|거주자?|구민)\s*(?:등\s*)?(?:우대|우선)/;
const NOT_REGIONAL =
  /(?:성별|연령|나이|학력|경력|국적)\s*(?:제한|무관)\s*(?:은|이)?\s*(?:없|무관)?[가-힣]*/g;
const LOCAL_ONLY = /(?:^|[^가-힣])(?:구민|지역\s*주민|관내)/;
const OPEN =
  /누구나|제한\s*없음|제한없음|거주지?\s*(?:무관|제한\s*없)|지역\s*(?:무관|제한\s*없)|거주\s*제한으로\s*해석하지\s*않/;

function evidence(text) {
  return compact(text).slice(0, MAX_EVIDENCE);
}

/**
 * @returns {{kind: string, evidence: string|null, gus: string[]}}
 *   gus: the 구 names a gu_restricted / gu_preferred decision refers to.
 */
export function classifyRegionEligibility(texts) {
  const list = (Array.isArray(texts) ? texts : [texts])
    .map(compact)
    .filter(Boolean);
  const joined = list.join(" / ");
  if (!joined) return { kind: "unknown", evidence: null, gus: [] };

  for (const pattern of SEOUL_WIDE) {
    const match = joined.match(pattern);
    if (match) {
      const at = Math.max(0, match.index - 30);
      return {
        kind: "seoul_wide",
        evidence: evidence(
          joined.slice(at, match.index + match[0].length + 40),
        ),
        gus: [],
      };
    }
  }

  const cleaned = joined.replace(NOT_REGIONAL, " ");
  const limits = [];
  const preferred = [];
  for (const match of cleaned.matchAll(GU_LIMIT)) {
    const after = cleaned.slice(match.index + match[0].length);
    const names = match[0].match(new RegExp(GU, "g")) ?? [];
    // "마포구민 누구나" limits to 마포구민; "구민 우대" only prefers them.
    if (PREFERENCE.test(after)) preferred.push(...names);
    else limits.push({ names, at: match.index, text: match[0] });
  }
  const openMatch = cleaned.match(OPEN);
  const openElsewhere =
    openMatch &&
    !limits.some(
      (limit) =>
        // "마포구민 누구나": the 누구나 belongs to the limit itself.
        openMatch.index >= limit.at &&
        openMatch.index - (limit.at + limit.text.length) <= 3,
    );

  if (limits.length) {
    const gus = [...new Set(limits.flatMap((limit) => limit.names))];
    // "청년 및 은평구민 누구나": another group stands before the first 구
    // condition. ("강북구 거주 청년 또는 강북구 소재 대학" is one 구 throughout.)
    const first = limits[0];
    const alongside = /(?:및|또는|이나|혹은)\s*$/.test(
      cleaned.slice(Math.max(0, first.at - 6), first.at),
    );
    return {
      kind: openElsewhere || alongside ? "review" : "gu_restricted",
      evidence: evidence(joined),
      gus,
    };
  }
  if (preferred.length || AREA_PREFERENCE.test(cleaned))
    return {
      kind: "gu_preferred",
      evidence: evidence(joined),
      gus: [...new Set(preferred)],
    };
  // "구민 누구나", "지역주민 누구나", "관내 … 누구나": local people, 구 unnamed.
  if (openMatch && LOCAL_ONLY.test(cleaned))
    return { kind: "review", evidence: evidence(joined), gus: [] };
  if (openMatch) return { kind: "open", evidence: evidence(joined), gus: [] };
  return { kind: "unknown", evidence: evidence(joined), gus: [] };
}

/** Organiser groups, for reporting and the "서울시·산하기관 first" scope. */
export function organizerGroup(name) {
  const value = compact(name);
  if (!value || value === "-" || value === "null") return "unknown";
  // 구청 and the bodies a 구 runs (보건소, 가족센터, 1인가구지원센터, 문화재단 …).
  if (/^[가-힣]{1,4}구(?!민)/.test(value) || /구청|구립/.test(value))
    return "gu_office";
  if (
    /^서울|서울청년센터|서울시|서울특별시|SH|에스에이치|청년몽땅|서울창업허브|서울경제진흥원|서울신용보증|서울시복지재단|서울여성|50플러스|서울문화재단|세종문화회관|서울주택/.test(
      value,
    )
  )
    return "seoul_affiliate";
  return "other";
}
