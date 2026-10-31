import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "./components/ToastProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import GaAnalytics from "./components/GaAnalytics";
import SiteVisitTracker from "./components/SiteVisitTracker";
import ProductEventsTracker from "./components/ProductEventsTracker";
import PendingActionRunner from "./components/PendingActionRunner";
import { SeoStructuredData } from "./components/SeoStructuredData";
import { getAppOrigin } from "../lib/siteUrl";
import ExistingWebAnalytics from "./components/ExistingWebAnalytics";
import { Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";

// Fonts for redesigned screens (font-pl-serif / font-pl-sans). Not preloaded so
// screens that do not use them yet do not pay for the Korean font files.
const plSerif = Noto_Serif_KR({
  weight: ["700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-pl-serif",
});
const plSans = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-pl-sans",
});

const appOrigin = getAppOrigin();
const siteDescription =
  "청년 지원, 소상공인 지원, 교육, 문화행사, 채용·모집 등 흩어진 공공기관 공고를 지역과 관심분야별로 찾아보세요.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  applicationName: "PosterLink",
  title: {
    default: "공공 공고·지원사업·교육·행사 검색 | PosterLink",
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
    title: "공공 공고·지원사업·교육·행사 검색 | PosterLink",
    description: siteDescription,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "포스터링크 공공기관 공고 탐색" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "공공 공고·지원사업·교육·행사 검색 | PosterLink",
    description: siteDescription,
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko" className={`${plSerif.variable} ${plSans.variable}`}>
      <body>
        <ErrorBoundary>
          <SeoStructuredData />
          <Suspense fallback={null}>
            <SiteVisitTracker />
            <GaAnalytics />
            <ProductEventsTracker />
            <PendingActionRunner />
          </Suspense>
          {children}
          <ToastProvider />
          <ExistingWebAnalytics />
        </ErrorBoundary>
      </body>
    </html>
  );
}
