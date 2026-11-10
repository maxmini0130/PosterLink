import { Check } from "lucide-react";
import type { DeadlinePresentation } from "../../../lib/deadlinePresentation";

/**
 * v6.1 deadline pieces (docs/design/v6.1/SPEC.md 4.3, reference.css .stamp,
 * .pill, .tag). They only draw getDeadlinePresentation's result and never
 * compute dates themselves.
 */

const STAMP_SIZE = {
  // On the card poster (46px, top-left).
  card: "absolute left-2 top-2 h-[46px] w-[46px] text-[13px] after:inset-[4px]",
  // On a list row thumbnail.
  row: "absolute -left-1.5 -top-1.5 h-[34px] w-[34px] text-[11px] after:inset-[3px]",
  // Inline, e.g. the home favourite deadline line.
  inline: "h-[34px] w-[34px] shrink-0 text-[11px] after:inset-[3px]",
} as const;

/** D-3 … 오늘. The stamp colour is used for this stamp only. */
export function DeadlineStamp({
  presentation,
  variant = "card",
}: {
  presentation: DeadlinePresentation;
  variant?: keyof typeof STAMP_SIZE;
}) {
  const stamp = presentation.stamp;
  if (!stamp) return null;
  const spoken = stamp === "오늘" ? "오늘 마감" : `마감 ${stamp.slice(2)}일 전`;
  return (
    <span
      role="img"
      aria-label={spoken}
      className={`pointer-events-none z-[1] flex -rotate-[8deg] items-center justify-center rounded-full border-2 border-pl-stamp bg-white font-pl-serif font-bold leading-none text-pl-stamp after:absolute after:rounded-full after:border after:border-pl-stamp after:content-[''] ${STAMP_SIZE[variant]} ${variant === "inline" ? "relative" : ""}`}
    >
      {stamp}
    </span>
  );
}

/** Card deadline line (.pill): default, muted for unconfirmed, green when applied. */
export function DeadlinePill({
  presentation,
  className = "",
}: {
  presentation: DeadlinePresentation;
  className?: string;
}) {
  const tone =
    presentation.tone === "applied"
      ? "flex w-fit items-center gap-[3px] bg-pl-ok-bg font-semibold text-pl-ok"
      : presentation.tone === "muted"
        ? "block w-fit bg-pl-pill-muted font-medium text-pl-meta"
        : "block w-fit bg-pl-pill font-semibold text-pl-ink";
  return (
    <span
      className={`mb-[5px] max-w-full truncate rounded-md px-[7px] py-[2px] text-[11.5px] leading-[1.4] tracking-[-0.1px] ${tone} ${className}`}
    >
      {presentation.tone === "applied" && (
        <Check size={12} strokeWidth={3} aria-hidden="true" />
      )}
      {presentation.card}
    </span>
  );
}

/** List-row deadline text: the long wording, with D-n when no stamp is shown. */
export function DeadlineRowText({
  presentation,
  className = "",
}: {
  presentation: DeadlinePresentation;
  className?: string;
}) {
  const tone =
    presentation.tone === "applied"
      ? "font-semibold text-pl-ok"
      : presentation.tone === "muted"
        ? "font-medium text-pl-meta"
        : "font-semibold text-pl-ink";
  return (
    <span className={`text-[12.5px] leading-[1.4] ${tone} ${className}`}>
      {presentation.tone === "applied" && "✓ "}
      {presentation.row}
    </span>
  );
}

/** Status tag (.tag): 접수 중 · 접수 예정 · 접수 종료 · 접수 여부 확인. */
export function StatusTag({
  presentation,
  className = "",
}: {
  presentation: DeadlinePresentation;
  className?: string;
}) {
  const dim =
    presentation.state === "closed" ||
    presentation.state === "reception_unknown";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-[7px] border px-[9px] py-[3px] text-xs ${
        dim
          ? "border-pl-line-strong bg-pl-closed-tag text-pl-meta"
          : "border-pl-line-strong bg-white text-pl-ink"
      } ${className}`}
    >
      {presentation.statusTag}
    </span>
  );
}
