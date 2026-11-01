"use client";

import { useState } from "react";

/**
 * "신청했어요" mark the user sets by hand (plan section 2). The parent owns the
 * stored state; this only renders it. When marking while a deadline alert is
 * on, it asks once whether to turn that alert off.
 */
export function ApplyMark({
  marked,
  onMark,
  onUnmark,
  alertOn = false,
  onTurnOffAlert,
  busy,
}: {
  marked: boolean;
  onMark: () => void;
  onUnmark: () => void;
  /** Whether this poster's deadline alert is confirmed on. */
  alertOn?: boolean;
  onTurnOffAlert?: () => void;
  busy?: boolean;
}) {
  const [askAlert, setAskAlert] = useState(false);

  if (!marked) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          onMark();
          if (alertOn && onTurnOffAlert) setAskAlert(true);
        }}
        className="inline-flex min-h-[44px] items-center rounded-lg border border-pl-ink px-4 text-sm font-bold text-pl-ink hover:bg-pl-paper disabled:opacity-60"
      >
        신청했어요
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-7 items-center rounded-md bg-pl-ink px-2.5 text-xs font-bold text-white">
          신청 표시됨
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setAskAlert(false);
            onUnmark();
          }}
          className="inline-flex min-h-[44px] items-center px-2 text-sm text-pl-sub underline underline-offset-2 disabled:opacity-60"
        >
          표시 취소
        </button>
      </div>
      {askAlert && (
        <div
          role="status"
          className="rounded-lg border border-pl-line bg-pl-paper px-3 py-2.5 text-sm text-pl-ink"
        >
          <p>신청했으니 이 공고의 마감 알림은 끌까요?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setAskAlert(false);
                onTurnOffAlert?.();
              }}
              className="min-h-[44px] rounded-lg bg-pl-ink px-4 text-sm font-bold text-white"
            >
              알림 끄기
            </button>
            <button
              type="button"
              onClick={() => setAskAlert(false)}
              className="min-h-[44px] rounded-lg border border-pl-line px-4 text-sm font-bold text-pl-ink"
            >
              계속 받기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
