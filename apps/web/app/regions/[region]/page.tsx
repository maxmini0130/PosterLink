import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscoveryLanding } from "../../components/DiscoveryLanding";
import { resolveTaxonomyByRouteValue, taxonomySlug } from "../../../lib/discoveryRoutes";
import { fetchPublicTaxonomies } from "../../../lib/publicDiscovery";

export const dynamic = "force-dynamic";

async function resolveRegion(value: string) {
  const { regions } = await fetchPublicTaxonomies();
  return resolveTaxonomyByRouteValue(regions, value);
}

export async function generateMetadata({ params }: { params: { region: string } }): Promise<Metadata> {
  const region = await resolveRegion(params.region);
  if (!region) return { title: "지역을 찾을 수 없습니다" };
  const canonical = `/regions/${taxonomySlug(region, "REG")}`;
  const description = `${region.full_name || region.name}에서 신청할 수 있는 공공기관 지원사업, 교육, 행사와 모집 공고를 확인하세요.`;
  return {
    title: `${region.name} 공공 공고`,
    description,
    alternates: { canonical },
    openGraph: { title: `${region.name} 공공 공고 | PosterLink`, description, url: canonical },
  };
}

export default async function RegionLandingPage({ params }: { params: { region: string } }) {
  const region = await resolveRegion(params.region);
  if (!region) notFound();
  const canonical = `/regions/${taxonomySlug(region, "REG")}`;
  return (
    <DiscoveryLanding
      eyebrow="Region"
      title={`${region.full_name || region.name} 공공 공고`}
      description={`${region.name} 지역의 신청기간, 대상, 혜택과 공식 신청 경로를 빠르게 확인하세요.`}
      filters={{ region: region.id }}
      canonicalPath={canonical}
    />
  );
}
