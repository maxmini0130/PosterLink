import Link from "next/link";
import { Home, Compass, Heart, User } from "lucide-react";

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-white px-6 pb-6 pt-2 md:hidden">
      <div className="flex justify-between items-center text-gray-400">
        <Link href="/" className="flex flex-col items-center gap-1 text-blue-600">
          <Home size={24} />
          <span className="text-[10px] font-medium">홈</span>
        </Link>
        <Link href="/explore" className="flex flex-col items-center gap-1">
          <Compass size={24} />
          <span className="text-[10px] font-medium">탐색</span>
        </Link>
        <Link href="/favorites" className="flex flex-col items-center gap-1">
          <Heart size={24} />
          <span className="text-[10px] font-medium">찜</span>
        </Link>
        <Link href="/mypage" className="flex flex-col items-center gap-1">
          <User size={24} />
          <span className="text-[10px] font-medium">마이</span>
        </Link>
      </div>
    </nav>
  );
}
