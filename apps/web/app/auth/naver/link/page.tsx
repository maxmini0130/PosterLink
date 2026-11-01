import type { Metadata } from "next";
import Link from "next/link";
import { naverEnabled } from "../../../../lib/naverAuthCore";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "네이버 로그인 연결",
  robots: { index: false, follow: false },
};

/** Confirmation before linking the Naver account just used (design 5-8). */
export default function NaverLinkPage() {
  const enabled = naverEnabled(process.env);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col justify-center bg-pl-paper px-5 py-12 font-pl-sans text-pl-ink">
      <h1 className="break-keep text-2xl font-bold">
        이 계정에 네이버 로그인을 연결할까요?
      </h1>
      {enabled ? (
        <>
          <p className="mt-3 break-keep text-sm leading-relaxed text-pl-sub">
            연결하면 다음부터 방금 확인한 네이버 계정으로 PosterLink에 로그인할
            수 있어요. 계정 관리에서 언제든 해제할 수 있어요.
          </p>
          <form method="post" action="/auth/naver/finalize" className="mt-8">
            <button
              type="submit"
              className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-pl-ink text-base font-bold text-white"
            >
              네이버 연결하기
            </button>
          </form>
          <Link
            href="/mypage/edit"
            className="mt-3 flex min-h-[44px] items-center justify-center text-sm font-medium text-pl-sub underline underline-offset-2"
          >
            연결하지 않고 돌아가기
          </Link>
        </>
      ) : (
        <p className="mt-3 text-sm text-pl-sub">
          네이버 로그인은 지금 사용할 수 없어요.
        </p>
      )}
    </main>
  );
}
