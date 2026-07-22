import { createServerClient } from "@supabase/ssr";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getAppOrigin } from "../../../lib/siteUrl";
import { resolvePosterImageGallery } from "../../../lib/posterImage";
import { PosterDetailClient, type PosterDetailLink, type PosterDetailPoster } from "./PosterDetailClient";

export const dynamic = "force-dynamic";

type PosterRow = {
  id: string;
  title: string;
  source_org_name: string | null;
  summary_short: string | null;
  summary_long: string | null;
  poster_status: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  thumbnail_url: string | null;
  source_key: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CategoryLinkRow = {
  poster_id: string;
  category_id: string;
};

type RegionLinkRow = {
  poster_id: string;
  region_id: string;
};

type ImageRow = {
  poster_id: string;
  storage_path: string | null;
  image_type: string | null;
  created_at: string | null;
};

type CategoryRow = {
  id: string;
  name: string | null;
};

type RegionRow = {
  id: string;
  name: string | null;
  full_name: string | null;
  level: string | null;
};

function createPosterServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          // Server components only need read access to the auth cookies.
        },
      },
    }
  );
}

function first<T>(items: T[]): T | null {
  return items.length > 0 ? items[0] : null;
}

function plainText(value?: string | null) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPosterDetail(id: string) {
  const supabase = createPosterServerClient();

  const [posterRes, categoryLinksRes, regionLinksRes, imageRes, linkRes] = await Promise.all([
    supabase
      .from("posters")
      .select("id, title, source_org_name, summary_short, summary_long, poster_status, application_start_at, application_end_at, thumbnail_url, source_key, published_at, created_at, updated_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("poster_categories")
      .select("poster_id, category_id")
      .eq("poster_id", id),
    supabase
      .from("poster_regions")
      .select("poster_id, region_id")
      .eq("poster_id", id),
    supabase
      .from("poster_images")
      .select("poster_id, storage_path, image_type, created_at")
      .eq("poster_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("poster_links")
      .select("id, poster_id, link_type, title, url, is_primary")
      .eq("poster_id", id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);

  if (posterRes.error || !posterRes.data) return null;

  const categoryLinks = (categoryLinksRes.data ?? []) as CategoryLinkRow[];
  const regionLinks = (regionLinksRes.data ?? []) as RegionLinkRow[];
  const categoryIds = [...new Set(categoryLinks.map((link) => link.category_id).filter(Boolean))];
  const regionIds = [...new Set(regionLinks.map((link) => link.region_id).filter(Boolean))];

  const [categoryRes, regionRes] = await Promise.all([
    categoryIds.length
      ? supabase.from("categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [] as CategoryRow[] }),
    regionIds.length
      ? supabase.from("regions").select("id, name, full_name, level").in("id", regionIds)
      : Promise.resolve({ data: [] as RegionRow[] }),
  ]);

  const categories = (categoryRes.data ?? []) as CategoryRow[];
  const regions = (regionRes.data ?? []) as RegionRow[];
  const categoryMap = Object.fromEntries(categories.map((category) => [category.id, category.name]));
  const regionMap = Object.fromEntries(
    regions.map((region) => [
      region.id,
      region.level === "sigungu" ? region.full_name || region.name : region.name,
    ])
  );
  const images = [...((imageRes.data ?? []) as ImageRow[])].sort((a, b) => {
    if (a.image_type === "thumbnail" && b.image_type !== "thumbnail") return -1;
    if (a.image_type !== "thumbnail" && b.image_type === "thumbnail") return 1;
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  });

  const poster = posterRes.data as PosterRow;
  const categoryId = first(categoryIds);
  const regionId = first(regionIds);
  const enrichedPoster: PosterDetailPoster = {
    ...poster,
    categoryId,
    regionId,
    categoryIds,
    regionIds,
    categoryName: categoryId ? categoryMap[categoryId] ?? null : null,
    regionName: regionId ? regionMap[regionId] ?? null : null,
    images: images.map((image) => image.storage_path).filter((path): path is string => Boolean(path)),
  };

  return {
    poster: enrichedPoster,
    links: ((linkRes.data ?? []) as PosterDetailLink[]).filter((link) => Boolean(link.url)),
  };
}

function buildPosterStructuredData(poster: PosterDetailPoster, links: PosterDetailLink[]) {
  const appOrigin = getAppOrigin();
  const pageUrl = `${appOrigin}/posters/${poster.id}`;
  const imageUrls = resolvePosterImageGallery(poster.images ?? [], poster.thumbnail_url, poster.source_key);
  const primaryLink = links.find((link) => link.is_primary) || links[0] || null;
  const description = plainText(poster.summary_short || poster.summary_long).slice(0, 300);

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: poster.title,
    description,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    inLanguage: "ko-KR",
    ...(poster.source_org_name
      ? {
          publisher: {
            "@type": "Organization",
            name: poster.source_org_name,
          },
        }
      : {}),
    ...(poster.created_at ? { datePublished: poster.created_at } : {}),
    ...(poster.updated_at ? { dateModified: poster.updated_at } : {}),
    ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
    ...(primaryLink?.url ? { sameAs: [primaryLink.url] } : {}),
    about: [poster.categoryName, poster.regionName].filter(Boolean),
  };
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const detail = await fetchPosterDetail(params.id);

  if (!detail) {
    return {
      title: "공고를 찾을 수 없습니다",
    };
  }

  const { poster, links } = detail;
  const description = plainText(poster.summary_short || poster.summary_long).slice(0, 155) ||
    `${poster.source_org_name || "공공기관"} 공고를 PosterLink에서 확인하세요.`;
  const imageUrls = resolvePosterImageGallery(poster.images ?? [], poster.thumbnail_url, poster.source_key);
  const primaryLink = links.find((link) => link.is_primary) || links[0] || null;

  return {
    title: `${poster.title} | ${poster.source_org_name || "공공 공고"}`,
    description,
    alternates: {
      canonical: `/posters/${poster.id}`,
    },
    openGraph: {
      title: `${poster.title} | ${poster.source_org_name || "공공 공고"} | PosterLink`,
      description,
      url: `/posters/${poster.id}`,
      type: "article",
      images: imageUrls.length > 0 ? imageUrls.map((url) => ({ url })) : undefined,
    },
    ...(primaryLink?.url
      ? {
          other: {
            "posterlink:source_url": primaryLink.url,
          },
        }
      : {}),
  };
}

export default async function PosterDetailPage({ params }: { params: { id: string } }) {
  const detail = await fetchPosterDetail(params.id);

  if (!detail) {
    notFound();
  }

  const structuredData = buildPosterStructuredData(detail.poster, detail.links);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <PosterDetailClient poster={detail.poster} links={detail.links} />
    </>
  );
}
