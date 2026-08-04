import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscoveryLanding } from "../../../components/DiscoveryLanding";
import { resolveTaxonomyByRouteValue, taxonomySlug } from "../../../../lib/discoveryRoutes";
import { fetchPublicTaxonomies } from "../../../../lib/publicDiscovery";

export const dynamic = "force-dynamic";

async function resolveRoute(regionValue: string, categoryValue: string) {
  const { regions, categories } = await fetchPublicTaxonomies();
  return {
    region: resolveTaxonomyByRouteValue(regions, regionValue),
    category: resolveTaxonomyByRouteValue(categories, categoryValue),
  };
}

export async function generateMetadata({ params }: { params: { region: string; category: string } }): Promise<Metadata> {
  const { region, category } = await resolveRoute(params.region, params.category);
  if (!region || !category) return { title: "공고 조건을 찾을 수 없습니다" };
  const canonical = `/regions/${taxonomySlug(region, "REG")}/${taxonomySlug(category, "CAT")}`;
  const description = `${region.full_name || region.name}의 ${category.name} 공공 공고와 공식 신청 정보를 확인하세요.`;
  return {
    title: `${region.name} ${category.name} 공공 공고`,
    description,
    alternates: { canonical },
    openGraph: { title: `${region.name} ${category.name} 공공 공고 | PosterLink`, description, url: canonical },
  };
}

export default async function RegionCategoryLandingPage({ params }: { params: { region: string; category: string } }) {
  const { region, category } = await resolveRoute(params.region, params.category);
  if (!region || !category) notFound();
  const canonical = `/regions/${taxonomySlug(region, "REG")}/${taxonomySlug(category, "CAT")}`;
  return (
    <DiscoveryLanding
      eyebrow="Region and category"
      title={`${region.name} ${category.name} 공공 공고`}
      description={`${region.full_name || region.name}에서 확인할 수 있는 ${category.name} 공고의 대상과 신청기간, 공식 신청 경로를 확인하세요.`}
      filters={{ region: region.id, category: category.id }}
      canonicalPath={canonical}
    />
  );
}
