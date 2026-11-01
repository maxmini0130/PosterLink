import type {
  DeadlineDisplay,
  DeadlineTone,
} from "../../../lib/deadlineDisplay";

const TONE_CLASS: Record<DeadlineTone, string> = {
  accent: "font-bold text-pl-accent",
  "accent-strong": "rounded-md bg-pl-accent px-1.5 py-0.5 font-bold text-white",
  ink: "font-medium text-pl-ink",
  neutral: "text-pl-sub",
  muted: "text-pl-meta",
};

/**
 * Deadline text from getDeadlineDisplay; never computes dates itself.
 * A trusted D-n also shows its date ("11.07 마감 · D-7"), as in the mockups.
 */
export function DeadlineLabel({
  display,
  showDate = true,
  className = "",
}: {
  display: DeadlineDisplay;
  showDate?: boolean;
  className?: string;
}) {
  const date =
    showDate && display.tone === "accent" && display.endDateLabel
      ? display.endDateLabel
      : null;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-[13px] leading-5 ${className}`}
    >
      {date && <span className="font-medium text-pl-ink">{date} 마감 ·</span>}
      <span className={TONE_CLASS[display.tone]}>{display.text}</span>
    </span>
  );
}

/** Status chip for the detail header: 접수 중 · 접수 종료 · 상시 모집 … */
export function ReceptionChip({ display }: { display: DeadlineDisplay }) {
  const closed = display.reception === "closed";
  return (
    <span
      className={`inline-flex min-h-6 items-center whitespace-nowrap rounded-md border px-2 text-xs font-bold ${
        closed
          ? "border-pl-line bg-pl-divider text-pl-meta"
          : "border-pl-line bg-pl-card text-pl-ink"
      }`}
    >
      {display.receptionLabel}
    </span>
  );
}
