import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * v6.1 buttons and tags (docs/design/v6.1/reference/reference.css .btn, .badge).
 * Primary is ink, never the stamp colour.
 */

const BUTTON_VARIANT = {
  default: "border-pl-line-strong bg-white font-semibold text-pl-ink-soft",
  primary: "border-pl-ink bg-pl-ink font-bold text-white",
  outline: "border-pl-ink bg-white font-bold text-pl-ink",
  applied: "border-pl-ok bg-pl-ok-bg font-bold text-pl-ok",
} as const;

export type PlButtonVariant = keyof typeof BUTTON_VARIANT;

export function plButtonClass(
  variant: PlButtonVariant = "default",
  extra = "",
) {
  return `inline-flex h-[46px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border px-4 text-[14px] transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pl-ink ${BUTTON_VARIANT[variant]} ${extra}`;
}

export function PlButton({
  variant = "default",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: PlButtonVariant }) {
  return (
    <button
      type={type}
      className={plButtonClass(variant, className)}
      {...props}
    />
  );
}

/** 우대·우선 (outline) or 필수 (filled) tag before an eligibility line. */
export function PlBadge({
  children,
  must = false,
}: {
  children: ReactNode;
  must?: boolean;
}) {
  return (
    <span
      className={`mr-1 inline-block rounded border px-[5px] align-[1px] text-[10.5px] font-bold leading-[1.5] ${
        must
          ? "border-pl-ink bg-pl-ink text-white"
          : "border-pl-badge-line bg-white text-pl-meta"
      }`}
    >
      {children}
    </span>
  );
}

/** Field chip (.chip): selected chips are ink. */
export function PlChip({
  selected = false,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={`inline-flex min-h-[34px] items-center gap-[3px] whitespace-nowrap rounded-[17px] border px-[13px] py-[7px] text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pl-ink ${
        selected
          ? "border-pl-ink bg-pl-ink text-white"
          : "border-pl-line-strong bg-white text-pl-ink"
      } ${className}`}
      {...props}
    />
  );
}
