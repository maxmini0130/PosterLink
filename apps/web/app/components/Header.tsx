import Link from "next/link";
import { Search, Bell } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md transition-colors">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-black text-blue-600 dark:text-blue-400">
          PosterLink
        </Link>
        <div className="flex items-center gap-2">
          <button className="p-2 text-gray-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            <Search size={22} />
          </button>
          <Link href="/notifications" className="p-2 text-gray-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors relative">
            <Bell size={22} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-slate-900"></span>
          </Link>
        </div>
      </div>
    </header>
  );
}
