export type RegionScope = "nearby" | "seoul" | "nation";

const LABELS: Record<RegionScope, string> = {
  nearby: "주변 지역",
  seoul: "서울 전체",
  nation: "전국",
};

/**
 * Marks cards from a widened group so they are not mistaken for "my area".
 * `label` overrides the default wording, e.g. "경기 전체".
 */
export function RegionLabel({
  scope,
  label,
}: {
  scope: RegionScope;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center rounded border border-pl-line bg-pl-paper px-1.5 py-px text-[11.5px] font-medium text-pl-sub">
      {label ?? LABELS[scope]}
    </span>
  );
}
