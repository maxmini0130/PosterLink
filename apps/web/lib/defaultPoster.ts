import { CONTENT_TYPE_INTEREST } from "./categoryTaxonomy";

export const POSTER_THEMES = [
  {
    code: "CAT_WELFARE",
    label: "지원금/복지",
    color: "#2F6B4F",
    icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  },
  {
    code: "CAT_EDUCATION",
    label: "교육/취업",
    color: "#1C2D4F",
    icon: "M22 10L12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5",
  },
  {
    code: "CAT_CULTURE",
    label: "문화/행사",
    color: "#A3322A",
    icon: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  },
  {
    code: "CAT_HOUSING",
    label: "주거/금융",
    color: "#6B4A2B",
    icon: "M3 10.5L12 3l9 7.5V21H3z",
  },
  {
    code: "CAT_BUSINESS",
    label: "소상공인",
    color: "#7A5310",
    icon: "M3 9l1.5-5h15L21 9M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8",
  },
  {
    code: "CAT_FAMILY",
    label: "육아/가족",
    color: "#9C3A5E",
    icon: "M12 21l-9-9a5 5 0 0 1 7-7l2 2 2-2a5 5 0 0 1 7 7z",
  },
  {
    code: "CAT_HEALTH",
    label: "건강/의료",
    color: "#22686A",
    icon: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  },
  {
    code: "CAT_OTHER",
    label: "기타",
    color: "#4A4E59",
    icon: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  },
] as const;

export function posterTheme(category?: string | null) {
  const code = CONTENT_TYPE_INTEREST[category ?? ""] ?? category;
  const alias: Record<string, string> = {
    교육강좌: "CAT_EDUCATION",
    채용: "CAT_EDUCATION",
    행사모집: "CAT_CULTURE",
    공모전: "CAT_CULTURE",
    지원사업: "CAT_WELFARE",
  };
  return (
    POSTER_THEMES.find(
      (t) =>
        t.code === code ||
        t.label === category ||
        t.code === alias[category ?? ""],
    ) ?? POSTER_THEMES[7]
  );
}

/** Deterministic wrapping shared by the SVG card and server-rendered PNG. */
export function posterTitleLines(title: string): string[] {
  const chars = Array.from(
    title.replace(/\s+/g, " ").trim().slice(0, 240) || "공고를 확인해 주세요",
  );
  const lines: string[] = [];
  let line = "",
    units = 0;
  for (let i = 0; i < chars.length; i++) {
    const weight = /[\x00-\x7f]/.test(chars[i]) ? 0.52 : 1;
    if (units + weight > 10.3 && line) {
      lines.push(line.trim());
      line = "";
      units = 0;
    }
    if (lines.length === 5) {
      lines[4] = lines[4].slice(0, -1) + "…";
      return lines;
    }
    line += chars[i];
    units += weight;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 5);
}
