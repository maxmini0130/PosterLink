import Link from "next/link";
import { Plus } from "lucide-react";

/** Floating 포스터 제보 button on mobile home. PC shows it in the top menu instead. */
export function ReportFab() {
  return (
    <Link
      href="/posters/request"
      className="pl-report-fab fixed right-5 z-30 inline-flex min-h-[44px] items-center gap-1 rounded-full bg-pl-ink px-4 text-sm font-bold text-white shadow-lg md:hidden"
    >
      <Plus size={16} aria-hidden="true" />
      포스터 제보
    </Link>
  );
}
