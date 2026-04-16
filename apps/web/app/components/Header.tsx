import Link from "next/link";
import { Search, Bell } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-blue-600">
          PosterLink
        </Link>
        <div className="flex items-center gap-4">
          <button className="p-2 text-gray-500 hover:text-blue-600">
            <Search size={22} />
          </button>
          <button className="p-2 text-gray-500 hover:text-blue-600">
            <Bell size={22} />
          </button>
        </div>
      </div>
    </header>
  );
}
