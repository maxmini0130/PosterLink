import { SEOUL_SIGUNGU_REGIONS } from "./region-rules.js";
import {
  applyRegionEligibility,
  classifyRegionEligibility,
  REGION_ELIGIBILITY_RULES_VERSION,
  targetTexts,
} from "./region-eligibility.js";

// Home v5 card facts: one short benefit line, the event schedule shape, an
// organizer candidate and why each region is attached.
//
// Every value here is a *candidate* for human review (card_facts_status =
// 'needs_review'). Rules only copy text that is literally present in the
// notice; when nothing is confirmed they return null instead of guessing.
// Precision matters more than recall: an empty card line is better than a
// wrong "무료".

export const CARD_FACTS_VERSION = "card-facts-v1-20261103";
export const CARD_FACTS_STATUS = "needs_review";
export const BENEFIT_SUMMARY_MAX_LENGTH = 20;
export const EVIDENCE_MAX_LENGTH = 160;

export const BENEFIT_KINDS = ["free", "grant", "prize", "service", "paid", "experience"];
export const SCHEDULE_KINDS = ["single", "range", "recurring", "unknown"];
export const REGION_BASES = ["venue", "eligibility", "institution", "related"];

// Collection channels that republish other organizations' notices. A poster
// found there is never first-party for the channel itself.
export const AGGREGATOR_SOURCES = [
  { slug: "youth-seoul", names: ["청년몽땅정보통"] },
  { slug: "k-startup", names: ["K-Startup", "케이스타트업"] },
  { slug: "seoul-city", names: ["서울특별시", "서울시"] },
];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function excerpt(text, index, length, max = EVIDENCE_MAX_LENGTH) {
  const source = String(text ?? "");
  const pad = Math.max(0, Math.floor((max - length) / 2));
  const start = Math.max(0, index - Math.min(pad, 50));
  return compact(source.slice(start, start + max)).slice(0, max);
}

function fitSummary(...options) {
  for (const option of options) {
    const text = compact(option);
    if (text && text.length <= BENEFIT_SUMMARY_MAX_LENGTH) return text;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

const AMOUNT_SOURCE = String.raw`\d[\d,.]*\s*(?:억|천만|백만|만|천)?\s*원`;

export function normalizeAmount(raw) {
  const text = compact(raw).replace(/\s+/g, "");
  const match = text.match(/^(\d[\d,.]*)(억|천만|백만|만|천)?원$/);
  if (!match) return text;
  const [, digits, unit] = match;
  if (unit) return `${digits}${unit}원`;
  const value = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(value)) return text;
  if (value === 0) return "0원";
  if (value >= 10000 && value % 10000 === 0) return `${(value / 10000).toLocaleString("en-US")}만원`;
  return `${value.toLocaleString("en-US")}원`;
}

function amountIsZero(raw) {
  return /^0+\s*원$/.test(compact(raw));
}

// ---------------------------------------------------------------------------
// Benefit text preparation
// ---------------------------------------------------------------------------

// Sentences that mention 무료/원 without describing the program itself.
const BOILERPLATE_PATTERNS = [
  // K-Startup footer: "공공데이터포털(www.data.go.kr)에서 공공데이터로 개방중이며 무료로 활용할 수 있습니다."
  /[^.\n]*(?:공공데이터|data\.go\.kr)[^.\n]*(?:\.|\n|$)/g,
  /[^.\n,]*주차[^.\n,]*/g,
  /전액\s*(?:환불|반환|환급)/g,
  /무료\s*(?:와이파이|wifi|Wi-Fi)/gi,
];

function stripBoilerplate(text) {
  let result = String(text ?? "");
  // Blank out instead of deleting so match indexes still point into the raw
  // text, which is what evidence excerpts quote.
  for (const pattern of BOILERPLATE_PATTERNS) {
    result = result.replace(pattern, (match) => " ".repeat(match.length));
  }
  return result;
}

function buildBenefitSegments(input = {}) {
  const facts = asObject(input.facts);
  const segments = [
    ["participation_fee", input.participation_fee],
    ["benefits_summary", input.benefits_summary],
    ["facts.benefits", facts.benefits],
    ["facts.content", facts.content],
    ["title", input.title],
    ["summary_short", input.summary_short],
    ["facts.target", facts.target],
    ["facts.period", facts.period],
    ["summary_long", input.summary_long],
  ];
  const seen = new Set();
  const result = [];
  for (const [field, value] of segments) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    const key = compact(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ field, raw, text: stripBoilerplate(raw) });
  }
  return result;
}

const NEGATION_AFTER = /^[^.\n●■▶✔✅]{0,25}?(?:아님|아닙|아니|뜻하지|의미하지|않습|않음|않으|불가)/;
const PAID_BEFORE = /유료|별도\s*$/;

function isNegated(text, matchIndex, matchLength) {
  const after = text.slice(matchIndex + matchLength, matchIndex + matchLength + 30);
  if (NEGATION_AFTER.test(after)) return true;
  // "무료 ~ 3,000원 (프로그램별 상이)" is a price range, not a free program.
  if (/^\s*[~∼～-]\s*[\d,]+\s*(?:만|천)?\s*원/.test(after)) return true;
  const before = text.slice(Math.max(0, matchIndex - 6), matchIndex);
  return PAID_BEFORE.test(before);
}

// ---------------------------------------------------------------------------
// Candidate rules
// ---------------------------------------------------------------------------

const FEE_LABEL_SOURCE =
  "참가비용|참가비|참여비|참가료|수강료|교육비|관람료|입장료|체험비|체험료|훈련비|수업료|강습비|학습비|이용료|기본가|비용|회비|재료비|가격";
const DISPLAY_FEE_LABEL = {
  참가비용: "참가비",
  체험료: "체험비",
  기본가: "",
  비용: "",
};
const PRIMARY_FEE_LABELS = new Set([
  "참가비용", "참가비", "참여비", "참가료", "수강료", "교육비", "관람료", "입장료",
  "체험비", "체험료", "훈련비", "수업료", "강습비", "학습비", "이용료", "기본가", "비용",
  "회비", "가격",
]);

function displayFeeLabel(label) {
  return Object.hasOwn(DISPLAY_FEE_LABEL, label) ? DISPLAY_FEE_LABEL[label] : label;
}

const FEE_FREE_PATTERN = new RegExp(
  String.raw`(?<label>${FEE_LABEL_SOURCE})\s*(?:\((?:1인|1인\s*기준|인당)\))?\s*[:：|]?\s*(?<pre>전석|전액|전면|모두)?\s*(?<free>무료|0\s*원)(?<paren>\s*\([^)\n]{1,24}\))?`,
  "g",
);

const FEE_AMOUNT_PATTERN = new RegExp(
  String.raw`(?<label>${FEE_LABEL_SOURCE})\s*(?:\((?:1인|1인\s*기준|인당)\))?\s*[:：|]?\s*(?<mods>(?:(?:1인당|1인|인당|회당|1회당|월|1회|전석|총|[가-힣\d]{1,3}석)\s*)*)(?<amt>${AMOUNT_SOURCE})`,
  "g",
);

const FREE_PHRASE_PATTERNS = [
  { rule: "free_all_seats", kind: "free", pattern: /전석\s*무료/g, summary: () => "전석 무료" },
  {
    rule: "free_fee_fully_supported",
    kind: "free",
    pattern: /(?<label>교육비|수강료|훈련비|참가비|참여비|체험비)\s*(?:\S{0,4}\s*)?전액\s*(?<verb>무료|지원|국비\s*지원)/g,
    summary: (m) => `${m.groups.label} 전액 ${m.groups.verb.replace(/\s+/g, " ")}`,
  },
  {
    rule: "free_service_sessions",
    kind: "service",
    pattern: /(?<noun>상담|코칭|컨설팅|멘토링|검사|진단|치료)\s*(?<count>\d{1,2})\s*회(?:기)?\s*(?:모두\s*)?무료/g,
    summary: (m) => `${m.groups.noun} ${m.groups.count}회 무료`,
  },
  {
    rule: "free_service",
    kind: "service",
    pattern: /무료\s*(?<noun>법률상담|세무상담|노무상담|상담|컨설팅|코칭|멘토링|검사|진단|촬영|대여|설치|건강검진|검진|점검)(?!권|쿠폰)/g,
    summary: (m) => `무료 ${m.groups.noun}`,
  },
  {
    rule: "free_program",
    kind: "free",
    pattern: /무료\s*(?<noun>관람|전시|공연|강연|강의|교육|금융교육|체험|참여|참가|특강|특별상영회|상영회|상영|수강|클래스|수업|입장|행사|프로그램)(?!권|쿠폰)/g,
    summary: (m) => `무료 ${m.groups.noun}`,
  },
  {
    rule: "free_program_postfix",
    kind: "free",
    pattern: /(?<noun>참여|참가|관람|입장|수강|교육|체험)\s*(?:은|는)?\s*무료/g,
    summary: (m) => `${m.groups.noun} 무료`,
  },
  {
    rule: "free_fully",
    kind: "free",
    pattern: /전액\s*무료/g,
    summary: () => "전액 무료",
  },
];

// A bare "무료" sentence token in an editor-written summary ("성북구 주민 대상, 무료.").
const FREE_TOKEN_PATTERN = /(?:^|[\s,.·(/])(?<word>무료)(?<paren>\([^)\n]{1,10}\))?(?=\s*[.,)·/!]|\s*$|\s*\n)/g;
const FREE_TOKEN_FIELDS = new Set(["summary_short", "participation_fee", "benefits_summary", "facts.content", "title"]);

const PRIZE_TOTAL_PATTERN = new RegExp(
  String.raw`(?<label>총\s*상금|총\s*시상금|상금\s*총액|총\s*상금액|상금|시상금)\s*[:：]?\s*(?<pre>총\s*|최대\s*)?(?<amt>${AMOUNT_SOURCE})`,
  "g",
);
const PRIZE_RANK_PATTERN = new RegExp(
  String.raw`(?<rank>대상|최우수상?|금상|1등|1위|으뜸상)\s*[:：(]?\s*(?:\d+\s*(?:명|팀)\s*[,/]?\s*)?(?<amt>${AMOUNT_SOURCE})`,
  "g",
);
const CONTEST_CONTEXT = /상금|시상|공모전|공모|경진대회|대회|콘테스트|챌린지|수상/;

const GRANT_NOUN_SOURCE =
  "지원금|장려금|장학금|참여수당|활동수당|수당|활동비|운영비|사업비|지원비|이사비|보조금|바우처|상품권|생활비|교통비|연구비|창업자금|지원금액|지원한도";
const GRANT_PATTERN = new RegExp(
  String.raw`(?:(?<noun>[가-힣]{0,6}(?:${GRANT_NOUN_SOURCE}))\s*[:：]?\s*(?:\([^)]{0,10}\)\s*)?)?(?<mods>(?:(?:월|연|년|1인당|인당|1인|가구당|팀당|기업당|업체당|1회당|회당|최대|총|각)\s*)*)(?<amt>${AMOUNT_SOURCE})(?<tail>[^\n]{0,24})`,
  "g",
);
const GRANT_THRESHOLD_TAIL = /^\s*(?:이하|이상|미만|초과|이내|상당|규모의?\s*(?:기업|매출)|까지\s*(?:이하|인))/;
const GRANT_BLOCK_BEFORE =
  /(?:보증금|전세|임차|소득|보험료|매출|자산|예치금|환불|환산|가격|티켓|참가비|참여비|참가료|수강료|교육비|관람료|입장료|체험비|체험료|재료비|회비|이용료|비용|상금|시상|대상|최우수|우수상|장려상|금상|은상|동상)[^.\n]{0,8}$/;
const GRANT_VERB_TAIL = /^\s*(?:까지\s*)?(?:을|를)?\s*(?<verb>지원|지급|제공|보조|장학금|인턴십\s*장학금)/;
const LOAN_CONTEXT = /대출|융자/;
const MONTHS_TAIL = /^\s*[x×*]\s*(?<months>\d{1,2})\s*개월/;

const EXTRA_PATTERN =
  /(?<noun>기념품|경품|굿즈|수료증|간식|다과|중식|식사|리워드|교재)\s*(?:\S{0,6}\s*)?(?<verb>제공|증정|발급|지급|포함)/g;
const EXTRA_NEGATION = /^(?:[^.\n]{0,8}(?:없음|없습|미제공|불가|제외)|\s*(?:되지|하지)\s*않|\s*안\s*(?:됨|함|돼))/;
// Goods that only some people get (buyers, winners) are not a participant benefit.
const EXTRA_CONDITIONAL_BEFORE = /(?:구매|구입|추첨|당첨|우수|선정작|수상)[^.\n]{0,8}$/;
const FEE_COMPENSATION_TAIL = /^\s*(?:\([^)]{0,12}\)\s*)?(?:을|를)?\s*(?:제공|지급|드림|드립)/;
const FEE_COMPENSATION_BEFORE = /(?:연구|보상|사례비?|답례)\s*$/;
const AMBIGUOUS_GRANT_NOUN = /(?:활동비|운영비|사업비|생활비|교통비|연구비)$/;

function* matchAll(pattern, text) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    yield match;
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
}

function makeCandidate({ rule, kind, summary, segment, match, extra = {} }) {
  return {
    rule,
    kind,
    summary,
    field: segment.field,
    evidence: excerpt(segment.raw ?? segment.text, match.index, match[0].length),
    ...extra,
  };
}

export function collectBenefitCandidates(input = {}) {
  const segments = buildBenefitSegments(input);
  const candidates = [];
  const contestContext = segments.some((segment) => CONTEST_CONTEXT.test(segment.text));

  for (const segment of segments) {
    const text = segment.text;

    for (const match of matchAll(FEE_FREE_PATTERN, text)) {
      if (isNegated(text, match.index, match[0].length)) continue;
      const { label, pre } = match.groups;
      const paren = compact(match.groups.paren);
      const display = displayFeeLabel(label);
      let base;
      if (pre === "전석") base = "전석 무료";
      else if (pre === "전액") base = display ? `${display} 전액 무료` : "전액 무료";
      else base = display ? `${display} 무료` : "무료";
      const caveat = /부담|별도|자비|실비|예치금|보증금/.test(paren);
      const summary = fitSummary(!caveat && paren && !/원/.test(paren) ? `${base}${paren}` : null, base);
      candidates.push(makeCandidate({
        rule: label === "재료비" ? "fee_material_free" : "fee_free",
        kind: "free",
        summary,
        segment,
        match,
        extra: { label, primaryFee: PRIMARY_FEE_LABELS.has(label), caveat },
      }));
    }

    if (segment.field === "participation_fee") {
      // The column holds only the fee, so a leading amount is the total fee
      // ("1인 50,000원(체험료 30,000원+숙박비 20,000원)").
      const leading = text.match(new RegExp(String.raw`^\s*(?<mods>(?:(?:1인당|1인|인당|회당|월|전석)\s*)*)(?<amt>${AMOUNT_SOURCE})`));
      if (leading && !amountIsZero(leading.groups.amt)) {
        const mods = compact(leading.groups.mods);
        candidates.push(makeCandidate({
          rule: "fee_amount",
          kind: "paid",
          summary: fitSummary(`참가비 ${mods ? `${mods} ` : ""}${normalizeAmount(leading.groups.amt)}`),
          segment,
          match: leading,
          extra: { label: "participation_fee", primaryFee: true },
        }));
      }
    }

    for (const match of matchAll(FEE_AMOUNT_PATTERN, text)) {
      const { label, amt } = match.groups;
      if (amountIsZero(amt)) continue;
      const before = text.slice(Math.max(0, match.index - 8), match.index);
      if (/감면|할인|환불/.test(before)) continue;
      const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 16);
      if (/^\s*(?:이하|이상|미만|초과|상당)/.test(tail)) continue;
      // "연구 참여비 1만원 제공" is paid to the participant, not by them.
      if (FEE_COMPENSATION_TAIL.test(tail) || FEE_COMPENSATION_BEFORE.test(before)) continue;
      const mods = compact(match.groups.mods);
      const display = displayFeeLabel(label) || "참가비";
      candidates.push(makeCandidate({
        rule: label === "재료비" ? "fee_material_amount" : "fee_amount",
        kind: "paid",
        summary: fitSummary(`${display} ${mods ? `${mods} ` : ""}${normalizeAmount(amt)}`, `${display} ${normalizeAmount(amt)}`),
        segment,
        match,
        extra: { label, primaryFee: PRIMARY_FEE_LABELS.has(label) && label !== "재료비" },
      }));
    }

    for (const { rule, kind, pattern, summary } of FREE_PHRASE_PATTERNS) {
      for (const match of matchAll(pattern, text)) {
        if (isNegated(text, match.index, match[0].length)) continue;
        candidates.push(makeCandidate({ rule, kind, summary: fitSummary(summary(match)), segment, match }));
      }
    }

    if (FREE_TOKEN_FIELDS.has(segment.field)) {
      for (const match of matchAll(FREE_TOKEN_PATTERN, text)) {
        const wordIndex = match.index + match[0].indexOf("무료");
        if (isNegated(text, wordIndex, 2)) continue;
        const paren = compact(match.groups.paren);
        const usableParen = paren && !/원|부담|별도|자비|예치금|보증금/.test(paren) ? paren : "";
        candidates.push(makeCandidate({
          rule: "free_token",
          kind: "free",
          summary: fitSummary(`무료${usableParen}`, "무료"),
          segment,
          match,
        }));
      }
    }

    if (contestContext) {
      for (const match of matchAll(PRIZE_TOTAL_PATTERN, text)) {
        const label = match.groups.label.replace(/\s+/g, "");
        const pre = compact(match.groups.pre);
        const display = /총/.test(label) || pre === "총" ? "총상금" : label;
        candidates.push(makeCandidate({
          rule: "prize_total",
          kind: "prize",
          summary: fitSummary(`${display} ${pre === "최대" ? "최대 " : ""}${normalizeAmount(match.groups.amt)}`),
          segment,
          match,
        }));
      }
      for (const match of matchAll(PRIZE_RANK_PATTERN, text)) {
        const window = text.slice(Math.max(0, match.index - 80), match.index + match[0].length);
        if (!/상금|시상|수상|포상/.test(window)) continue;
        candidates.push(makeCandidate({
          rule: "prize_rank",
          kind: "prize",
          summary: fitSummary(`${match.groups.rank} ${normalizeAmount(match.groups.amt)}`),
          segment,
          match,
        }));
      }
    }

    for (const match of matchAll(GRANT_PATTERN, text)) {
      const noun = compact(match.groups.noun);
      const mods = compact(match.groups.mods);
      const amt = match.groups.amt;
      const tail = match.groups.tail ?? "";
      if (amountIsZero(amt)) continue;
      if (GRANT_THRESHOLD_TAIL.test(tail)) continue;
      const before = text.slice(Math.max(0, match.index - 24), match.index);
      if (!noun && GRANT_BLOCK_BEFORE.test(before)) continue;
      const verbMatch = tail.match(GRANT_VERB_TAIL);
      const loanTail = /^\s*[가-힣\s]{0,8}(?:대출|융자)/.test(tail);
      const hasGrantMod = /최대|월|연|년|가구당|인당|팀당|기업당|업체당/.test(mods);
      if (!noun && !verbMatch && !loanTail) continue;
      if (!noun && !hasGrantMod) continue;
      // "활동비: 5,000원" can be a fee participants pay; require a payout verb or cap.
      if (noun && AMBIGUOUS_GRANT_NOUN.test(noun) && !verbMatch && !/최대|당/.test(mods)) continue;
      const window = `${before}${match[0]}`;
      const isLoan = LOAN_CONTEXT.test(window) || loanTail;
      const months = tail.match(MONTHS_TAIL)?.groups?.months;
      const amountPhrase = `${mods ? `${mods} ` : ""}${normalizeAmount(amt)}${months ? ` × ${months}개월` : ""}`;
      const amountPhraseShort = `${mods ? `${mods} ` : ""}${normalizeAmount(amt)}`;
      let summary;
      if (isLoan) {
        summary = fitSummary(`대출 ${amountPhrase}`, `대출 ${amountPhraseShort}`);
      } else {
        const verb = verbMatch?.groups?.verb?.replace(/\s+/g, " ");
        summary = fitSummary(
          noun ? `${noun} ${amountPhrase}` : null,
          !noun && verb === "지원" ? `${amountPhrase} 지원` : null,
          amountPhrase,
          noun ? `${noun} ${amountPhraseShort}` : null,
          amountPhraseShort,
        );
      }
      candidates.push(makeCandidate({
        rule: isLoan ? "loan_amount" : "grant_amount",
        kind: isLoan ? "service" : "grant",
        summary,
        segment,
        match,
      }));
    }

    for (const match of matchAll(EXTRA_PATTERN, text)) {
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 12);
      if (EXTRA_NEGATION.test(after)) continue;
      if (EXTRA_CONDITIONAL_BEFORE.test(text.slice(Math.max(0, match.index - 16), match.index))) continue;
      const between = match[0];
      if (/없|미|불/.test(between.slice(match.groups.noun.length))) continue;
      candidates.push(makeCandidate({
        rule: "extra_item",
        kind: "experience",
        summary: fitSummary(`${match.groups.noun} ${match.groups.verb}`),
        segment,
        match,
        extra: { noun: match.groups.noun },
      }));
    }
  }

  const english = String(input.poster_text_summary ?? "");
  const englishMatch = english.match(
    /\b(?:free\s+of\s+charge|free\s+(?:entry|admission|participation|registration|class|program|event)|(?:participate|participation|admission|entry|attend)\s+(?:is\s+)?(?:for\s+)?free|free\s+for\s+\d+)/i,
  );
  if (englishMatch) {
    candidates.push({
      rule: "poster_text_free_en",
      kind: "free",
      summary: "무료",
      field: "poster_text_summary",
      evidence: excerpt(english, englishMatch.index, englishMatch[0].length),
    });
  }

  return candidates.filter((candidate) => candidate.summary);
}

function firstOf(candidates, predicate) {
  return candidates.find(predicate) ?? null;
}

function withExtra(base, candidates, kindOverride) {
  const extra = candidates.find(
    (candidate) => candidate.kind === "experience" && candidate.noun !== "교재" && candidate.field === base.field,
  );
  const summary = extra ? fitSummary(`${base.summary} · ${extra.noun}`, base.summary) : base.summary;
  return { ...base, summary, kind: kindOverride ?? base.kind };
}

function toResult(candidate, rule = candidate.rule) {
  return {
    summary: candidate.summary,
    kind: candidate.kind,
    evidence: candidate.evidence,
    rule: `${rule}@${candidate.field}`,
  };
}

/**
 * Choose one benefit line. Returns {summary, kind, evidence, rule} or null.
 * Conflicting free/paid evidence yields null (rule recorded by explainBenefit).
 */
export function explainBenefit(input = {}) {
  const candidates = collectBenefitCandidates(input);
  if (candidates.length === 0) return { result: null, reason: "no_candidate", candidates };

  const prize = firstOf(candidates, (c) => c.kind === "prize" && c.rule === "prize_total")
    ?? firstOf(candidates, (c) => c.kind === "prize");
  if (prize) return { result: toResult(prize), reason: "prize", candidates };

  const grant = firstOf(candidates, (c) => c.kind === "grant");
  const loan = firstOf(candidates, (c) => c.rule === "loan_amount");
  const primaryFree = firstOf(candidates, (c) => c.rule === "fee_free" && c.primaryFee);
  const primaryPaid = candidates.filter((c) => c.rule === "fee_amount" && c.primaryFee);
  const materialPaid = firstOf(candidates, (c) => c.rule === "fee_material_amount");
  const freePhrase = firstOf(
    candidates,
    (c) => c.kind === "free" && !["fee_free", "fee_material_free", "poster_text_free_en"].includes(c.rule),
  );
  const servicePhrase = firstOf(candidates, (c) => c.kind === "service" && c.rule !== "loan_amount");

  if (grant) return { result: toResult(grant), reason: "grant", candidates };
  if (loan) return { result: toResult(loan), reason: "loan", candidates };

  const anyFree = primaryFree ?? freePhrase ?? servicePhrase;
  if (anyFree && primaryPaid.length > 0) {
    return { result: null, reason: "conflict_free_and_paid", candidates };
  }

  if (primaryFree) {
    if (materialPaid) {
      const summary = fitSummary(`${primaryFree.summary} · ${materialPaid.summary}`);
      if (summary) {
        return {
          result: { ...toResult(primaryFree, "fee_free_with_material"), summary, kind: "paid" },
          reason: "free_fee_with_material",
          candidates,
        };
      }
      return { result: null, reason: "conflict_free_and_material", candidates };
    }
    return { result: toResult(withExtra(primaryFree, candidates)), reason: "fee_free", candidates };
  }

  if (primaryPaid.length > 0) {
    const distinct = new Set(primaryPaid.map((c) => c.summary));
    const first = primaryPaid[0];
    return {
      result: toResult(first, distinct.size > 1 ? "fee_amount_multi" : "fee_amount"),
      reason: "paid",
      candidates,
    };
  }

  if (servicePhrase) return { result: toResult(servicePhrase), reason: "service", candidates };
  if (freePhrase) {
    if (materialPaid) return { result: null, reason: "conflict_free_and_material", candidates };
    return { result: toResult(withExtra(freePhrase, candidates)), reason: "free_phrase", candidates };
  }
  if (materialPaid) return { result: toResult(materialPaid), reason: "material_paid", candidates };

  const english = firstOf(candidates, (c) => c.rule === "poster_text_free_en");
  if (english) return { result: toResult(english), reason: "poster_text_free_en", candidates };

  const extra = firstOf(candidates, (c) => c.kind === "experience" && c.noun !== "교재");
  if (extra) return { result: toResult(extra), reason: "extra_only", candidates };

  return { result: null, reason: "no_selected_candidate", candidates };
}

export function extractBenefit(input = {}) {
  return explainBenefit(input).result;
}

// ---------------------------------------------------------------------------
// Event schedule
// ---------------------------------------------------------------------------

function toKstDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function toTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

const RECURRING_PATTERN =
  /매주|매월|매일|격주|주\s*\d\s*회|월\s*\d\s*회|매달|정기\s*(?:모임|활동|운영)|\d+\s*회차|회차별|\d+\s*차시|\(\s*총\s*\d+\s*회|총\s*\d+\s*회(?:기)?(?!\s*차)|\d\s*차\s*[:：)]|[1-9]\s*기\s*[:：]|(?:월|화|수|목|금|토|일)요일마다|(?:\d+\s*주\s*간)/;

function scheduleText(input) {
  const facts = asObject(input.facts);
  return [input.title, facts.period, facts.content, input.summary_short, String(input.summary_long ?? "").slice(0, 1500)]
    .filter(Boolean)
    .join("\n");
}

/**
 * Describe event_start_at/event_end_at. Dates are never modified; suspicious
 * combinations are reported as issues for review.
 */
export function classifySchedule(input = {}, { now = new Date() } = {}) {
  const issues = [];
  const startAt = toTime(input.event_start_at);
  const endAt = toTime(input.event_end_at);
  const applicationStartAt = toTime(input.application_start_at);
  const applicationEndAt = toTime(input.application_end_at);
  const startDay = toKstDate(input.event_start_at);
  const endDay = toKstDate(input.event_end_at);
  const text = scheduleText(input);
  const recurringMatch = text.match(RECURRING_PATTERN);

  if (startAt == null && endAt == null) {
    return { kind: "unknown", issues, recurringEvidence: recurringMatch?.[0] ?? null };
  }
  if (startAt == null && endAt != null) issues.push("event_end_without_start");
  if (startAt != null && endAt != null && endAt < startAt) issues.push("event_end_before_start");
  if (endAt != null && applicationEndAt != null && endAt < applicationEndAt) {
    const nowTime = now.getTime();
    issues.push(applicationEndAt >= nowTime ? "event_ends_before_open_application_end" : "event_ends_before_application_end");
  }
  if (startAt != null && applicationStartAt != null && endAt != null && endAt < applicationStartAt) {
    issues.push("event_before_application_start");
  }
  const applicationStartDay = toKstDate(input.application_start_at);
  const applicationEndDay = toKstDate(input.application_end_at);
  if (
    startDay && endDay && startDay !== endDay &&
    startDay === applicationStartDay && endDay === applicationEndDay
  ) {
    issues.push("event_range_matches_application_period");
  }
  if (startAt != null && endAt != null && endAt - startAt > 180 * 24 * 60 * 60 * 1000) {
    issues.push("event_range_over_180_days");
  }

  let kind;
  if (startDay && (!endDay || startDay === endDay)) kind = "single";
  else if (startDay && endDay) kind = recurringMatch ? "recurring" : "range";
  else kind = "unknown";

  return { kind, issues, recurringEvidence: kind === "recurring" ? recurringMatch?.[0] ?? null : null };
}

// ---------------------------------------------------------------------------
// Organizer candidate
// ---------------------------------------------------------------------------

const DEPARTMENT_TOKEN = /^[가-힣A-Za-z0-9]{1,12}(?:과|팀|실|국|계|담당관)$/;

/** Canonical key for comparing organization names (not for display). */
export function normalizeOrgKey(value) {
  let text = compact(value)
    .replace(/\(\s*(?:주|재|사|사단법인|재단법인|유)\s*\)|㈜|㈔|주식회사|재단법인|사단법인|\(유\)/g, " ")
    .trim();
  text = text.split(/\s*[·ㆍ,/]\s*/)[0] ?? "";
  const tokens = text.split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && DEPARTMENT_TOKEN.test(tokens[tokens.length - 1])) tokens.pop();
  let key = tokens.join("").replace(/[^가-힣A-Za-z0-9]/g, "").toLowerCase();
  // Mayor/head titles ("서울특별시장", "강동구청장") stand for the government itself.
  key = key.replace(/(특별시|광역시)장$/, "$1").replace(/(구|군)청장$/, "$1").replace(/^서울시장$/, "서울시");
  key = key.replace(/^서울특별시/, "서울시").replace(/^서울(?=[가-힣]+구(?:청)?$)/, "");
  key = key.replace(/(구|시|군)청$/, "$1");
  key = key.replace(/^서울시$/, "서울특별시");
  return key;
}

/** Display form: strip trailing departments and co-organizers, keep legal name. */
export function cleanOrgDisplayName(value) {
  let text = compact(value).replace(/^\[[^\]]*[/·][^\]]*\]\s*/, "");
  text = text.split(/\s*[·ㆍ]\s*/)[0] ?? "";
  const tokens = text.split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && DEPARTMENT_TOKEN.test(tokens[tokens.length - 1])) tokens.pop();
  text = tokens.join(" ");
  return text.replace(/^\(\s*(?:재|사)\s*\)\s*/, "").trim() || null;
}

export function isAggregatorSource({ slug, name } = {}) {
  const key = normalizeOrgKey(name);
  return AGGREGATOR_SOURCES.some(
    (source) => (slug && source.slug === slug) || (key && source.names.some((n) => normalizeOrgKey(n) === key)),
  );
}

// True when the name is the collection channel the poster came from (e.g.
// 청년몽땅정보통 on youth-seoul). Another aggregator's name is a real org there:
// "서울특별시 <...>" on 청년몽땅정보통 is Seoul City itself.
function isChannelName(name, input) {
  const key = normalizeOrgKey(name);
  if (!key) return true;
  const sourceKey = normalizeOrgKey(input.source_institution_name ?? input.source_org_name);
  const channel = AGGREGATOR_SOURCES.find(
    (source) =>
      (input.source_institution_slug && source.slug === input.source_institution_slug) ||
      (sourceKey && source.names.some((n) => normalizeOrgKey(n) === sourceKey)),
  );
  if (channel?.names.some((n) => normalizeOrgKey(n) === key)) return true;
  // The youth portal name is never an organizer, whatever the source.
  return key === normalizeOrgKey("청년몽땅정보통");
}

const ORG_SUFFIX =
  /(?:구청|시청|군청|구|시|군|센터|재단|복지관|도서관|도서관마을|협동조합|공단|공사|문화원|대학교|학교|사업단|산학협력단|연구소|박물관|미술관|과학관|갤러리|협회|조합|위원회|청|부|처|보건소|주민센터|자치회|문화의집|청년청|청년지음|배움터|발전소|아트리움|1번가|공간|교회|본부|사무국|스테이션|기관|원|회|관)$/;
const BRANCH_SUFFIX = /(?:센터|청년센터|청)\s+[가-힣]{1,6}$/;
const GENERIC_TAIL =
  /(?:안내|모집|축제|행사|특강|프로그램|위한|강좌|교실|챌린지|캠페인|공연|전시|모임|이벤트|신청|개최|공고|참여자|참가자|대상자|사업|토론회|설명회|박람회)$|[는할]$/;
const GENERIC_BRACKET = /^(?:모집|안내|마감|공지|접수|선착순|무료|모집중|긴급|재공고|추가모집|진행중|종료|이벤트|공모|필독|중요|D-\d+)$/;

function looksLikeOrgName(name) {
  const text = compact(name);
  if (text.length < 2 || text.length > 30) return false;
  if (/^(?:(?:19|20)\d{2}(?:\s*년)?(?:\s|$)|\d{1,4}\s*년|제\s*\d+\s*(?:회|편|기))/.test(text)) return false;
  if (/[:：|「」『』<>《》"“”'‘’!?~]/.test(text)) return false;
  if (text.split(/\s+/).length > 4) return false;
  if (GENERIC_TAIL.test(text)) return false;
  return true;
}

function orgSuffixScore(name) {
  const text = compact(name);
  if (ORG_SUFFIX.test(text) || BRANCH_SUFFIX.test(text)) return 1;
  return 0;
}

export function extractTitleOrgPrefix(title) {
  const text = compact(title);
  if (!text) return null;
  const bracket = text.match(/^\[([^\]]{2,30})\]/);
  if (bracket) {
    const inner = bracket[1].trim();
    if (!GENERIC_BRACKET.test(inner) && !/[/·]/.test(inner) && looksLikeOrgName(inner) && orgSuffixScore(inner)) {
      return { name: inner, pattern: "bracket", evidence: bracket[0] };
    }
  }
  const legal = text.match(/^(\(\s*(?:재|사)\s*\)|㈜|\(\s*주\s*\)|재단법인|사단법인)\s*([가-힣A-Za-z0-9]{2,20})/);
  if (legal) {
    return { name: `${legal[1].replace(/\s+/g, "")}${legal[2]}`, pattern: "legal_prefix", evidence: legal[0] };
  }
  // "[서초/문화예술] 서초문화재단 <...>": drop a category tag before the org.
  const untagged = text.replace(/^\[[^\]]{1,20}\]\s*/, "");
  const angle = untagged.match(/^([^<\[\]]{2,40}?)\s*</);
  if (angle) {
    const prefix = angle[1].trim();
    // "서울특별시 X 동국대학교" names co-hosts; keep each part for matching.
    const parts = prefix.split(/\s+[xX×]\s+/).map((part) => part.trim()).filter(Boolean);
    if (parts.every((part) => looksLikeOrgName(part))) {
      return { name: parts[0], parts, pattern: "angle", evidence: `${prefix} <` };
    }
  }
  if (looksLikeOrgName(text) && orgSuffixScore(text) && text.split(/\s+/).length <= 2) {
    return { name: text, pattern: "title_is_org", evidence: text };
  }
  return null;
}

function sameOrg(a, b) {
  const ka = normalizeOrgKey(a);
  const kb = normalizeOrgKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const [shorter, longer] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  return shorter.length >= 4 && longer.includes(shorter);
}

function existingFieldCandidate(input) {
  const organization = asObject(input.organization);
  const values = [
    { value: input.organizer_name, field: "organizer_name", confidence: Number(organization.confidence) || 0.75 },
    { value: organization.organizerName, field: "organization.organizerName", confidence: Number(organization.confidence) || 0.75 },
  ];
  if (
    input.source_org_name &&
    normalizeOrgKey(input.source_org_name) !== normalizeOrgKey(input.source_institution_name)
  ) {
    values.push({ value: input.source_org_name, field: "source_org_name", confidence: 0.6 });
  }
  for (const { value, field, confidence } of values) {
    const name = cleanOrgDisplayName(value);
    if (!name || isChannelName(name, input)) continue;
    if (!looksLikeOrgName(name)) continue;
    return { name, field, confidence: Math.min(0.9, confidence), raw: compact(value) };
  }
  return null;
}

/**
 * Organizer candidate with basis title_prefix | existing_field | first_party_source.
 * Returns {name, basis, confidence, evidence} or null.
 */
export function extractOrganizerCandidate(input = {}) {
  const aggregator = isAggregatorSource({ slug: input.source_institution_slug, name: input.source_institution_name ?? input.source_org_name });
  const titlePrefix = extractTitleOrgPrefix(input.title);
  const existing = existingFieldCandidate(input);
  const titleName = titlePrefix && !isChannelName(titlePrefix.name, input) ? cleanOrgDisplayName(titlePrefix.name) : null;

  if (aggregator) {
    const titleFirst = input.source_institution_slug === "youth-seoul" || normalizeOrgKey(input.source_institution_name) === normalizeOrgKey("청년몽땅정보통");
    const titleCandidate = titleName
      ? {
          name: titleName,
          basis: "title_prefix",
          confidence: titlePrefix.pattern === "title_is_org" ? 0.6 : orgSuffixScore(titleName) ? 0.85 : 0.7,
          evidence: `title: ${titlePrefix.evidence}`.slice(0, EVIDENCE_MAX_LENGTH),
        }
      : null;
    const existingCandidate = existing
      ? {
          name: existing.name,
          basis: "existing_field",
          confidence: existing.confidence,
          evidence: `${existing.field}: ${existing.raw}`.slice(0, EVIDENCE_MAX_LENGTH),
        }
      : null;
    const coHost = titleCandidate && existingCandidate && (titlePrefix.parts ?? []).slice(1)
      .find((part) => sameOrg(part, existingCandidate.name));
    if (coHost) titleCandidate.name = cleanOrgDisplayName(coHost);
    if (titleCandidate && existingCandidate && sameOrg(titleCandidate.name, existingCandidate.name)) {
      const preferred = titleFirst ? titleCandidate : existingCandidate;
      return {
        ...preferred,
        confidence: 0.95,
        evidence: `${titleCandidate.evidence} | ${existingCandidate.evidence}`.slice(0, EVIDENCE_MAX_LENGTH),
      };
    }
    const ordered = titleFirst ? [titleCandidate, existingCandidate] : [existingCandidate, titleCandidate];
    const chosen = ordered.find(Boolean);
    if (!chosen) return null;
    const other = ordered.find((candidate) => candidate && candidate !== chosen);
    if (other) {
      return {
        ...chosen,
        confidence: Math.min(chosen.confidence, 0.7),
        evidence: `${chosen.evidence} | disagrees: ${other.evidence}`.slice(0, EVIDENCE_MAX_LENGTH),
      };
    }
    return chosen;
  }

  const sourceName = compact(input.source_institution_name ?? input.source_org_name);
  if (!sourceName) {
    return existing
      ? { name: existing.name, basis: "existing_field", confidence: Math.min(existing.confidence, 0.6), evidence: `${existing.field}: ${existing.raw}`.slice(0, EVIDENCE_MAX_LENGTH) }
      : null;
  }
  // First-party board: the source institution itself unless the title names
  // another organization explicitly (legal prefix or bracket with org suffix).
  if (titlePrefix && ["legal_prefix", "bracket"].includes(titlePrefix.pattern) && !sameOrg(titlePrefix.name, sourceName)) {
    return {
      name: cleanOrgDisplayName(titlePrefix.name),
      basis: "title_prefix",
      confidence: 0.8,
      evidence: `title: ${titlePrefix.evidence} (source: ${sourceName})`.slice(0, EVIDENCE_MAX_LENGTH),
    };
  }
  const agrees = existing && sameOrg(existing.name, sourceName);
  return {
    name: sourceName,
    basis: "first_party_source",
    confidence: agrees ? 0.9 : existing ? 0.7 : 0.8,
    evidence: (`source institution: ${sourceName}` + (existing && !agrees ? ` | ${existing.field}: ${existing.raw}` : "")).slice(0, EVIDENCE_MAX_LENGTH),
  };
}

// ---------------------------------------------------------------------------
// Region basis
// ---------------------------------------------------------------------------

const REGION_NAME_BY_CODE = {
  REG_SEOUL: "서울",
  REG_NATION: "전국",
  ...Object.fromEntries(SEOUL_SIGUNGU_REGIONS.map(([code, name]) => [code, name])),
};

function regionNameVariants(name, code) {
  const base = compact(name || REGION_NAME_BY_CODE[code] || "");
  if (!base) return [];
  const variants = new Set([base]);
  const stem = base.replace(/(특별시|광역시|구|시|군|동)$/, "");
  if (stem.length >= 2) variants.add(stem);
  return [...variants];
}

function eligibilityEvidence(text, variants) {
  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escaped}(?:\\s*(?:에|내|소재|관내))?\\s*(?:거주|구민|시민|주민|생활|재학|재직|소재|활동)`);
    const match = String(text ?? "").match(pattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * Why each attached region applies. regions: [{code,name}], fv_regions:
 * [{code,source,evidence}]. Returns [{code, basis, evidence}].
 */
export function classifyRegionBasis(input = {}, { organizerName = null } = {}) {
  const facts = asObject(input.facts);
  const regions = Array.isArray(input.regions) ? input.regions : [];
  const fvRegions = Array.isArray(input.fv_regions) ? input.fv_regions : [];
  const venueText = [input.event_location, facts.location].filter(Boolean).join(" ");
  const eligibilityText = [input.eligibility_summary, facts.target].filter(Boolean).join(" ");
  const sourceRegion = compact(input.source_region_name);
  const aggregator = isAggregatorSource({ slug: input.source_institution_slug, name: input.source_institution_name });
  const orgText = [organizerName, aggregator ? null : input.source_institution_name].filter(Boolean).join(" ");

  const codes = new Map();
  for (const region of regions) if (region?.code) codes.set(region.code, { name: region.name });
  for (const region of fvRegions) if (region?.code && !codes.has(region.code)) codes.set(region.code, { name: null });

  const results = [];
  for (const [code, { name }] of codes) {
    const fv = fvRegions.find((region) => region?.code === code) ?? null;
    const variants = regionNameVariants(name, code);
    const keywords = String(fv?.evidence ?? "")
      .split(/\s*,\s*/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (fv?.source === "eligibility_scope") {
      results.push({ code, basis: "eligibility", evidence: `eligibility_scope: ${fv.evidence}`.slice(0, EVIDENCE_MAX_LENGTH) });
      continue;
    }
    const eligibility = eligibilityEvidence(eligibilityText, variants);
    if (eligibility) {
      results.push({ code, basis: "eligibility", evidence: `target: ${eligibility}`.slice(0, EVIDENCE_MAX_LENGTH) });
      continue;
    }
    const venueKeyword = [...keywords, ...variants.filter((v) => v.length >= 3 || /구$/.test(v))]
      .find((keyword) => keyword.length >= 2 && venueText.includes(keyword));
    if (venueKeyword && code !== "REG_NATION") {
      results.push({ code, basis: "venue", evidence: `location contains ${venueKeyword}: ${compact(venueText).slice(0, 100)}`.slice(0, EVIDENCE_MAX_LENGTH) });
      continue;
    }
    const orgKeyword = [...keywords, ...variants].find((keyword) => keyword.length >= 2 && orgText.includes(keyword));
    if (orgKeyword) {
      results.push({ code, basis: "institution", evidence: `organizer/source contains ${orgKeyword}`.slice(0, EVIDENCE_MAX_LENGTH) });
      continue;
    }
    if (!aggregator && sourceRegion && variants.some((variant) => variant.length >= 2 && sourceRegion.includes(variant))) {
      results.push({ code, basis: "institution", evidence: `source institution region: ${sourceRegion}`.slice(0, EVIDENCE_MAX_LENGTH) });
      continue;
    }
    results.push({
      code,
      basis: "related",
      evidence: (fv ? `${fv.source ?? "keyword"}: ${fv.evidence ?? ""}` : "no evidence").slice(0, EVIDENCE_MAX_LENGTH),
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Aggregate + upload helpers
// ---------------------------------------------------------------------------

export function buildCardFacts(input = {}, { now = new Date() } = {}) {
  const benefitExplanation = explainBenefit(input);
  const benefit = benefitExplanation.result;
  const schedule = classifySchedule(input, { now });
  const organizer = extractOrganizerCandidate(input);
  // Who may apply, by region (region-eligibility.js), decides the 서울 link and
  // any 'eligibility' basis; the keyword classifier only supplies places.
  const regionEligibility = classifyRegionEligibility(targetTexts(input));
  const regionBasis = applyRegionEligibility(
    classifyRegionBasis(input, { organizerName: organizer?.name ?? null }),
    regionEligibility,
  );
  const evidence = {
    version: CARD_FACTS_VERSION,
    extractedAt: now.toISOString(),
    benefit: benefit
      ? { summary: benefit.summary, kind: benefit.kind, evidence: benefit.evidence, rule: benefit.rule }
      : { summary: null, kind: null, evidence: null, rule: benefitExplanation.reason },
    schedule: { kind: schedule.kind, issues: schedule.issues },
    organizer: organizer
      ? { candidate: organizer.name, basis: organizer.basis, confidence: organizer.confidence, evidence: organizer.evidence }
      : { candidate: null, basis: null, confidence: null, evidence: null },
    regionBasis,
    regionEligibility: { ...regionEligibility, rules: REGION_ELIGIBILITY_RULES_VERSION },
    status: CARD_FACTS_STATUS,
  };
  return {
    benefit,
    benefitReason: benefitExplanation.reason,
    schedule,
    organizer,
    regionBasis,
    regionEligibility,
    columns: {
      benefit_summary: benefit?.summary ?? null,
      benefit_kind: benefit?.kind ?? null,
      event_schedule_kind: schedule.kind,
      card_facts_status: CARD_FACTS_STATUS,
    },
    evidence,
  };
}

export const CARD_FACT_POSTER_FIELDS = new Set([
  "benefit_summary",
  "benefit_kind",
  "event_schedule_kind",
  "card_facts_status",
]);

const CARD_FACT_COLUMN_PATTERN = /benefit_summary|benefit_kind|event_schedule_kind|card_facts_status/;

/** True when PostgREST/Postgres rejected the record because card fact columns are not migrated yet. */
export function isMissingCardFactColumnError(error) {
  if (!error) return false;
  const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return CARD_FACT_COLUMN_PATTERN.test(message) && (
    error.code === "42703" || error.code === "PGRST204" || /column|schema cache/i.test(message)
  );
}

export function withoutCardFactFields(record = {}) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !CARD_FACT_POSTER_FIELDS.has(key)));
}

export function isMissingRegionBasisColumnError(error) {
  if (!error) return false;
  const message = `${error.message ?? ""} ${error.details ?? ""}`;
  return /\bbasis\b/.test(message) && (
    error.code === "42703" || error.code === "PGRST204" || /column|schema cache/i.test(message)
  );
}

/** Card-fact input built from the crawler's in-memory upload state. */
export function buildCardFactsInputFromUpload({
  post = {},
  title,
  summaryShort,
  summaryLong,
  structuredFields = {},
  readableFacts = null,
  fieldVerification = {},
  classification = null,
  collectionSourceSlug = null,
  sourceOrgName = null,
} = {}) {
  const verification = asObject(fieldVerification);
  const organization = asObject(verification.organization);
  const regions = (classification?.regions ?? []).map((region) => ({ code: region.code, name: null }));
  return {
    title: title ?? post.title ?? null,
    summary_short: summaryShort ?? null,
    summary_long: summaryLong ?? null,
    facts: readableFacts ?? asObject(verification.readableNotice).facts ?? null,
    eligibility_summary: structuredFields.eligibility_summary ?? null,
    benefits_summary: structuredFields.benefits_summary ?? null,
    participation_fee: structuredFields.participation_fee ?? null,
    poster_text_summary: asObject(verification.posterImageOcr).posterTextSummary ?? null,
    event_location: structuredFields.event_location ?? null,
    event_start_at: structuredFields.event_start_at ?? null,
    event_end_at: structuredFields.event_end_at ?? null,
    application_start_at: structuredFields.application_start_at ?? null,
    application_end_at: structuredFields.application_end_at ?? null,
    organizer_name: structuredFields.organizer_name ?? null,
    organization,
    source_org_name: sourceOrgName ?? post.site ?? null,
    source_institution_name: organization.sourceOrgName ?? sourceOrgName ?? post.site ?? null,
    source_institution_slug: collectionSourceSlug ?? organization.collectionSourceSlug ?? null,
    source_region_name: null,
    regions,
    fv_regions: classification?.regions ?? [],
  };
}
