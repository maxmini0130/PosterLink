import { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://posterlink.co.kr";
const appOrigin = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/posters/", "/privacy", "/terms"],
        disallow: ["/admin/", "/operator/", "/mypage/", "/onboarding", "/api/"],
      },
    ],
    sitemap: `${appOrigin}/sitemap.xml`,
  };
}
