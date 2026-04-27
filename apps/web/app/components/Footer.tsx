import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-gray-50/50 mt-16">
      <div className="container mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="text-sm font-black text-gray-900">PosterLink</p>
            <p className="text-xs font-bold text-gray-400 mt-1 leading-relaxed">
              청년·소상공인·문화 공고를 한눈에<br className="md:hidden" /> 모아보는 공공 정보 플랫폼
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/terms" className="text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors">
              이용약관
            </Link>
            <Link href="/privacy" className="text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors">
              개인정보처리방침
            </Link>
            <a href="mailto:contact@posterlink.co.kr" className="text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors">
              문의하기
            </a>
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-[11px] font-bold text-gray-300 text-center">
            © {new Date().getFullYear()} PosterLink. All rights reserved.{" "}
            <span className="mx-1">·</span>
            본 서비스에 게시된 공고 정보는 각 기관의 공식 자료를 참고하였으나, 최종 내용은 원문을 확인해 주세요.
          </p>
        </div>
      </div>
    </footer>
  );
}
