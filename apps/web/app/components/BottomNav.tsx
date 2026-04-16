import Link from "next/link";
import { Home, Compass, Heart, User } from "lucide-react";

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-gray-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-6 pb-6 pt-2 md:hidden backdrop-blur-md transition-colors">
      <div className="flex justify-between items-center text-gray-400 dark:text-slate-500">
        <Link href="/" className="flex flex-col items-center gap-1 text-blue-600 dark:text-blue-400 transition-colors">
          <Home size={24} />
          <span className="text-[10px] font-black">홈</span>
        </Link>
        <Link href="/explore" className="flex flex-col items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          <Compass size={24} />
          <span className="text-[10px] font-black">탐색</span>
        </Link>
        <Link href="/favorites" className="flex flex-col items-center gap-1 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
          <Heart size={24} />
          <span className="text-[10px] font-black">찜</span>
        </Link>
        <Link href="/mypage" className="flex flex-col items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          <User size={24} />
          <span className="text-[10px] font-black">마이</span>
        </Link>
      </div>
    </nav>
  );
}
