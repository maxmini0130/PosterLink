import { AnalyticsConsentSettings } from "../components/AnalyticsConsentSettings";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import Link from "next/link";
import type { Metadata } from "next";
import { withdrawalContact } from "../../lib/withdrawalContact";

export const metadata: Metadata = {
  title: "개인정보처리방침",
};

export default function PrivacyPage() {
  const contact = withdrawalContact();
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="container mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <Link
            href="/"
            className="text-sm font-bold text-gray-400 hover:text-gray-600"
          >
            ← 홈으로
          </Link>
          <h1 className="text-3xl font-black text-gray-900 mt-4">
            개인정보처리방침
          </h1>
          <p className="text-sm text-gray-400 font-bold mt-2">
            최종 업데이트: 2026년 11월 1일
          </p>
        </div>

        <AnalyticsConsentSettings />
        <div className="prose prose-gray max-w-none space-y-10 text-sm font-medium text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">
              1. 수집하는 개인정보 항목
            </h2>
            <p>
              PosterLink(이하 &ldquo;서비스&rdquo;)는 다음의 개인정보를
              수집합니다.
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>
                <strong>필수 항목:</strong> 이메일 주소, 닉네임
              </li>
              <li>
                <strong>소셜 로그인 시:</strong> 소셜 서비스에서 제공하는 프로필
                정보(닉네임, 프로필 사진)
              </li>
              <li>
                <strong>선택 항목:</strong> 관심 지역, 연령대, 관심 카테고리
              </li>
              <li>
                <strong>자동 수집:</strong> 서비스 이용 기록(방문 화면, 공고
                조회와 조회 경로, 공식 링크 이동, 찜·기관 팔로우·관심 조건
                저장·공유·로그인 시작 등 이용 행태), 검색 기록, 접속 로그,
                브라우저 저장소에 생성되는 무작위 방문자 식별자, 로그인 시 해당
                식별자와 회원 계정의 연결 기록
              </li>
            </ul>
            <p className="mt-3">
              서비스는 방문 통계와 이용 흐름 분석을 위해 브라우저
              저장소(localStorage·sessionStorage)에 무작위 식별자를 저장합니다.
              이 값에는 이름·연락처 등 직접 식별 정보가 들어 있지 않으며,
              브라우저 설정에서 사이트 데이터를 삭제하면 지워집니다. 앱과 웹
              브라우저는 저장소가 분리되어 각각 생성됩니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">
              2. 개인정보 수집 및 이용 목적
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>회원 가입 및 서비스 이용을 위한 본인 확인</li>
              <li>맞춤형 공고 알림 및 추천 서비스 제공</li>
              <li>
                서비스 개선을 위한 통계 분석(재방문, 가입 전후 이용 흐름, 기능별
                이용 현황)
              </li>
              <li>부정 이용 방지 및 분쟁 해결</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">
              3. 개인정보 보유 및 이용 기간
            </h2>
            <p>
              회원 탈퇴 시 개인정보를 파기하는 것을 원칙으로 합니다. 현재 자동
              탈퇴는 개인정보와 다른 이용자의 데이터 보호를 위해 일시 중단되어
              있으며, 자동 파기가 완료된 상태를 의미하지 않습니다. 법령상 보존
              대상은 별도로 구분합니다.
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>계약 또는 청약 철회 등에 관한 기록: 5년 (전자상거래법)</li>
              <li>소비자 불만 또는 분쟁 처리 기록: 3년 (전자상거래법)</li>
              <li>접속 로그: 3개월 (통신비밀보호법)</li>
            </ul>
            <p className="mt-3">
              서비스 이용 기록은 아래 기간이 지나면 매일 자동으로 파기합니다.
              기간은 기록이 생성된 시각부터 한국시간 기준으로 계산합니다.
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>
                방문·공고 조회·공식 링크 이동·서비스 이용 행태 기록, 방문자
                식별자와 회원 계정의 연결 기록: 3개월
              </li>
              <li>검색어 원문, 방문 기록에 남은 URL 쿼리와 유입 URL: 30일</li>
              <li>
                개인을 식별할 수 없는 주 단위 집계(신규 방문자 수, 재방문 수,
                주간 이용자 수): 서비스 개선 추이 확인을 위해 별도 보관
              </li>
            </ul>
            <p className="mt-3">
              회원 정보가 삭제되면 계정과의 연결 기록도 함께 삭제되고, 남은 이용
              기록과 회원 계정의 연결은 해제됩니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">
              4. 개인정보의 제3자 제공
            </h2>
            <p>
              서비스는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다.
              다만, 이용자가 사전에 동의한 경우 또는 법령의 규정에 의한 경우에는
              예외로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">
              5. 개인정보 처리 위탁
            </h2>
            <p>
              서비스는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리를
              위탁합니다.
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>Supabase Inc.: 데이터베이스 및 인증 서비스 운영</li>
              <li>Expo: 모바일 앱 푸시 알림 발송</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">
              6. 이용자의 권리
            </h2>
            <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>개인정보 열람, 정정, 삭제 요청</li>
              <li>개인정보 처리 정지 요청</li>
              <li>회원 탈퇴 안내 (마이페이지, 자동 처리는 일시 중단)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-4">
              7. 개인정보 보호책임자
            </h2>
            <p>개인정보 관련 문의·요청 경로는 아래 안내를 확인해 주세요.</p>
            <div className="mt-3 p-4 bg-gray-50 rounded-2xl">
              <p>개인정보처리자: 주식회사 맥스미니</p>
              <p>개인정보 보호책임자: 김정민 대표이사</p>
              {contact ? (
                <p>
                  <strong>문의:</strong>{" "}
                  <a href={contact.href}>{contact.label}</a>
                </p>
              ) : (
                <p>현재 수신이 확인된 개인정보 문의 경로를 준비 중입니다.</p>
              )}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
