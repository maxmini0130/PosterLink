"use client";

import toast from "react-hot-toast";

/**
 * One-line toast with a single action, e.g. "이 기기에 저장됐어요 · 계정에 보관하기".
 * Disappears on its own; the action also closes it.
 */
export function showActionToast(
  message: string,
  action?: { label: string; onClick: () => void },
  options: { duration?: number; id?: string } = {},
) {
  return toast.custom(
    (t) => (
      <div
        role="status"
        aria-live="polite"
        className={`flex min-h-[48px] max-w-[calc(100vw-40px)] items-center gap-3 rounded-xl bg-pl-ink px-4 py-2 text-sm text-white shadow-lg transition-opacity md:max-w-md ${
          t.visible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <span className="min-w-0 flex-1">{message}</span>
        {action && (
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              action.onClick();
            }}
            className="min-h-[44px] shrink-0 px-1 font-bold text-[#F6D7A7] underline underline-offset-2"
          >
            {action.label}
          </button>
        )}
      </div>
    ),
    { duration: options.duration ?? 5000, id: options.id },
  );
}
