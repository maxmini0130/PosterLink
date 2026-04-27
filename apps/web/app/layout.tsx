import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "./components/ToastProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";

export const metadata: Metadata = {
  title: {
    default: "PosterLink",
    template: "%s | PosterLink",
  },
  description: "청년, 소상공인, 문화 공고를 한눈에 — PosterLink",
  metadataBase: new URL("https://posterlink.co.kr"),
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "PosterLink",
    title: "PosterLink — 공공 포스터 링크 플랫폼",
    description: "청년, 소상공인, 문화 공고를 한눈에 — PosterLink",
  },
  twitter: {
    card: "summary_large_image",
    title: "PosterLink",
    description: "청년, 소상공인, 문화 공고를 한눈에 — PosterLink",
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
          {children}
          <ToastProvider />
        </ErrorBoundary>
      </body>
    </html>
  );
}
