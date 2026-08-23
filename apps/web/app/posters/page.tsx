import type { Metadata } from "next";
import { getAppOrigin } from "../../lib/siteUrl";
import { taxonomySlug } from "../../lib/discoveryRoutes";
import { fetchPublicDiscovery } from "../../lib/publicDiscovery";
import { PosterListClient } from "./PosterListClient";

export const dynamic = "force-dynamic";

type PosterSearchParams = {
  q?: string;
  category?: string;
  region?: string;
  sort?: string;
  closed?: string;
};

function readFilters(searchParams: PosterSearchParams) {
  return {
    query: searchParams.q?.trim().slice(0, 80) ?? "",
    category: searchParams.category ?? null,
    region: searchParams.region ?? null,
    sort: searchParams.sort ?? null,
    includeClosed: searchParams.closed === "include",
  };
}

export async function generateMetadata({ searchParams }: { searchParams: PosterSearchParams }): Promise<Metadata> {
  const filters = readFilters(searchParams);
  const discovery = await fetchPublicDiscovery({ ...filters, limit: 1 });
  const labels = [discovery.selectedRegion?.name, discovery.selectedCategory?.name, filters.query].filter(Boolean);
  const qualifier = labels.length > 0 ? `${labels.join(" · ")} ` : "";
  const title = `${qualifier}공공 공고 찾기`;
  const description = `${qualifier}지원사업, 교육, 행사, 채용·모집 공고의 신청기간과 공식 신청 링크를 확인하세요.`;
  let canonical = "/posters";
  if (!filters.query && discovery.selectedRegion && discovery.selectedCategory) {
    canonical = `/regions/${taxonomySlug(discovery.selectedRegion, "REG")}/${taxonomySlug(discovery.selectedCategory, "CAT")}`;
  } else if (!filters.query && discovery.selectedRegion) {
    canonical = `/regions/${taxonomySlug(discovery.selectedRegion, "REG")}`;
  } else if (!filters.query && discovery.selectedCategory) {
    canonical = `/categories/${taxonomySlug(discovery.selectedCategory, "CAT")}`;
  }

  return {
    title,
    description,
    alternates: { canonical },
    robots: filters.query ? { index: false, follow: true } : undefined,
    openGraph: { title: `${title} | PosterLink`, description, url: canonical },
  };
}

export default async function PosterListPage({ searchParams }: { searchParams: PosterSearchParams }) {
  const filters = readFilters(searchParams);
  const discovery = await fetchPublicDiscovery(filters);
  const appOrigin = getAppOrigin();
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "PosterLink 공공 공고",
    numberOfItems: discovery.totalCount,
    itemListElement: discovery.posters.slice(0, 24).map((poster, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${appOrigin}/posters/${poster.id}`,
      name: poster.title,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }}
      />
      <PosterListClient
        initialPosters={discovery.posters}
        initialTotalCount={discovery.totalCount}
        initialCategories={discovery.categories}
        initialRegions={discovery.regions}
        initialQuery={filters.query}
        initialCategoryId={discovery.selectedCategory?.id ?? null}
        initialRegionId={discovery.selectedRegion?.id ?? null}
        initialSort={discovery.sort}
        initialIncludeClosed={filters.includeClosed}
      />
    </>
  );
}
