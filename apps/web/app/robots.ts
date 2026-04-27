import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/posters/", "/privacy", "/terms"],
        disallow: ["/admin/", "/operator/", "/mypage/", "/onboarding", "/api/"],
      },
    ],
    sitemap: "https://posterlink.co.kr/sitemap.xml",
  };
}
