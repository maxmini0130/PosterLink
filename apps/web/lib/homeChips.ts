/**
 * v6.1 home field chips (docs/design/v6.1/SPEC.md 7.1): 전체 / 지원·혜택 /
 * 교육·강좌 / 문화·행사 / 일자리 / 공모전. A chip is shown only while the
 * chosen region has at least MIN_CHIP_POSTERS open posters in it, counted
 * from the same posters the home lists (user decision 2026-11-10).
 */

export const HOME_CHIPS = [
  {
    id: "support",
    label: "지원·혜택",
    codes: [
      "CAT_WELFARE",
      "CAT_SUPPORT_PROGRAM",
      "CAT_HOUSING",
      "CAT_BUSINESS",
      "CAT_FAMILY",
      "CAT_HEALTH",
    ],
  },
  {
    id: "education",
    label: "교육·강좌",
    codes: ["CAT_EDUCATION", "CAT_COURSE"],
  },
  {
    id: "culture",
    label: "문화·행사",
    codes: ["CAT_CULTURE", "CAT_EVENT_RECRUIT"],
  },
  { id: "jobs", label: "일자리", codes: ["CAT_RECRUITMENT"] },
  { id: "contest", label: "공모전", codes: ["CAT_CONTEST"] },
] as const;

export type HomeChipId = (typeof HOME_CHIPS)[number]["id"];

export const MIN_CHIP_POSTERS = 5;

const CHIP_IDS = new Set<string>(HOME_CHIPS.map((chip) => chip.id));

export function readHomeChip(value: unknown): HomeChipId | null {
  return typeof value === "string" && CHIP_IDS.has(value)
    ? (value as HomeChipId)
    : null;
}

/**
 * The chip a poster belongs to, from its own content type (primary
 * classification first, then its categories). Recruitment and contests are
 * their own chips, not folded into 교육·강좌 / 문화·행사.
 */
export function homeChipOf(contentCodes: readonly string[]): HomeChipId | null {
  for (const code of contentCodes) {
    const chip = HOME_CHIPS.find((item) =>
      (item.codes as readonly string[]).includes(code),
    );
    if (chip) return chip.id;
  }
  return null;
}

/** Chips to show, in order, with their counts; under the minimum is hidden. */
export function visibleHomeChips(counts: Partial<Record<HomeChipId, number>>) {
  return HOME_CHIPS.filter(
    (chip) => (counts[chip.id] ?? 0) >= MIN_CHIP_POSTERS,
  ).map((chip) => ({
    id: chip.id,
    label: chip.label,
    count: counts[chip.id] ?? 0,
  }));
}
