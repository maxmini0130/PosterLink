"use client";
import { useEffect, useState } from "react";
import {
  analyticsConfigured,
  analyticsConsented,
  setAnalyticsConsent,
} from "../../lib/analytics";

/** Only enabled after the operator has approved the disclosure and GA property settings. */
export function AnalyticsConsentSettings() {
  const [enabled, setEnabled] = useState(false);
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    setEnabled(analyticsConfigured());
    setGranted(analyticsConsented());
    const update = () => setGranted(analyticsConsented());
    window.addEventListener("pl:analytics-consent", update);
    return () => window.removeEventListener("pl:analytics-consent", update);
  }, []);
  if (!enabled) return null;
  return (
    <section
      aria-label="선택적 이용 분석 설정"
      className="space-y-3 rounded-2xl border border-gray-200 p-5"
    >
      <h2 className="text-lg font-black text-gray-900">
        선택적 이용 분석 설정
      </h2>
      <p>
        동의하면 Google Analytics로 페이지 조회, 유입 캠페인,
        가입·찜·팔로우·알림 설정 및 신청 링크 이동을 분석합니다. 검색어 원문,
        이메일, 이름, 인증 토큰과 서비스 회원 ID는 전송하지 않습니다. GA 쿠키
        식별자는 이용 분석에 사용됩니다. 동의하지 않아도 서비스를 이용할 수
        있으며 여기에서 철회할 수 있습니다.
      </p>
      <p role="status">현재 상태: {granted ? "동의" : "동의하지 않음"}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-xl border border-gray-300 px-4 py-2 font-bold"
          onClick={() => {
            setAnalyticsConsent(true);
            setGranted(true);
          }}
        >
          분석에 동의
        </button>
        <button
          type="button"
          className="rounded-xl border border-gray-300 px-4 py-2 font-bold"
          onClick={() => {
            setAnalyticsConsent(false);
            setGranted(false);
          }}
        >
          동의하지 않음 / 철회
        </button>
      </div>
    </section>
  );
}
