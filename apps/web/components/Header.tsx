import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-primary">
          PosterLink
        </Link>
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link href="/posters" className="text-gray-600 hover:text-primary">탐색</Link>
          <button className="text-gray-600 hover:text-primary">알림</button>
        </div>
      </div>
    </header>
  );
}
