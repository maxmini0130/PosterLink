import { Header } from "../components/Header";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="container mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <Link href="/" className="text-sm font-bold text-gray-400 hover:text-gray-600">← 홈으로</Link>
          <h1 className="text-3xl font-black text-gray-900 mt-4">개인정보처리방침</h1>
          <p className="text-sm text-gray-400 font-bold mt-2">최종 업데이트: 2026년 4월 24일</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-10 text-sm font-medium text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">1. 수집하는 개인정보 항목</h2>
            <p>PosterLink(이하 &ldquo;서비스&rdquo;)는 다음의 개인정보를 수집합니다.</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li><strong>필수 항목:</strong> 이메일 주소, 닉네임</li>
              <li><strong>소셜 로그인 시:</strong> 소셜 서비스에서 제공하는 프로필 정보(닉네임, 프로필 사진)</li>
              <li><strong>선택 항목:</strong> 관심 지역, 연령대, 관심 카테고리</li>
              <li><strong>자동 수집:</strong> 서비스 이용 기록, 검색 기록, 접속 로그</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">2. 개인정보 수집 및 이용 목적</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>회원 가입 및 서비스 이용을 위한 본인 확인</li>
              <li>맞춤형 공고 알림 및 추천 서비스 제공</li>
              <li>서비스 개선을 위한 통계 분석</li>
              <li>부정 이용 방지 및 분쟁 해결</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">3. 개인정보 보유 및 이용 기간</h2>
            <p>회원 탈퇴 시 즉시 파기합니다. 단, 관련 법령에 의해 보존이 필요한 경우 해당 기간 동안 보관합니다.</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>계약 또는 청약 철회 등에 관한 기록: 5년 (전자상거래법)</li>
              <li>소비자 불만 또는 분쟁 처리 기록: 3년 (전자상거래법)</li>
              <li>접속 로그: 3개월 (통신비밀보호법)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">4. 개인정보의 제3자 제공</h2>
            <p>서비스는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 이용자가 사전에 동의한 경우 또는 법령의 규정에 의한 경우에는 예외로 합니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">5. 개인정보 처리 위탁</h2>
            <p>서비스는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁합니다.</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>Supabase Inc.: 데이터베이스 및 인증 서비스 운영</li>
              <li>Expo: 모바일 앱 푸시 알림 발송</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">6. 이용자의 권리</h2>
            <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>개인정보 열람, 정정, 삭제 요청</li>
              <li>개인정보 처리 정지 요청</li>
              <li>회원 탈퇴 (마이페이지 &gt; 계정 설정)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">7. 개인정보 보호책임자</h2>
            <p>개인정보 관련 문의, 불만 처리, 피해 구제 등은 아래 연락처로 문의해주세요.</p>
            <div className="mt-3 p-4 bg-gray-50 rounded-2xl">
              <p><strong>이메일:</strong> privacy@posterlink.co.kr</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
