import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscoveryLanding } from "../../components/DiscoveryLanding";
import { resolveTaxonomyByRouteValue, taxonomySlug } from "../../../lib/discoveryRoutes";
import { fetchPublicTaxonomies } from "../../../lib/publicDiscovery";

export const dynamic = "force-dynamic";

async function resolveCategory(value: string) {
  const { categories } = await fetchPublicTaxonomies();
  return resolveTaxonomyByRouteValue(categories, value);
}

export async function generateMetadata({ params }: { params: { category: string } }): Promise<Metadata> {
  const category = await resolveCategory(params.category);
  if (!category) return { title: "분야를 찾을 수 없습니다" };
  const canonical = `/categories/${taxonomySlug(category, "CAT")}`;
  const description = `${category.name} 분야의 현재 신청 가능한 공공기관 지원사업, 교육, 행사와 모집 공고를 확인하세요.`;
  return {
    title: `${category.name} 공공 공고`,
    description,
    alternates: { canonical },
    openGraph: { title: `${category.name} 공공 공고 | PosterLink`, description, url: canonical },
  };
}

export default async function CategoryLandingPage({ params }: { params: { category: string } }) {
  const category = await resolveCategory(params.category);
  if (!category) notFound();
  const canonical = `/categories/${taxonomySlug(category, "CAT")}`;
  return (
    <DiscoveryLanding
      eyebrow="Category"
      title={`${category.name} 공공 공고`}
      description={`${category.name} 분야의 신청기간, 대상, 혜택과 공식 신청 경로를 한곳에서 확인하세요.`}
      filters={{ category: category.id }}
      canonicalPath={canonical}
    />
  );
}
