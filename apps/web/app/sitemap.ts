import { MetadataRoute } from "next";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://posterlink.co.kr";
const appOrigin = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { cookies: { get: () => undefined } }
  );

  const { data: posters } = await supabase
    .from("posters")
    .select("id, updated_at")
    .eq("poster_status", "published")
    .order("updated_at", { ascending: false })
    .limit(1000);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: appOrigin, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${appOrigin}/posters`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${appOrigin}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${appOrigin}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];

  const posterRoutes: MetadataRoute.Sitemap = (posters ?? []).map((p) => ({
    url: `${appOrigin}/posters/${p.id}`,
    lastModified: new Date(p.updated_at ?? Date.now()),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...posterRoutes];
}
