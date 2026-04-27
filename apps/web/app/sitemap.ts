import { MetadataRoute } from "next";
import { createServerClient } from "@supabase/ssr";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: () => undefined } }
  );

  const { data: posters } = await supabase
    .from("posters")
    .select("id, updated_at")
    .eq("poster_status", "published")
    .order("updated_at", { ascending: false })
    .limit(1000);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: "https://posterlink.co.kr", lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: "https://posterlink.co.kr/posters", lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: "https://posterlink.co.kr/privacy", lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: "https://posterlink.co.kr/terms", lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];

  const posterRoutes: MetadataRoute.Sitemap = (posters ?? []).map((p) => ({
    url: `https://posterlink.co.kr/posters/${p.id}`,
    lastModified: new Date(p.updated_at ?? Date.now()),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...posterRoutes];
}
