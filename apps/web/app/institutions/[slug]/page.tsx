import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarClock, ExternalLink, ShieldCheck } from "lucide-react";
import { BottomNav } from "../../components/BottomNav";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { PosterCard } from "../../components/PosterCard";
import { fetchPublicInstitution } from "../../../lib/publicDiscovery";
import { getAppOrigin } from "../../../lib/siteUrl";
import { institutionTypeLabel, type DiscoveryPoster } from "../../../lib/discoveryRoutes";
import { InstitutionFollowButton } from "../InstitutionFollowButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const detail = await fetchPublicInstitution(params.slug);
  if (!detail) return { title: "기관을 찾을 수 없습니다" };
  const { institution } = detail;
  const canonical = `/institutions/${institution.slug}`;
  const description = `${institution.name}의 현재 모집 공고, 공식 홈페이지와 PosterLink 데이터 확인 상태를 살펴보세요.`;
  return {
    title: institution.name,
    description,
    alternates: { canonical },
    openGraph: { title: `${institution.name} 공고 | PosterLink`, description, url: canonical },
  };
}

export default async function InstitutionDetailPage({ params }: { params: { slug: string } }) {
  const detail = await fetchPublicInstitution(params.slug);
  if (!detail) notFound();
  const { institution, posters } = detail;
  const organizedPosters = posters.filter((poster) => poster.organizer_id === institution.id);
  const sourcedPosters = posters.filter(
    (poster) => poster.source_institution_id === institution.id && poster.organizer_id !== institution.id,
  );
  const appOrigin = getAppOrigin();
  const pageUrl = `${appOrigin}/institutions/${institution.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: institution.name,
    url: pageUrl,
    ...(institution.homepage_url ? { sameAs: [institution.homepage_url] } : {}),
    ...(institution.region_name
      ? { areaServed: { "@type": "AdministrativeArea", name: institution.region_name } }
      : {}),
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <nav aria-label="현재 위치" className="text-xs font-bold text-slate-500">
          <Link href="/institutions" className="hover:text-blue-700">기관 찾기</Link>
          <span aria-hidden="true"> / </span>
          <span>{institution.name}</span>
        </nav>

        <header className="mt-5 border-y border-slate-200 py-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                <span className="inline-flex items-center gap-1 border border-blue-200 bg-blue-50 px-2 py-1 text-blue-800">
                  <ShieldCheck size={13} />
                  {institution.verification_status === "verified" ? "기관 인증 완료" : "공식 수집 채널 확인"}
                </span>
                {institution.institution_type && (
                  <span className="border border-slate-200 px-2 py-1 text-slate-600">{institutionTypeLabel(institution.institution_type)}</span>
                )}
              </div>
              <div className="mt-4 flex items-start gap-3">
                <Building2 className="mt-1 shrink-0 text-blue-700" size={28} />
                <div>
                  <h1 className="text-3xl font-black leading-tight text-slate-950">{institution.name}</h1>
                  <p className="mt-2 text-sm font-bold text-slate-600">{institution.region_name || "활동 지역 확인 중"}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {institution.homepage_url && (
                <a
                  href={institution.homepage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 px-4 text-sm font-black text-slate-700 hover:border-blue-500 hover:text-blue-700"
                >
                  공식 홈페이지 <ExternalLink size={16} />
                </a>
              )}
              <InstitutionFollowButton institutionId={institution.id} returnPath={`/institutions/${institution.slug}`} />
            </div>
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4">
            <InstitutionMetric label="현재 모집" value={`${institution.activePosterCount}건`} />
            <InstitutionMetric label="주최 확인" value={`${institution.organizedPosterCount}건`} />
            <InstitutionMetric label="게시 출처" value={`${institution.sourcedPosterCount}건`} />
            <InstitutionMetric label="최근 수집" value={formatCollectedAt(institution.last_collected_at)} />
          </dl>
        </header>

        <InstitutionPosterSection
          title="이 기관이 주최·주관하는 공고"
          description="사람 검증을 통해 실제 주최·주관기관 관계가 확인된 공고입니다."
          posters={organizedPosters}
        />
        <InstitutionPosterSection
          title="이 기관에서 게시·수집한 공고"
          description="이 기관의 공식 채널에서 확인한 공고입니다. 실제 주최기관은 각 공고 상세에서 별도로 확인하세요."
          posters={sourcedPosters}
        />
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}

function InstitutionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4">
      <dt className="text-[11px] font-black text-slate-500">{label}</dt>
      <dd className="mt-1 text-base font-black text-slate-950">{value}</dd>
    </div>
  );
}

function InstitutionPosterSection({
  title,
  description,
  posters,
}: {
  title: string;
  description: string;
  posters: DiscoveryPoster[];
}) {
  return (
    <section className="border-b border-slate-200 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-600">{description}</p>
        </div>
        <span className="text-xs font-black text-slate-500">{posters.length}건</span>
      </div>
      {posters.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {posters.map((poster) => (
            <PosterCard
              key={poster.id}
              poster={{
                id: poster.id,
                title: poster.title,
                org: poster.verification_status === "verified" && poster.verified_at
                  ? poster.organizer_name || poster.source_org_name || undefined
                  : poster.source_org_name || undefined,
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
        <div className="mt-6 flex items-center gap-3 border border-dashed border-slate-300 px-4 py-8 text-sm font-bold text-slate-500">
          <CalendarClock size={20} />
          현재 표시할 공고가 없습니다.
        </div>
      )}
    </section>
  );
}

function formatCollectedAt(value: string | null) {
  if (!value) return "확인 중";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 중";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).format(date);
}
