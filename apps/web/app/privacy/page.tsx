import { AnalyticsConsentSettings } from "../components/AnalyticsConsentSettings";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import Link from "next/link";
import type { Metadata } from "next";
import { privacyPolicy } from "./policy";

export const metadata: Metadata = {
  title: "개인정보처리방침",
};

export default function PrivacyPage() {
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
            개정안 검토: 2026년 10월 24일 · 시행일:{" "}
            {privacyPolicy.effectiveDate}
          </p>
          <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            운영 게시 전 검토용 개정안입니다. 외부 계약·국외 이전·보존기간과
            실제 권리 행사 처리 절차의 미확정 사항을 승인한 후 게시합니다.
          </p>
        </div>

        <AnalyticsConsentSettings />
        <div className="prose prose-gray max-w-none space-y-10 text-sm font-medium text-gray-700 leading-relaxed">
          {privacyPolicy.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-black text-gray-900 mb-4">
                {section.title}
              </h2>
              <div className="space-y-3 break-words">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
          <p>
            <a
              className="text-blue-600 underline"
              href={`mailto:${privacyPolicy.email}`}
            >
              개인정보 문의: {privacyPolicy.email}
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
