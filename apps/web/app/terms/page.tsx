import { Header } from "../components/Header";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="container mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <Link href="/" className="text-sm font-bold text-gray-400 hover:text-gray-600">← 홈으로</Link>
          <h1 className="text-3xl font-black text-gray-900 mt-4">이용약관</h1>
          <p className="text-sm text-gray-400 font-bold mt-2">최종 업데이트: 2026년 4월 24일</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-10 text-sm font-medium text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">제1조 (목적)</h2>
            <p>이 약관은 PosterLink(이하 &ldquo;서비스&rdquo;)가 제공하는 공공 공고 정보 플랫폼 서비스의 이용 조건 및 절차, 서비스 이용자와 서비스 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">제2조 (정의)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>&ldquo;서비스&rdquo;란 PosterLink가 제공하는 공공 공고 정보 플랫폼을 의미합니다.</li>
              <li>&ldquo;이용자&rdquo;란 이 약관에 따라 서비스를 이용하는 회원 및 비회원을 의미합니다.</li>
              <li>&ldquo;회원&rdquo;이란 서비스에 개인정보를 제공하여 회원 가입을 한 자를 의미합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">제3조 (약관의 게시와 개정)</h2>
            <p>서비스는 이 약관의 내용을 이용자가 알 수 있도록 서비스 화면에 게시합니다. 서비스는 관련 법령을 위반하지 않는 범위에서 이 약관을 개정할 수 있으며, 변경된 약관은 공지 후 7일이 경과한 날부터 효력이 발생합니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">제4조 (서비스의 제공)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>공공 기관 및 단체가 등록한 공고 정보 검색 및 열람</li>
              <li>관심 공고 찜하기 및 알림 수신</li>
              <li>공고에 대한 댓글 작성 및 정보 공유</li>
              <li>맞춤형 공고 추천 서비스</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">제5조 (이용자의 의무)</h2>
            <p>이용자는 다음 행위를 하여서는 안 됩니다.</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>허위 정보 등록 또는 타인 정보 도용</li>
              <li>서비스의 정상적인 운영을 방해하는 행위</li>
              <li>타인에 대한 욕설, 비방, 차별적 발언</li>
              <li>상업적 목적의 광고 또는 스팸 게시</li>
              <li>저작권 등 지식재산권 침해</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">제6조 (면책조항)</h2>
            <p>서비스에 게시된 공고 정보는 각 기관에서 제공한 내용을 바탕으로 하며, 정확성이나 완전성을 보장하지 않습니다. 공고의 최종 내용은 반드시 해당 기관의 공식 채널을 통해 확인하시기 바랍니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">제7조 (분쟁 해결)</h2>
            <p>서비스 이용으로 발생한 분쟁에 대해서는 대한민국 법령을 적용하며, 분쟁 해결을 위한 소송은 서비스 본사 소재지를 관할하는 법원을 전속 관할 법원으로 합니다.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
