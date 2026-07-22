"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  Filter,
  Heart,
  MapPin,
  PlusCircle,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { BottomNav } from "./components/BottomNav";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { PosterCard } from "./components/PosterCard";
import { fetchCategoryRegionNames, fetchPosterImages } from "./lib/posterHelpers";
import { fetchPosterMetricCounts } from "./lib/posterMetrics";

const categories = ["전체", "청년", "소상공인", "창업", "교육", "문화·행사", "복지", "채용", "주거"] as const;
const feedTabs = [
  { key: "urgent", label: "마감 임박" },
  { key: "new", label: "새로 등록" },
  { key: "popular", label: "많이 본 공고" },
] as const;

const regionShortcuts = ["마포구", "은평구", "서대문구", "영등포구", "강서구"];
const organizationHighlights = ["마포구청", "마포문화재단", "서울청년센터", "서울경제진흥원", "소상공인시장진흥공단"];
const serviceCategories = ["청년", "소상공인", "창업", "교육", "문화·행사", "복지", "채용", "주거"];

// "문화·행사"의 가운데점(·)은 실제 공고 텍스트에 그대로 나타나지 않아 검색어로 보내면 0건이 나온다.
// 라벨은 그대로 두고 실제 검색에 보내는 값만 "행사"로 대체한다.
function categorySearchTerm(category: string) {
  return category === "문화·행사" ? "행사" : category;
}

type HomeSummary = {
  todayNew: number;
  activePosters: number;
  dueThisWeek: number;
  collectionSources: number;
};

const emptyHomeSummary: HomeSummary = {
  todayNew: 0,
  activePosters: 0,
  dueThisWeek: 0,
  collectionSources: 0,
};

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [posters, setPosters] = useState<any[]>([]);
  const [urgentPosters, setUrgentPosters] = useState<any[]>([]);
  const [homeSummary, setHomeSummary] = useState<HomeSummary>(emptyHomeSummary);
  const [hideClosedPosters, setHideClosedPosters] = useState(true);
  const [activeFeed, setActiveFeed] = useState<(typeof feedTabs)[number]["key"]>("urgent");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHomeData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const attachPosterMeta = async (items: any[]) => {
          const posterIds = items.map((poster: any) => poster.id);
          const [metaMap, metricCounts, imageMap] = await Promise.all([
            fetchCategoryRegionNames(posterIds),
            fetchPosterMetricCounts(posterIds),
            fetchPosterImages(posterIds),
          ]);

          return items.map((poster: any) => ({
            ...poster,
            ...metaMap[poster.id],
            images: imageMap[poster.id] ?? [],
            viewCount: metricCounts.viewCounts[poster.id] ?? 0,
            linkClickCount: metricCounts.linkClickCounts[poster.id] ?? 0,
            favoriteCount: metricCounts.favoriteCounts[poster.id] ?? 0,
          }));
        };

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        const nowIso = new Date().toISOString();

        let postersFetched = false;
        if (user && hideClosedPosters) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*, regions(name, full_name, level)")
            .eq("id", user.id)
            .single();
          setUserProfile(profile);

          const { data: recommendedData, error: rpcError } = await supabase.rpc("get_recommended_posters_v2", {
            p_user_id: user.id,
            p_limit: 12,
          });

          if (!rpcError && recommendedData && recommendedData.length > 0) {
            setPosters(await attachPosterMeta(recommendedData));
            postersFetched = true;
          }
        }

        if (!postersFetched) {
          let publicQuery = supabase
            .from("posters")
            .select("id, title, source_org_name, application_end_at, created_at, poster_status, thumbnail_url, source_key, summary_short")
            .eq("poster_status", "published");

          if (hideClosedPosters) {
            publicQuery = publicQuery.or(`application_end_at.is.null,application_end_at.gte.${nowIso}`);
          }

          const { data: publicData, error: publicError } = await publicQuery
            .order("created_at", { ascending: false })
            .limit(36);

          if (publicError) throw publicError;
          setPosters(await attachPosterMeta(publicData ?? []));
        }

        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

        const { data: urgentData } = await supabase
          .from("posters")
          .select("id, title, source_org_name, application_end_at, created_at, poster_status, thumbnail_url, source_key, summary_short")
          .eq("poster_status", "published")
          .gte("application_end_at", nowIso)
          .lte("application_end_at", sevenDaysLater.toISOString())
          .order("application_end_at", { ascending: true })
          .limit(8);

        if (urgentData && urgentData.length > 0) {
          setUrgentPosters(await attachPosterMeta(urgentData));
        } else {
          setUrgentPosters([]);
        }

        try {
          const summaryRes = await fetch("/api/home/summary", { cache: "no-store" });
          if (!summaryRes.ok) throw new Error("summary request failed");
          setHomeSummary(await summaryRes.json());
        } catch {
          setHomeSummary((prev) => ({
            ...prev,
            activePosters: prev.activePosters,
            dueThisWeek: urgentData?.length ?? 0,
          }));
        }
      } catch (error) {
        console.error("Failed to load home data", error);
        setLoadError("공고 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
      } finally {
        setLoading(false);
      }
    };

    fetchHomeData();
  }, [hideClosedPosters]);

  const isClosed = (poster: any) => {
    if (!poster.application_end_at) return false;
    return new Date(poster.application_end_at).getTime() < Date.now();
  };

  const availablePosters = useMemo(() => {
    return posters.filter((poster) => !hideClosedPosters || !isClosed(poster));
  }, [hideClosedPosters, posters]);

  const feedPosters = useMemo(() => {
    if (activeFeed === "urgent") {
      const urgent = urgentPosters.length > 0 ? urgentPosters : availablePosters;
      return urgent
        .filter((poster) => !poster.application_end_at || new Date(poster.application_end_at).getTime() >= Date.now())
        .sort((a, b) => {
          const aTime = a.application_end_at ? new Date(a.application_end_at).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.application_end_at ? new Date(b.application_end_at).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        })
        .slice(0, 8);
    }

    if (activeFeed === "popular") {
      return [...availablePosters].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)).slice(0, 8);
    }

    return availablePosters.slice(0, 8);
  }, [activeFeed, availablePosters, urgentPosters]);

  const regionLabel =
    userProfile?.regions?.level === "sigungu"
      ? userProfile?.regions?.full_name || userProfile?.regions?.name
      : userProfile?.regions?.name || "전국";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-blue-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] pb-24 text-slate-950">
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-y-2 border-slate-950 py-6"
        >
          <div className="max-w-4xl">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
              <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1">
                <ShieldCheck size={14} />
                정부·지자체·공공기관 공고
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1">
                <Building2 size={14} />
                {regionLabel} 기준 탐색
              </span>
            </div>
            <h1 className="max-w-none whitespace-nowrap text-[clamp(1rem,4.2vw,3rem)] font-black leading-tight tracking-normal text-slate-950">
              나에게 맞는 공공 공고, 흩어져 찾지 마세요
            </h1>
            <p className="mt-4 max-w-none whitespace-nowrap text-[clamp(0.42rem,1.72vw,1rem)] font-medium leading-normal text-slate-600">
              정부·지자체·공공기관의 지원사업, 교육, 행사, 채용·모집 정보를 지역과 관심분야에 맞춰 한곳에서 찾아보세요.
            </p>
          </div>

          <form action="/posters" className="mt-7 flex flex-col gap-3 border border-slate-300 bg-white p-3 sm:flex-row">
            <label className="flex min-h-12 flex-1 items-center gap-3 px-2">
              <Search size={20} className="shrink-0 text-slate-500" />
              <input
                name="q"
                type="search"
                placeholder="지원사업, 교육, 행사, 기관명 검색"
                className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-slate-950 px-5 text-sm font-black text-white transition-colors hover:bg-blue-800"
            >
              공고 찾기
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {serviceCategories.map((category) => (
              <Link
                key={category}
                href={`/posters?q=${encodeURIComponent(categorySearchTerm(category))}`}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700 transition-colors hover:border-blue-500 hover:text-blue-700"
              >
                {category}
              </Link>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-300 pt-4 text-xs font-black text-slate-600">
            <span>오늘 새 공고 {homeSummary.todayNew.toLocaleString()}건</span>
            <span>신청 가능한 공고 {homeSummary.activePosters.toLocaleString()}건</span>
            <span>이번 주 마감 {homeSummary.dueThisWeek.toLocaleString()}건</span>
            {homeSummary.collectionSources > 0 && <span>{homeSummary.collectionSources.toLocaleString()}개 기관 수집 중</span>}
          </div>
        </motion.section>

        {loadError && (
          <div className="mt-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
            {loadError}
          </div>
        )}

        <section className="mt-10">
          <SectionTitle eyebrow="Notice Feed" title="지금 확인해야 할 공고" actionHref="/posters" actionLabel="전체 보기" />

          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {feedTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveFeed(tab.key)}
                  className={`shrink-0 border px-3 py-2 text-xs font-black transition-colors ${
                    activeFeed === tab.key
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-500"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={hideClosedPosters}
              onClick={() => setHideClosedPosters((value) => !value)}
              className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:border-slate-500"
            >
              <Filter size={15} />
              접수 중인 공고만 보기
              <span className={`h-2.5 w-2.5 rounded-full ${hideClosedPosters ? "bg-blue-700" : "bg-slate-300"}`} />
            </button>
          </div>

          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <Link
                key={category}
                href={category === "전체" ? "/posters" : `/posters?q=${encodeURIComponent(categorySearchTerm(category))}`}
                className="shrink-0 border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:border-blue-500 hover:text-blue-700"
              >
                {category}
              </Link>
            ))}
          </div>

          {feedPosters.length > 0 ? (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {feedPosters.map((poster) => (
                <motion.div
                  key={poster.id}
                  variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                >
                  <PosterCard
                    poster={{
                      id: poster.id,
                      title: poster.title,
                      org: poster.source_org_name,
                      deadline: poster.application_end_at,
                      image: poster.thumbnail_url,
                      images: poster.images,
                      sourceUrl: poster.source_key,
                      viewCount: poster.viewCount,
                      linkClickCount: poster.linkClickCount,
                      favoriteCount: poster.favoriteCount,
                      tags: [poster.categoryName, poster.regionName].filter((tag): tag is string => Boolean(tag)),
                    }}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="border border-dashed border-slate-300 bg-white py-16 text-center text-sm font-bold text-slate-500">
              조건에 맞는 진행 중 공고가 없습니다.
            </div>
          )}
        </section>

        <AnimatePresence>
          {urgentPosters.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-12 border border-rose-200 bg-white"
            >
              <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50 px-4 py-3">
                <h2 className="inline-flex items-center gap-2 text-base font-black text-rose-800">
                  <CalendarClock size={18} />
                  이번 주 마감 공고
                </h2>
                <Link href="/posters" className="text-xs font-black text-rose-700 hover:text-rose-900">
                  더 보기
                </Link>
              </div>
              <div className="grid gap-0 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
                {urgentPosters.slice(0, 4).map((poster) => {
                  const daysLeft = Math.ceil((new Date(poster.application_end_at).getTime() - Date.now()) / 86400000);
                  return (
                    <Link
                      key={`urgent-${poster.id}`}
                      href={`/posters/${poster.id}`}
                      className="flex gap-4 p-4 transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex items-center gap-1 text-xs font-black text-rose-700">
                          <Bell size={13} />
                          {daysLeft <= 0 ? "오늘 마감" : `D-${daysLeft}`}
                        </span>
                        <h3 className="mt-2 line-clamp-2 text-sm font-black leading-6 text-slate-950">{poster.title}</h3>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">{poster.source_org_name}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <section className="mt-12">
          <SectionTitle eyebrow="Local Search" title="내 지역 공고를 찾아보세요" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Link href="/posters?region=서울특별시" className="flex items-center justify-between border border-slate-300 bg-white px-4 py-4 text-sm font-black text-slate-900 transition-colors hover:border-blue-500 hover:text-blue-700 lg:col-span-2">
              <span className="inline-flex items-center gap-2">
                <MapPin size={17} />
                서울특별시
              </span>
              <ArrowRight size={15} />
            </Link>
            {regionShortcuts.map((region) => (
              <Link
                key={region}
                href={`/posters?region=${encodeURIComponent(region)}`}
                className="border border-slate-300 bg-white px-4 py-4 text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:text-blue-700"
              >
                {region}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <SectionTitle eyebrow="Categories" title="관심분야별 공고" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {serviceCategories.map((category) => (
              <ServiceLink key={category} href={`/posters?q=${encodeURIComponent(categorySearchTerm(category))}`} icon={<Sparkles size={17} />} title={category} />
            ))}
          </div>
        </section>

        <section id="organizations" className="mt-12 scroll-mt-20">
          <SectionTitle eyebrow="Organizations" title="관심 기관의 새 공고를 놓치지 마세요" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {organizationHighlights.map((org) => (
              <Link
                key={org}
                href={`/posters?q=${encodeURIComponent(org)}`}
                className="border border-slate-300 bg-white p-4 transition-colors hover:border-blue-500"
              >
                <p className="text-sm font-black text-slate-950">{org}</p>
                <p className="mt-2 text-xs font-bold text-slate-500">진행 중 공고 보기</p>
              </Link>
            ))}
          </div>
        </section>

        <section id="about" className="mt-12 scroll-mt-20 border-y border-slate-300 py-8">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="text-xs font-black uppercase text-blue-700">About PosterLink</p>
              <h2 className="mt-2 text-2xl font-black leading-tight text-slate-950">당신에게 필요한 공공의 기회를 연결합니다</h2>
            </div>
            <div className="space-y-4 text-sm font-medium leading-7 text-slate-600">
              <p>
                PosterLink는 정부, 지자체, 공공기관과 공익기관에 흩어진 지원사업·교육·행사·채용·모집 정보를 한곳에 모읍니다.
              </p>
              <p>
                복잡한 공고문에서 신청기간, 지원대상, 주요내용과 신청방법을 정리해 필요한 정보를 더 빠르게 확인할 수 있도록 돕습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 border border-blue-200 bg-blue-50 p-5 text-blue-950">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black">빠진 공고나 기관을 알고 계신가요?</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-blue-900">
                PosterLink에 아직 등록되지 않은 공고와 기관을 알려주세요. 확인 후 더 많은 사람이 볼 수 있도록 등록하겠습니다.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/posters/request" className="inline-flex items-center justify-center gap-2 bg-blue-700 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-blue-800">
                <PlusCircle size={17} />
                공고 제보하기
              </Link>
              <Link href="/posters/request?type=organization" className="inline-flex items-center justify-center gap-2 border border-blue-300 bg-white px-4 py-3 text-sm font-black text-blue-900 transition-colors hover:border-blue-600">
                기관 등록 요청
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  actionHref,
  actionLabel,
}: {
  eyebrow: string;
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between border-b border-slate-300 pb-3">
      <div>
        <p className="text-xs font-black uppercase text-blue-700">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2>
      </div>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="hidden items-center gap-1 text-xs font-black text-slate-500 hover:text-blue-700 sm:inline-flex">
          {actionLabel}
          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

function ServiceLink({ href, icon, title }: { href: string; icon: ReactNode; title: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between border border-slate-300 bg-white px-4 py-4 text-sm font-black text-slate-800 transition-colors hover:border-blue-500 hover:text-blue-700"
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {title}
      </span>
      <ArrowRight size={16} />
    </Link>
  );
}
