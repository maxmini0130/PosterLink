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
  "포스터링크는 청년 지원, 소상공인 지원, 문화 행사, 교육 모집 등 공공기관 공고와 공식 신청 링크를 모아보는 포스터 검색 서비스입니다.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  applicationName: "PosterLink",
  title: {
    default: "PosterLink - 포스터링크",
    template: "%s | PosterLink",
  },
  description: siteDescription,
  keywords: [
    "포스터링크",
    "PosterLink",
    "공공 포스터",
    "공공기관 공고",
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
    title: "PosterLink - 포스터링크 공공 포스터 검색",
    description: siteDescription,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "PosterLink 포스터링크 공공 포스터 검색" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PosterLink - 포스터링크",
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
