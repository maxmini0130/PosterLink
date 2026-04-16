import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PosterLink",
  description: "공공 포스터 링크 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
