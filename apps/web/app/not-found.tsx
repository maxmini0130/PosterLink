import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "페이지를 찾을 수 없습니다" };

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-8">
        <p className="text-[120px] font-black text-gray-100 leading-none select-none">404</p>
      </div>

      <div className="mb-10">
        <h1 className="text-2xl font-black text-gray-900 mb-3">페이지를 찾을 수 없습니다</h1>
        <p className="text-sm font-bold text-gray-400 leading-relaxed max-w-xs">
          요청하신 페이지가 존재하지 않거나 삭제되었습니다.<br />
          주소를 다시 확인해 주세요.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className="px-8 py-4 bg-blue-600 text-white font-black rounded-[1.5rem] shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
        >
          홈으로 가기
        </Link>
        <Link
          href="/posters"
          className="px-8 py-4 bg-gray-50 text-gray-600 font-black rounded-[1.5rem] hover:bg-gray-100 transition-all border border-gray-100"
        >
          공고 탐색하기
        </Link>
      </div>
    </div>
  );
}
