import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscoveryLanding } from "../../../components/DiscoveryLanding";
import {
  resolveTaxonomyByRouteValue,
  taxonomySlug,
} from "../../../../lib/discoveryRoutes";
import {
  fetchPublicDiscovery,
  fetchPublicTaxonomies,
} from "../../../../lib/publicDiscovery";

export const dynamic = "force-dynamic";

async function resolveRoute(regionValue: string, categoryValue: string) {
  const { regions, categories } = await fetchPublicTaxonomies();
  return {
    region: resolveTaxonomyByRouteValue(regions, regionValue),
    category: resolveTaxonomyByRouteValue(categories, categoryValue),
  };
}

const FEATURED_REGION = "seoul-gangseo";
const FEATURED_CATEGORY = "event-recruit";

function isFeaturedLanding(regionValue: string, categoryValue: string) {
  return regionValue === FEATURED_REGION && categoryValue === FEATURED_CATEGORY;
}

async function getFeaturedDiscovery(regionId: string, categoryId: string) {
  return fetchPublicDiscovery({
    region: regionId,
    category: categoryId,
    regionScope: "exact",
    limit: 48,
  });
}

function currentKoreanMonth() {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}년 ${month}`;
}

export async function generateMetadata({
  params,
}: {
  params: { region: string; category: string };
}): Promise<Metadata> {
  const { region, category } = await resolveRoute(
    params.region,
    params.category,
  );
  if (!region || !category) return { title: "공고 조건을 찾을 수 없습니다" };
  const canonical = `/regions/${taxonomySlug(region, "REG")}/${taxonomySlug(category, "CAT")}`;
  if (isFeaturedLanding(params.region, params.category)) {
    const discovery = await getFeaturedDiscovery(region.id, category.id);
    const title = `${region.name} ${category.name} 모음 - ${currentKoreanMonth()} 신청 가능한 공고 ${discovery.posters.length}건`;
    const description = `${region.full_name || region.name}에서 현재 신청할 수 있는 행사와 참여자 모집 공고 ${discovery.posters.length}건을 마감일, 기관명, 공식 신청 경로와 함께 확인하세요.`;
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title: `${title} | PosterLink`,
        description,
        url: canonical,
      },
    };
  }
  const description = `${region.full_name || region.name}의 ${category.name} 공공 공고와 공식 신청 정보를 확인하세요.`;
  return {
    title: `${region.name} ${category.name} 공공 공고`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${region.name} ${category.name} 공공 공고 | PosterLink`,
      description,
      url: canonical,
    },
  };
}

export default async function RegionCategoryLandingPage({
  params,
}: {
  params: { region: string; category: string };
}) {
  const { region, category } = await resolveRoute(
    params.region,
    params.category,
  );
  if (!region || !category) notFound();
  const canonical = `/regions/${taxonomySlug(region, "REG")}/${taxonomySlug(category, "CAT")}`;
  if (isFeaturedLanding(params.region, params.category)) {
    const discovery = await getFeaturedDiscovery(region.id, category.id);
    const month = currentKoreanMonth();
    return (
      <DiscoveryLanding
        eyebrow={`${month} 강서구 공고`}
        title={`${region.name} ${category.name} 모음`}
        description={`${region.full_name || region.name}에서 현재 신청 가능한 행사와 참여자 모집 공고 ${discovery.posters.length}건을 모았습니다.`}
        introParagraphs={[
          "지역 주민이 참여할 수 있는 문화행사, 체험 프로그램, 주민 모집 정보를 한곳에서 비교할 수 있습니다. 각 공고에서 모집 대상과 신청기간을 확인하고 공식 신청 경로로 이동할 수 있습니다.",
          "접수 일정은 공고마다 다르므로 마감일이 가까운 순서로 살펴보세요. 모집이 끝났거나 내용이 변경된 경우에는 원문 기관의 최신 안내를 기준으로 판단해야 합니다.",
        ]}
        filters={{
          region: region.id,
          category: category.id,
          regionScope: "exact",
        }}
        canonicalPath={canonical}
        initialDiscovery={discovery}
        relatedLinks={[
          { href: "/regions/seoul-gangseo/course", label: "강서구 교육강좌" },
          {
            href: "/regions/seoul-gangseo/welfare",
            label: "강서구 지원금·복지",
          },
          { href: "/regions/seoul/event-recruit", label: "서울 행사모집" },
          {
            href: "/regions/seoul-yangcheon/event-recruit",
            label: "양천구 행사모집",
          },
        ]}
      />
    );
  }
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
