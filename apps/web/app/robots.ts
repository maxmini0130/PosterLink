import { MetadataRoute } from "next";
import { getAppOrigin } from "../lib/siteUrl";

const appOrigin = getAppOrigin();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: [
          "*",
          "Googlebot",
          "Bingbot",
          "Yeti",
          "OAI-SearchBot",
          "ChatGPT-User",
        ],
        allow: [
          "/",
          "/posters/",
          "/regions/",
          "/categories/",
          "/institutions/",
          "/privacy",
          "/terms",
        ],
        disallow: ["/admin/", "/operator/", "/mypage/", "/onboarding", "/api/"],
      },
      // Training crawling is independent from search/user-requested retrieval.
      { userAgent: "GPTBot", disallow: ["/"] },
    ],
    sitemap: `${appOrigin}/sitemap-index.xml`,
  };
}
