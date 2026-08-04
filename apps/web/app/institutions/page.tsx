import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { BottomNav } from "../components/BottomNav";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { getAppOrigin } from "../../lib/siteUrl";
import { fetchPublicInstitutions } from "../../lib/publicDiscovery";
import { institutionTypeLabel } from "../../lib/discoveryRoutes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공공기관 찾기",
  description: "PosterLink가 공고를 확인하는 공공기관과 공익기관을 찾고 새 공고를 팔로우하세요.",
  alternates: { canonical: "/institutions" },
  openGraph: {
    title: "공공기관 찾기 | PosterLink",
    description: "기관별 현재 모집 공고와 공식 홈페이지, 데이터 확인 상태를 살펴보세요.",
    url: "/institutions",
  },
};

export default async function InstitutionsPage({ searchParams }: { searchParams: { q?: string } }) {
  const search = searchParams.q?.trim().slice(0, 80) ?? "";
  const institutions = await fetchPublicInstitutions(search);
  const appOrigin = getAppOrigin();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "PosterLink 기관 디렉터리",
    numberOfItems: institutions.length,
    itemListElement: institutions.slice(0, 100).map((institution, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: institution.name,
      url: `${appOrigin}/institutions/${institution.slug}`,
    })),
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
          <p className="text-xs font-black uppercase text-blue-700">Institutions</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">공공기관 찾기</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-600">
            기관별 공고와 공식 홈페이지, 최근 수집 상태를 확인하고 관심 기관의 새 공고를 팔로우하세요.
          </p>
          <form action="/institutions" method="get" className="mt-5 flex max-w-xl border border-slate-300 bg-white">
            <Search className="ml-4 mt-3.5 shrink-0 text-slate-400" size={18} />
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="기관명 또는 지역 검색"
              className="min-w-0 flex-1 px-3 py-3 text-sm font-bold text-slate-900 outline-none"
            />
            <button type="submit" className="bg-slate-950 px-5 text-sm font-black text-white hover:bg-blue-800">
              검색
            </button>
          </form>
        </header>

        <section className="py-8" aria-labelledby="institution-list-title">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-black text-slate-500">확인 가능한 기관</p>
              <h2 id="institution-list-title" className="mt-1 text-xl font-black text-slate-950">
                {institutions.length.toLocaleString()}개
              </h2>
            </div>
            {search && <Link href="/institutions" className="text-xs font-black text-blue-700">검색 초기화</Link>}
          </div>

          {institutions.length > 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {institutions.map((institution) => (
                <Link
                  key={institution.id}
                  href={`/institutions/${institution.slug}`}
                  className="border border-slate-200 p-5 transition-colors hover:border-blue-500"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Building2 className="shrink-0 text-blue-700" size={21} />
                    <span className="border border-slate-200 px-2 py-1 text-[10px] font-black text-slate-600">
                      {institution.verification_status === "verified" ? "인증 기관" : "공식 채널 확인"}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-black text-slate-950">{institution.name}</h3>
                  <p className="mt-2 min-h-5 text-xs font-bold text-slate-500">
                    {[institution.region_name, institutionTypeLabel(institution.institution_type)].filter(Boolean).join(" · ") || "기관 정보 확인 중"}
                  </p>
                  <div className="mt-5 flex gap-4 border-t border-slate-100 pt-4 text-xs font-black text-slate-600">
                    <span>모집 중 {institution.activePosterCount}건</span>
                    <span>확인 공고 {institution.organizedPosterCount + institution.sourcedPosterCount}건</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-6 border border-dashed border-slate-300 py-20 text-center">
              <Building2 className="mx-auto text-slate-300" size={38} />
              <p className="mt-4 text-sm font-black text-slate-600">일치하는 기관이 없습니다.</p>
            </div>
          )}
        </section>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
