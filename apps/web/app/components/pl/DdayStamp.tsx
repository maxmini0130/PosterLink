import type { DeadlineDisplay } from "../../../lib/deadlineDisplay";

/**
 * Round D-day stamp beside the detail title. Shown only for a trusted, still
 * open deadline; returns nothing otherwise so callers need no extra check.
 */
export function DdayStamp({ display }: { display: DeadlineDisplay }) {
  if (!display.dateTrusted || display.daysLeft === null) return null;
  const today = display.daysLeft === 0;
  const main = today ? "오늘" : `D-${display.daysLeft}`;
  const spoken = today
    ? `오늘 마감${display.endDateLabel ? `, ${display.endDateLabel}` : ""}`
    : `마감 ${display.daysLeft}일 전${display.endDateLabel ? `, ${display.endDateLabel} 마감` : ""}`;

  return (
    <div
      role="img"
      aria-label={spoken}
      className="flex h-[84px] w-[84px] shrink-0 -rotate-[8deg] items-center justify-center rounded-full border-2 border-pl-accent p-[3px] text-pl-accent"
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-pl-accent">
        <span className="font-pl-serif text-xl font-bold leading-none">
          {main}
        </span>
        {display.endDateLabel && (
          <span className="mt-1 text-[11.5px] font-bold leading-none">
            {display.endDateLabel} 마감
          </span>
        )}
      </div>
    </div>
  );
}
