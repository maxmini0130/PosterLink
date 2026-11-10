/**
 * v6.1 card text and image rules (docs/design/v6.1/SPEC.md 3, 6).
 */

const NBSP = " ";
const WORD_JOINER = "⁠";

/**
 * `< 제목 >` → `<제목>`, and no line break right after an opening bracket,
 * right before a closing one, or on either side of a middle dot.
 */
export function cardTitleText(title: string) {
  return String(title ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([<〈《「『])\s+/g, "$1")
    .replace(/\s+([>〉》」』])/g, "$1")
    .replace(/([<〈《「『])/g, `$1${WORD_JOINER}`)
    .replace(/([>〉》」』])/g, `${WORD_JOINER}$1`)
    .replace(/\s*·\s*/g, `${WORD_JOINER}·${WORD_JOINER}`)
    .replace(/ (?=[<〈《「『])/g, NBSP);
}

/**
 * The card poster box is 5:7. A poster whose height ÷ width is under 1.2
 * (square or landscape) is shown whole and centred; otherwise it fills the box
 * from the top. Unknown size: fill from the top.
 */
export function posterCardFitClass(
  width?: number | null,
  height?: number | null,
) {
  if (width && height && height / width < 1.2)
    return "object-contain object-center";
  return "object-cover object-top";
}

/** The first organisation of an organisation string ("강북구청, 강북구보건소" → "강북구청"). */
export function cardOrganization(value?: string | null) {
  const first = String(value ?? "")
    .split(/\s*(?:[,/|·]|\s및\s)\s*/)[0]
    ?.trim();
  return first || null;
}
