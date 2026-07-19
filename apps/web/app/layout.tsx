import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ToastProvider } from "./components/ToastProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import SiteVisitTracker from "./components/SiteVisitTracker";
import { SeoStructuredData } from "./components/SeoStructuredData";
import { getAppOrigin } from "../lib/siteUrl";

const appOrigin = getAppOrigin();
const siteDescription =
  "정부·지자체·공공기관의 청년지원, 소상공인 지원사업, 교육, 문화행사, 채용·모집 공고를 지역과 관심분야별로 찾아보세요.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  applicationName: "PosterLink",
  title: {
    default: "포스터링크 | 공공기관 지원사업·교육·행사·모집 공고",
    template: "%s | PosterLink",
  },
  description: siteDescription,
  keywords: [
    "포스터링크",
    "PosterLink",
    "공공기관 공고",
    "지원사업",
    "교육 공고",
    "행사 공고",
    "모집 공고",
    "채용 공고",
    "청년 지원",
    "소상공인 지원",
    "문화 행사",
    "교육 모집",
    "마포구 공고",
    "서울 공고",
    "공식 신청 링크",
  ],
  metadataBase: new URL(appOrigin),
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "PosterLink",
    url: appOrigin,
    title: "포스터링크 | 공공기관 지원사업·교육·행사·모집 공고",
    description: siteDescription,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "포스터링크 공공기관 공고 탐색" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "포스터링크 | 공공기관 공고 탐색",
    description: siteDescription,
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <ErrorBoundary>
          <SeoStructuredData />
          <Suspense fallback={null}>
            <SiteVisitTracker />
          </Suspense>
          {children}
          <ToastProvider />
        </ErrorBoundary>
      </body>
    </html>
  );
}
