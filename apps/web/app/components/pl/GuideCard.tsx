import Link from "next/link";
import type { ReactNode } from "react";

/** One guidance card shown instead of several empty sections. */
export function GuideCard({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <section className="rounded-xl border border-dashed border-pl-line bg-pl-card px-4 py-4">
      <p className="text-[15px] font-bold leading-snug text-pl-ink">{title}</p>
      {children && (
        <p className="mt-1 text-sm leading-6 text-pl-sub">{children}</p>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-pl-ink px-4 text-sm font-bold text-pl-ink hover:bg-pl-paper"
        >
          {action.label}
        </Link>
      )}
    </section>
  );
}
