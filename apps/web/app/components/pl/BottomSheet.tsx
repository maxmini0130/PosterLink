"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Elements Tab can actually reach now: rendered, visible, not removed from the order. */
function tabbable(panel: HTMLElement | null) {
  return Array.from(
    panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.closest("[hidden], [inert]") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden",
  );
}

/**
 * Bottom sheet on mobile, centred dialog from md up (plan 2 and 3-1).
 * Focus moves into the sheet, Tab stays inside, Escape or the backdrop closes
 * it, and focus returns to the element that opened it.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  primary,
  dismissLabel = "나중에 할게요",
  footnote,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  /** Main action, e.g. 카카오로 계속하기. */
  primary?: ReactNode;
  dismissLabel?: string;
  footnote?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const inside = (node: EventTarget | null) =>
      node instanceof Node && Boolean(panel?.contains(node));
    // Focus the first reachable control, or the panel itself when there is none.
    (tabbable(panel)[0] ?? panel)?.focus();
    if (!inside(document.activeElement)) panel?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = tabbable(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at the ends, and pull focus back if it is on the panel or outside.
      if (
        event.shiftKey &&
        (active === first || !items.includes(active as HTMLElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !items.includes(active as HTMLElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    // Focus moved outside by other means (a click on the page behind, script).
    const onFocusIn = (event: FocusEvent) => {
      if (!inside(event.target)) (tabbable(panel)[0] ?? panel)?.focus();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div
        className="absolute inset-0 bg-pl-ink/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="pl-sheet-panel relative w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[20px] bg-pl-card px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-2xl outline-none md:max-w-md md:rounded-[20px] md:p-6"
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-pl-line md:hidden"
          aria-hidden="true"
        />
        <h2
          id={titleId}
          className="font-pl-serif text-lg font-bold leading-snug text-pl-ink"
        >
          {title}
        </h2>
        {children && (
          <div className="mt-3 text-sm leading-6 text-pl-sub">{children}</div>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {primary}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg text-sm font-medium text-pl-sub hover:bg-pl-paper"
          >
            {dismissLabel}
          </button>
        </div>
        {footnote && (
          <p className="mt-3 text-center text-xs text-pl-meta">{footnote}</p>
        )}
      </div>
    </div>
  );
}
