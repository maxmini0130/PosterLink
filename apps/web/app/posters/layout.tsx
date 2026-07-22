import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "공공 공고 찾기 | 지원사업·교육·행사·모집",
  description:
    "지역, 대상, 분야, 신청기간을 설정해 현재 접수 중인 공공기관 지원사업과 교육·행사·모집 공고를 검색하세요.",
  alternates: {
    canonical: "/posters",
  },
  openGraph: {
    title: "공공 공고 찾기 | 지원사업·교육·행사·모집 | PosterLink",
    description:
      "지역, 대상, 분야, 신청기간을 설정해 현재 접수 중인 공공기관 지원사업과 교육·행사·모집 공고를 검색하세요.",
    url: "/posters",
  },
};

export default function PostersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
