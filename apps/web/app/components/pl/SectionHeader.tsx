import Link from "next/link";
import type { ReactNode } from "react";

/** Section title with an optional condition line ("마포구 대상 · 문화/행사 · 접수 중"). */
export function SectionHeader({
  title,
  condition,
  eyebrow,
  action,
  id,
  as: Heading = "h2",
}: {
  title: ReactNode;
  condition?: ReactNode;
  /** Small line above the title, e.g. "10월 28일(화) 방문 이후". */
  eyebrow?: ReactNode;
  action?: { href: string; label: string };
  id?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="mb-0.5 text-xs text-pl-meta">{eyebrow}</p>}
        <Heading
          id={id}
          className="text-base font-bold leading-snug text-pl-ink"
        >
          {title}
        </Heading>
        {condition && <p className="mt-0.5 text-xs text-pl-sub">{condition}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex min-h-[44px] shrink-0 items-center text-[13px] font-medium text-pl-sub underline-offset-2 hover:underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
