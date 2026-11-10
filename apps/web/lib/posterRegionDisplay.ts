/** A conflicting legacy join is not an authoritative eligibility scope. */
export function posterRegionDisplay(
  regionName: string | null | undefined,
  summary: string | null | undefined,
) {
  const source = String(summary || "");
  const explicit = [
    ...source.matchAll(/^\s*(?:대상\s*)?지역\s*(?:[:：]\s*|\n\s*)([^\n]+)/gm),
  ].map((match) => match[1].trim());
  const conflict = explicit.some(
    (value) =>
      regionName &&
      value !== regionName &&
      !regionName.split(/,\s*/).includes(value),
  );
  const label = conflict ? "지역 확인 필요" : regionName || "지역 확인 필요";
  return {
    label,
    conflict,
    summary: source.replace(
      /^\s*(?:대상\s*)?지역\s*(?:[:：]\s*|\n\s*)[^\n]+/gm,
      `대상 지역: ${label}`,
    ),
  };
}
