import { inferRegionMatches } from "./region-rules.js";

const CATEGORY_RULES = [
  {
    code: "CAT_WELFARE",
    label: "지원금/복지",
    keywords: ["복지", "지원금", "보조금", "수당", "급여", "바우처", "상담", "돌봄", "취약", "장애", "저소득", "고립", "위기", "긴급"],
  },
  {
    code: "CAT_EDUCATION",
    label: "교육/취업",
    keywords: ["교육", "취업", "채용", "일자리", "훈련", "강좌", "강의", "수강", "아카데미", "커리어", "직무", "멘토링", "자격증", "인턴", "장학"],
  },
  {
    code: "CAT_CULTURE",
    label: "문화/행사",
    keywords: ["문화", "행사", "축제", "전시", "공연", "체험", "클래스", "예술", "미디어", "영화", "음악", "공예", "탐방", "투어", "모임", "콘서트"],
  },
  {
    code: "CAT_HOUSING",
    label: "주거/금융",
    keywords: ["주거", "월세", "전세", "임대", "부동산", "대출", "금융", "자금", "신용", "보증", "계좌", "청년월세"],
  },
  {
    code: "CAT_BUSINESS",
    label: "소상공인",
    keywords: ["소상공인", "자영업", "창업", "스타트업", "기업", "중소기업", "입주기업", "액셀러레이팅", "컨설팅", "투자", "사업화", "판로", "마케팅", "IR"],
  },
  {
    code: "CAT_FAMILY",
    label: "육아/가족",
    keywords: ["육아", "가족", "부모", "아동", "어린이", "청소년", "보육", "출산", "1인가구", "반려"],
  },
  {
    code: "CAT_HEALTH",
    label: "건강/의료",
    keywords: ["건강", "의료", "병원", "검진", "치료", "재활", "운동", "체육", "보건", "심리", "마음", "힐링"],
  },
];

const SOURCE_CATEGORY_CODE_MAP = new Map([
  ["채용", "CAT_EDUCATION"],
  ["일자리", "CAT_EDUCATION"],
  ["교육", "CAT_EDUCATION"],
  ["장학", "CAT_EDUCATION"],
  ["문화", "CAT_CULTURE"],
  ["행사", "CAT_CULTURE"],
  ["체육", "CAT_HEALTH"],
  ["복지", "CAT_WELFARE"],
  ["노동", "CAT_WELFARE"],
  ["급식", "CAT_FAMILY"],
  ["청소년", "CAT_FAMILY"],
  ["안전", "CAT_OTHER"],
  ["입법", "CAT_OTHER"],
]);

const AUDIENCE_RULES = [
  {
    code: "youth",
    name: "청년",
    min_age: 19,
    max_age: 39,
    gender_restriction: "None",
    assignable: true,
    patterns: [/청년(?!몽땅정보통)/, /만\s*19\s*세/, /만\s*34\s*세/, /만\s*39\s*세/, /청년센터/, /청년창업/],
  },
  {
    code: "teen",
    name: "청소년",
    min_age: 9,
    max_age: 24,
    gender_restriction: "None",
    assignable: true,
    patterns: [/청소년/, /중학생/, /고등학생/, /학교\s*밖\s*청소년/],
  },
  {
    code: "middle_aged",
    name: "중장년",
    min_age: 40,
    max_age: 64,
    gender_restriction: "None",
    assignable: true,
    patterns: [/중장년/, /중년/, /40대/, /50대/, /4050/],
  },
  {
    code: "senior",
    name: "어르신",
    min_age: 65,
    max_age: null,
    gender_restriction: "None",
    assignable: true,
    patterns: [/어르신/, /노인/, /시니어/, /65\s*세\s*이상/, /고령/],
  },
  {
    code: "child",
    name: "아동",
    min_age: 0,
    max_age: 12,
    gender_restriction: "None",
    assignable: true,
    patterns: [/아동/, /어린이/, /초등학생/, /초등\s*\d?\s*학년/],
  },
  {
    code: "women",
    name: "여성",
    min_age: null,
    max_age: null,
    gender_restriction: "female",
    assignable: true,
    patterns: [/여성/, /새일센터/, /여성새로일하기/, /여성센터/],
  },
  {
    code: "small_business",
    name: "소상공인",
    assignable: false,
    patterns: [/소상공인/, /자영업/, /점포/, /상인/],
  },
  {
    code: "startup",
    name: "창업기업",
    assignable: false,
    patterns: [/창업기업/, /스타트업/, /벤처/, /예비창업/, /초기창업/],
  },
];

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lower(value) {
  return compact(value).toLowerCase();
}

function buildFields(post = {}) {
  return [
    ["title", post.title, 5],
    ["category", post.category, 6],
    ["summary", post.summary_short, 3],
    ["content", post.content, 2],
    ["site", post.site ?? post.source_org_name, 1],
    ["board", post.board, 1],
    ["url", post.sourceUrl ?? post.source_key ?? post.url, 1],
  ].map(([field, value, weight]) => ({ field, text: lower(value), raw: compact(value), weight }));
}

function addScore(scores, code, amount, evidence) {
  const current = scores.get(code) ?? { code, score: 0, evidence: [] };
  current.score += amount;
  if (evidence && current.evidence.length < 5) current.evidence.push(evidence);
  scores.set(code, current);
}

function confidenceFromScore(score, margin, ambiguous = false) {
  let confidence = 0.42 + Math.min(score, 18) / 30 + Math.min(Math.max(margin, 0), 8) / 28;
  if (ambiguous) confidence = Math.min(confidence, 0.58);
  return Math.max(0.25, Math.min(0.95, Number(confidence.toFixed(2))));
}

function inferCategoryMatches(post = {}) {
  const fields = buildFields(post);
  const scores = new Map();
  const sourceCategory = compact(post.category);
  const mappedCode = SOURCE_CATEGORY_CODE_MAP.get(sourceCategory);
  if (mappedCode && mappedCode !== "CAT_OTHER") {
    addScore(scores, mappedCode, 9, `source category: ${sourceCategory}`);
  }

  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      const normalizedKeyword = lower(keyword);
      for (const field of fields) {
        if (!field.text || !field.text.includes(normalizedKeyword)) continue;
        addScore(scores, rule.code, field.weight, `${field.field}: ${keyword}`);
      }
    }
  }

  const ranked = [...scores.values()]
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return [{
      code: "CAT_OTHER",
      label: "기타",
      score: 0,
      confidence: 0.35,
      evidence: sourceCategory ? `source category: ${sourceCategory}` : "",
      source: "fallback",
    }];
  }

  const top = ranked[0];
  const second = ranked[1] ?? null;
  const selected = [top];
  if (second && second.score >= 5 && second.score >= top.score * 0.65) selected.push(second);

  return selected.map((entry, index) => {
    const rule = CATEGORY_RULES.find((item) => item.code === entry.code);
    const margin = index === 0 ? entry.score - (second?.score ?? 0) : 0;
    const ambiguous = Boolean(second && Math.abs(top.score - second.score) <= 2);
    return {
      code: entry.code,
      label: rule?.label ?? entry.code,
      score: entry.score,
      confidence: confidenceFromScore(entry.score, margin, ambiguous && index === 0),
      evidence: entry.evidence.join(", "),
      source: "rule",
      ambiguous: ambiguous && index === 0,
    };
  });
}

function inferAudienceMatches(post = {}) {
  const source = compact([post.title, post.summary_short, post.content, post.category].filter(Boolean).join(" "));
  if (!source) return [];

  return AUDIENCE_RULES.map((rule) => {
    const evidence = rule.patterns
      .map((pattern) => source.match(pattern)?.[0])
      .filter(Boolean)
      .slice(0, 4);
    if (evidence.length === 0) return null;
    const confidence = Math.min(0.94, 0.58 + evidence.length * 0.1);
    return {
      code: rule.code,
      name: rule.name,
      min_age: rule.min_age ?? null,
      max_age: rule.max_age ?? null,
      gender_restriction: rule.gender_restriction ?? "None",
      assignable: Boolean(rule.assignable),
      confidence: Number(confidence.toFixed(2)),
      evidence: evidence.join(", "),
    };
  }).filter(Boolean);
}

function createClassificationIssues({ categories, regions }) {
  const issues = [];
  const primaryCategory = categories[0];
  if (!primaryCategory || primaryCategory.code === "CAT_OTHER" || primaryCategory.confidence < 0.58) {
    issues.push({
      code: "low-category-confidence",
      severity: "medium",
      decision: "review",
      reason: "category could not be classified confidently",
      evidence: primaryCategory?.evidence ?? "",
    });
  } else if (primaryCategory.ambiguous) {
    issues.push({
      code: "ambiguous-category",
      severity: "medium",
      decision: "review",
      reason: "multiple categories have similar rule scores",
      evidence: categories.map((category) => `${category.label}:${category.score}`).join(", "),
    });
  }

  if (regions.length === 0) {
    issues.push({
      code: "missing-region",
      severity: "medium",
      decision: "review",
      reason: "region could not be inferred from the notice",
      evidence: "",
    });
  } else if (regions.some((region) => region.ambiguous) || (regions[0]?.confidence ?? 0) < 0.58) {
    issues.push({
      code: "ambiguous-region",
      severity: "medium",
      decision: "review",
      reason: "region inference needs manual confirmation",
      evidence: regions.map((region) => `${region.code}:${region.evidence}`).join(", "),
    });
  }

  return issues;
}

export function inferPosterClassification(post = {}) {
  const categories = inferCategoryMatches(post);
  const regions = inferRegionMatches(post);
  const audiences = inferAudienceMatches(post);
  const issues = createClassificationIssues({ categories, regions });

  return {
    categories,
    categoryCodes: categories.map((category) => category.code),
    regions,
    regionCodes: regions.map((region) => region.code),
    audiences,
    audienceCodes: audiences.map((audience) => audience.code),
    issues,
    confidence: Math.min(
      categories[0]?.confidence ?? 0,
      regions[0]?.confidence ?? 0,
      audiences[0]?.confidence ?? 1
    ),
  };
}
