export type PosterSummaryLine = {
  label?: string;
  text: string;
};

export type PosterSummaryFallbackFacts = {
  eligibilitySummary: string | null;
  benefitsSummary: string | null;
  applicationMethod: string | null;
  participationFee: string | null;
  targetAgeMin: number | null;
  targetAgeMax: number | null;
};

const ELIGIBILITY_LABELS = new Set(["신청대상", "대상", "교육대상"]);
const BENEFIT_LABELS = new Set(["참여혜택", "혜택", "지원내용"]);
const APPLICATION_LABELS = new Set(["신청방법", "신청"]);
const FEE_LABELS = new Set(["참가비", "참가비용", "참여비용", "비용"]);

function normalizeLabel(value?: string) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim();
}

function compactText(value: string, limit = 280) {
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : null;
}

function findLabeledText(lines: PosterSummaryLine[], labels: Set<string>) {
  for (const line of lines) {
    if (!labels.has(normalizeLabel(line.label))) continue;
    const text = compactText(line.text);
    if (text) return text;
  }
  return null;
}

export function extractTargetAgeRange(text: string | null | undefined) {
  const source = String(text ?? "");
  if (!source) return { targetAgeMin: null, targetAgeMax: null };

  const rangeMatch = source.match(/(?:만\s*)?(\d{1,2})\s*세?\s*(?:~|-|부터|이상\s*~)\s*(?:만\s*)?(\d{1,2})\s*세?/);
  if (rangeMatch) {
    return {
      targetAgeMin: Number(rangeMatch[1]),
      targetAgeMax: Number(rangeMatch[2]),
    };
  }

  const minMatch = source.match(/(?:만\s*)?(\d{1,2})\s*세\s*(?:이상|부터)/);
  const maxMatch = source.match(/(?:만\s*)?(\d{1,2})\s*세\s*(?:이하|까지)/);

  return {
    targetAgeMin: minMatch ? Number(minMatch[1]) : null,
    targetAgeMax: maxMatch ? Number(maxMatch[1]) : null,
  };
}

export function derivePosterSummaryFallbackFacts(
  lines: PosterSummaryLine[],
): PosterSummaryFallbackFacts {
  const eligibilitySummary = findLabeledText(lines, ELIGIBILITY_LABELS);
  const { targetAgeMin, targetAgeMax } = extractTargetAgeRange(eligibilitySummary);

  return {
    eligibilitySummary,
    benefitsSummary: findLabeledText(lines, BENEFIT_LABELS),
    applicationMethod: findLabeledText(lines, APPLICATION_LABELS),
    participationFee: findLabeledText(lines, FEE_LABELS),
    targetAgeMin,
    targetAgeMax,
  };
}
