import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "./components/ToastProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://posterlink.co.kr";
const appOrigin = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "PosterLink",
    template: "%s | PosterLink",
  },
  description: "청년, 소상공인, 문화 공고를 한눈에 — PosterLink",
  metadataBase: new URL(appOrigin),
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "PosterLink",
    title: "PosterLink — 공공 포스터 링크 플랫폼",
    description: "청년, 소상공인, 문화 공고를 한눈에 — PosterLink",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "PosterLink — 공공 포스터 링크 플랫폼" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PosterLink",
    description: "청년, 소상공인, 문화 공고를 한눈에 — PosterLink",
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
          {children}
          <ToastProvider />
        </ErrorBoundary>
      </body>
    </html>
  );
}
