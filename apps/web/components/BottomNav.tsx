import Link from "next/link";

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-white px-6 pb-6 pt-2 md:hidden">
      <div className="flex justify-between items-center text-gray-400">
        <Link href="/" className="flex flex-col items-center gap-1">
          <div className="w-6 h-6 bg-gray-200 rounded-full" />
          <span className="text-[10px]">홈</span>
        </Link>
        <Link href="/posters" className="flex flex-col items-center gap-1">
          <div className="w-6 h-6 bg-gray-200 rounded-full" />
          <span className="text-[10px]">탐색</span>
        </Link>
        <Link href="/favorites" className="flex flex-col items-center gap-1 text-primary">
          <div className="w-6 h-6 bg-primary rounded-full" />
          <span className="text-[10px]">찜</span>
        </Link>
        <Link href="/mypage" className="flex flex-col items-center gap-1">
          <div className="w-6 h-6 bg-gray-200 rounded-full" />
          <span className="text-[10px]">마이</span>
        </Link>
      </div>
    </nav>
  );
}
