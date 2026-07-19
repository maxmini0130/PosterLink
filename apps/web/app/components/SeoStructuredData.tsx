import { getAppOrigin } from "../../lib/siteUrl";

const appOrigin = getAppOrigin();

const description =
  "정부·지자체·공공기관의 청년지원, 소상공인 지원사업, 교육, 문화행사, 채용·모집 공고를 지역과 관심분야별로 찾아보세요.";

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
