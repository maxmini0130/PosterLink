"use client";
import { Analytics } from "@vercel/analytics/next";
import { publicAnalyticsPath, campaignQuery } from "../../lib/analyticsPrivacy";
export default function ExistingWebAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        try {
          const url = new URL(event.url);
          const path = publicAnalyticsPath(url.pathname);
          if (!path) return null;
          const query = campaignQuery(url.search).toString();
          return {
            ...event,
            url: url.origin + path + (query ? "?" + query : ""),
          };
        } catch {
          return null;
        }
      }}
    />
  );
}
