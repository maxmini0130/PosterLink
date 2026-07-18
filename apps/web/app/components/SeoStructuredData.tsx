import { getAppOrigin } from "../../lib/siteUrl";

const appOrigin = getAppOrigin();

const description =
  "포스터링크는 청년 지원, 소상공인 지원, 문화 행사, 교육 모집 등 공공기관 공고와 공식 신청 링크를 모아보는 포스터 검색 서비스입니다.";

export function SeoStructuredData() {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "PosterLink",
      alternateName: "포스터링크",
      url: appOrigin,
      description,
      inLanguage: "ko-KR",
      potentialAction: {
        "@type": "SearchAction",
        target: `${appOrigin}/posters?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "PosterLink",
      alternateName: "포스터링크",
      url: appOrigin,
      logo: `${appOrigin}/logo.png`,
      description,
    },
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
      }}
    />
  );
}
