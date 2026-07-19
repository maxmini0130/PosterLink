import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "공공 공고 찾기",
  description:
    "포스터링크에서 정부·지자체·공공기관의 지원사업, 교육, 행사, 채용·모집 공고와 공식 신청 링크를 검색하세요.",
  alternates: {
    canonical: "/posters",
  },
  openGraph: {
    title: "공공 공고 찾기 | PosterLink",
    description:
      "청년지원, 소상공인 지원사업, 교육, 문화행사, 채용·모집 공고를 지역과 관심분야별로 찾습니다.",
    url: "/posters",
  },
};

export default function PostersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
