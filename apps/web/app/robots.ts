import { MetadataRoute } from "next";
import { getAppOrigin } from "../lib/siteUrl";

const appOrigin = getAppOrigin();

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
