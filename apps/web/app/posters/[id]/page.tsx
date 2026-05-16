"use client";
import toast from "react-hot-toast";

import { useState, useEffect } from "react";
import { Header } from "../../components/Header";
import { BottomNav } from "../../components/BottomNav";
import { CommentSection } from "../../components/CommentSection";
import { PosterImageCarousel } from "../../components/PosterImageCarousel";
import { notFound } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { fetchCategoryRegionNames, fetchPosterImages } from "../../lib/posterHelpers";
import { fetchPosterMetricCounts, logPosterView } from "../../lib/posterMetrics";
import { resolvePosterImageUrl } from "../../../lib/posterImage";
import { Footer } from "../../components/Footer";
import { ChevronLeft, ChevronRight, Eye, Heart, Link2, MousePointerClick, Share2, X } from "lucide-react";

export default function PosterDetailPage({ params }: { params: { id: string } }) {
  const [poster, setPoster] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [linkClickCount, setLinkClickCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [expandedImageIndex, setExpandedImageIndex] = useState(0);

  useEffect(() => {
    const fetchPosterDetail = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("posters")
          .select("*")
          .eq("id", params.id)
          .single();

        if (error || !data) {
          setPoster(null);
          return;
        }

        const [metaMap, imageMap] = await Promise.all([
          fetchCategoryRegionNames([params.id]),
          fetchPosterImages([params.id]),
        ]);
        setPoster({ ...data, ...metaMap[params.id], images: imageMap[params.id] ?? [] });

        const metricCounts = await fetchPosterMetricCounts([params.id]);
        setViewCount(metricCounts.viewCounts[params.id] ?? 0);
        setLinkClickCount(metricCounts.linkClickCounts[params.id] ?? 0);
        setFavoriteCount(metricCounts.favoriteCounts[params.id] ?? 0);

        const logged = await logPosterView(params.id);
        if (logged) {
          setViewCount((count) => count + 1);
        }

        const { data: linkData } = await supabase
          .from("poster_links")
          .select("*")
          .eq("poster_id", params.id);

        if (linkData) setLinks(linkData);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: favData } = await supabase
            .from("favorites")
            .select("poster_id")
            .eq("user_id", user.id)
            .eq("poster_id", params.id)
            .maybeSingle();
          setIsFavorited(!!favData);
        }
      } catch (err) {
        console.error("Error fetching detail:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosterDetail();
  }, [params.id]);

  const toggleFavorite = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("로그인이 필요합니다.");
      return;
    }

    if (isFavorited) {
      const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("poster_id", params.id);
      if (!error) {
        setIsFavorited(false);
        setFavoriteCount((count) => Math.max(0, count - 1));
      }
    } else {
      const { error } = await supabase.from("favorites").insert({ user_id: user.id, poster_id: params.id });
      if (!error) {
        setIsFavorited(true);
        setFavoriteCount((count) => count + 1);
      }
    }
  };

  const logOfficialLinkClick = (link: any) => {
    if (!link?.url || link.url === "#") return;

    const body = JSON.stringify({
      poster_id: params.id,
      link_id: link.id ?? null,
      link_type: link.link_type ?? null,
      link_url: link.url,
      referrer_path: window.location.pathname,
    });

    try {
      setLinkClickCount((count) => count + 1);
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        const queued = navigator.sendBeacon("/api/poster-link-clicks", blob);
        if (queued) return;
      }

      void fetch("/api/poster-link-clicks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    } catch (error) {
      console.warn("Failed to queue poster link click log:", error);
    }
  };

  if (loading) {
    return <div className="p-10 text-center animate-pulse">상세 정보를 불러오는 중...</div>;
  }

  if (!poster) {
    notFound();
  }

  const daysLeft = poster.application_end_at
    ? Math.ceil((new Date(poster.application_end_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const imageUrl = resolvePosterImageUrl(poster.thumbnail_url, poster.source_key);
  const imageUrls = [
    ...(poster.images ?? []),
    imageUrl,
  ]
    .map((url) => resolvePosterImageUrl(url, poster.source_key))
    .filter((url, index, arr): url is string => Boolean(url) && arr.indexOf(url) === index);
  const primaryLink = links.find((link) => link.is_primary) || links[0] || null;
  const statusLabel = daysLeft === null ? "상시" : daysLeft < 0 ? "마감됨" : daysLeft === 0 ? "오늘 마감" : "신청 가능";
  const statusClass = daysLeft === null
    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
    : daysLeft < 0
      ? "bg-slate-100 text-slate-500 border-slate-200"
      : daysLeft <= 3
        ? "bg-rose-50 text-rose-600 border-rose-100"
        : "bg-emerald-50 text-emerald-700 border-emerald-100";
  const moveExpandedImage = (offset: number) => {
    setExpandedImageIndex((index) => (index + offset + imageUrls.length) % imageUrls.length);
  };

  return (
    <div className="min-h-screen bg-white pb-24 md:pb-10">
      <Header />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <div
          className="aspect-[3/4] w-full rounded-2xl overflow-hidden border shadow-lg mb-6 bg-gray-100 flex items-center justify-center relative"
          aria-label="포스터 이미지 크게 보기"
        >
          <PosterImageCarousel
            images={imageUrls}
            title={poster.title}
            org={poster.source_org_name}
            fallbackClassName="p-8"
            imgClassName="h-full w-full object-contain bg-gray-50"
            showControls
            iconSize={34}
            onImageClick={(_, index) => {
              setExpandedImageIndex(index);
              setImageExpanded(true);
            }}
          />
        </div>

        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass}`}>
              {statusLabel}
            </span>
            {daysLeft !== null && daysLeft >= 0 && (
              <span className={`rounded-full px-3 py-1 text-xs font-black text-white ${daysLeft <= 3 ? "bg-rose-500" : "bg-blue-600"}`}>
                {daysLeft === 0 ? "D-Day" : `D-${daysLeft}`}
              </span>
            )}
            <span className="text-sm text-gray-500 font-bold">{poster.source_org_name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-4">{poster.title}</h1>
          <div className="flex flex-wrap gap-2">
            {poster.categoryName && (
              <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-black rounded-full">
                #{poster.categoryName}
              </span>
            )}
            {poster.regionName && (
              <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-black rounded-full">
                #{poster.regionName}
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-600">
              <Eye size={14} />
              조회 {viewCount.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600">
              <Heart size={14} fill="currentColor" />
              찜 {favoriteCount.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-600">
              <MousePointerClick size={14} />
              공식 링크 클릭 {linkClickCount.toLocaleString()}
            </span>
          </div>

          <a
            href={primaryLink?.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              if (!primaryLink) {
                event.preventDefault();
                toast.error("등록된 공식 링크가 없습니다.");
                return;
              }
              void logOfficialLinkClick(primaryLink);
            }}
            className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-lg shadow-blue-100 transition-colors hover:bg-blue-700"
          >
            공식 페이지에서 신청/확인하기
          </a>
        </div>

        <section className="p-6 bg-gray-50 rounded-3xl mb-8 border border-gray-100">
          <h2 className="text-sm font-black text-blue-600 mb-5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full" /> 핵심 모집 요약
          </h2>
          <ul className="space-y-4 text-sm text-gray-700 font-medium">
            <li className="flex gap-4">
              <span className="text-gray-400 w-16 flex-shrink-0">신청기간</span>
              <span className="text-gray-900 font-bold">
                {poster.application_end_at ? new Date(poster.application_end_at).toLocaleDateString() : "상시"} 까지
              </span>
            </li>
            <li className="flex gap-4">
              <span className="text-gray-400 w-16 flex-shrink-0">대상지역</span>
              <span className="text-gray-900 font-bold">{poster.regionName || "전국"}</span>
            </li>
            {poster.summary_short && (
              <li className="flex gap-4">
                <span className="text-gray-400 w-16 flex-shrink-0">주요내용</span>
                <span className="text-gray-900 font-bold leading-relaxed">{poster.summary_short}</span>
              </li>
            )}
          </ul>
        </section>

        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl mb-10">
          <p className="text-[11px] text-blue-600 font-bold text-center leading-relaxed">
            정확한 신청 자격 및 절차는 아래 버튼을 눌러<br />공식 공고문을 반드시 확인해 주세요.
          </p>
        </div>

        {links.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-bold mb-4">참고 링크</h2>
            <div className="space-y-2">
              {links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void logOfficialLinkClick(link)}
                  className="block p-4 border rounded-2xl hover:bg-gray-50 transition-colors text-sm font-bold text-gray-700 flex items-center justify-between"
                >
                  {link.title || link.link_type}
                  <span className="text-gray-300">→</span>
                </a>
              ))}
            </div>
          </section>
        )}

        <CommentSection posterId={params.id} />

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t md:relative md:bg-transparent md:border-none md:p-0">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button
              onClick={toggleFavorite}
              className={`w-14 h-14 flex items-center justify-center border rounded-2xl transition-all shadow-sm ${
                isFavorited ? "bg-rose-50 border-rose-200" : "bg-white border-gray-100"
              }`}
            >
              <Heart size={20} className={isFavorited ? "text-rose-500" : "text-gray-500"} fill={isFavorited ? "currentColor" : "none"} />
            </button>

            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success("링크가 복사되었습니다.");
              }}
              className="w-14 h-14 flex items-center justify-center border border-gray-100 bg-white rounded-2xl transition-all shadow-sm hover:bg-gray-50"
              title="링크 복사"
            >
              <Link2 size={20} className="text-gray-500" />
            </button>

            <button
              onClick={async () => {
                if (navigator.share) {
                  await navigator.share({ title: poster.title, text: poster.summary_short ?? "", url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("링크가 복사되었습니다.");
                }
              }}
              className="w-14 h-14 flex items-center justify-center border border-gray-100 bg-white rounded-2xl transition-all shadow-sm hover:bg-gray-50"
              title="공유"
            >
              <Share2 size={20} className="text-gray-500" />
            </button>

            <a
              href={primaryLink?.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                if (!primaryLink) {
                  event.preventDefault();
                  toast.error("등록된 공식 링크가 없습니다.");
                  return;
                }

                void logOfficialLinkClick(primaryLink);
              }}
              className="flex-1 h-14 flex items-center justify-center bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-200"
            >
              공식 안내페이지 바로가기
            </a>
          </div>
        </div>
      </main>
      {imageExpanded && imageUrls.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="포스터 이미지 크게 보기"
          onClick={() => setImageExpanded(false)}
        >
          <button
            type="button"
            onClick={() => setImageExpanded(false)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
            aria-label="닫기"
          >
            <X size={22} />
          </button>
          {imageUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  moveExpandedImage(-1);
                }}
                className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                aria-label="이전 이미지"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  moveExpandedImage(1);
                }}
                className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                aria-label="다음 이미지"
              >
                <ChevronRight size={24} />
              </button>
              <div className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white backdrop-blur">
                {expandedImageIndex + 1}/{imageUrls.length}
              </div>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrls[expandedImageIndex] ?? imageUrls[0]}
            alt={poster.title}
            className="max-h-[88vh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
          {imageUrls.length > 1 && (
            <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-white/10 px-3 py-2 backdrop-blur">
              {imageUrls.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedImageIndex(index);
                  }}
                  className={`h-2 rounded-full transition-all ${index === expandedImageIndex ? "w-6 bg-white" : "w-2 bg-white/40"}`}
                  aria-label={`${index + 1}번째 이미지 보기`}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <Footer />
      <BottomNav />
    </div>
  );
}
