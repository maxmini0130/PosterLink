import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { buildPosterSearchPath, taxonomySlug } from "../../lib/discoveryRoutes";
import { fetchPublicDiscovery, type PublicDiscoveryFilters } from "../../lib/publicDiscovery";
import { getAppOrigin } from "../../lib/siteUrl";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { PosterCard } from "./PosterCard";

type DiscoveryLandingProps = {
  title: string;
  description: string;
  filters: PublicDiscoveryFilters;
  eyebrow: string;
  canonicalPath: string;
};

export async function DiscoveryLanding({ title, description, filters, eyebrow, canonicalPath }: DiscoveryLandingProps) {
  const discovery = await fetchPublicDiscovery({ ...filters, limit: 48 });
  const appOrigin = getAppOrigin();
  const searchPath = buildPosterSearchPath({
    category: discovery.selectedCategory,
    region: discovery.selectedRegion,
  });

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `${appOrigin}${canonicalPath}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: discovery.posters.length,
      itemListElement: discovery.posters.slice(0, 24).map((poster, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: poster.title,
        url: `${appOrigin}/posters/${poster.id}`,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <header className="border-b border-slate-200 pb-7">
          <p className="text-xs font-black uppercase text-blue-700">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-slate-950">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-600">{description}</p>
          <Link
            href={searchPath}
            className="mt-5 inline-flex items-center gap-2 bg-slate-950 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-blue-800"
          >
            조건을 더해 검색
            <ArrowRight size={16} />
          </Link>
        </header>

        {(discovery.selectedRegion || discovery.selectedCategory) && (
          <nav aria-label="관련 공고 탐색" className="flex flex-wrap gap-2 border-b border-slate-100 py-5">
            {discovery.selectedRegion && discovery.categories.slice(0, 10).map((category) => (
              <Link
                key={category.id}
                href={`/regions/${taxonomySlug(discovery.selectedRegion!, "REG")}/${taxonomySlug(category, "CAT")}`}
                className="border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:border-blue-500 hover:text-blue-700"
              >
                {category.name}
              </Link>
            ))}
            {!discovery.selectedRegion && discovery.selectedCategory && discovery.regions
              .filter((region) => region.level === "sido")
              .slice(0, 10)
              .map((region) => (
                <Link
                  key={region.id}
                  href={`/regions/${taxonomySlug(region, "REG")}/${taxonomySlug(discovery.selectedCategory!, "CAT")}`}
                  className="border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:border-blue-500 hover:text-blue-700"
                >
                  {region.name}
                </Link>
              ))}
          </nav>
        )}

        <section className="py-8" aria-labelledby="landing-results-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black text-slate-500">현재 확인 가능한 공고</p>
              <h2 id="landing-results-title" className="mt-1 text-xl font-black text-slate-950">
                {discovery.posters.length.toLocaleString()}건
              </h2>
            </div>
            <Link href="/institutions" className="text-xs font-black text-blue-700 hover:text-blue-900">
              기관별로 보기
            </Link>
          </div>

          {discovery.posters.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
              {discovery.posters.map((poster) => (
                <PosterCard
                  key={poster.id}
                  poster={{
                    id: poster.id,
                    title: poster.title,
                    org: poster.verification_status === "verified" && poster.verified_at
                      ? poster.organizer_name || poster.source_org_name || undefined
                      : poster.source_org_name || undefined,
                    applicationStartAt: poster.application_start_at,
                    deadline: poster.application_end_at || undefined,
                    deadlineType: poster.deadline_type,
                    tags: [poster.categoryName, poster.regionName].filter((value): value is string => Boolean(value)),
                    image: poster.thumbnail_url || undefined,
                    images: poster.images,
                    sourceUrl: poster.source_key || undefined,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="mt-6 border border-dashed border-slate-300 py-20 text-center">
              <Search className="mx-auto text-slate-300" size={36} />
              <p className="mt-4 text-sm font-black text-slate-600">현재 조건에 맞는 공개 공고가 없습니다.</p>
              <Link href="/posters" className="mt-4 inline-flex text-sm font-black text-blue-700">
                전체 공고 보기
              </Link>
            </div>
          )}
        </section>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
