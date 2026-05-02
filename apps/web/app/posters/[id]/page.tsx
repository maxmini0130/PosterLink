"use client";
import toast from "react-hot-toast";

import { useState, useEffect } from "react";
import { Header } from "../../components/Header";
import { BottomNav } from "../../components/BottomNav";
import { CommentSection } from "../../components/CommentSection";
import { notFound } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import { fetchCategoryRegionNames } from "../../lib/posterHelpers";
import { Footer } from "../../components/Footer";
import { Link2, Share2 } from "lucide-react";

export default function PosterDetailPage({ params }: { params: { id: string } }) {
  const [poster, setPoster] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosterDetail = async () => {
      setLoading(true);
      try {
        // 1. 포스터 상세 정보 가져오기 (카테고리, 지역 포함)
        const { data, error } = await supabase
          .from("posters")
          .select("*")
          .eq("id", params.id)
          .single();

        if (error || !data) {
          setPoster(null);
          return;
        }

        const metaMap = await fetchCategoryRegionNames([params.id]);
        setPoster({ ...data, ...metaMap[params.id] });

        // 2. 관련 링크 가져오기
        const { data: linkData } = await supabase
          .from("poster_links")
          .select("*")
          .eq("poster_id", params.id);
        
        if (linkData) setLinks(linkData);

        // 3. 찜 상태 확인
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
      if (!error) setIsFavorited(false);
    } else {
      const { error } = await supabase.from("favorites").insert({ user_id: user.id, poster_id: params.id });
      if (!error) setIsFavorited(true);
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
    return <div className="p-10 text-center animate-pulse">상세 정보 불러오는 중...</div>;
  }

  if (!poster) {
    notFound();
  }

  const daysLeft = poster.application_end_at
    ? Math.ceil((new Date(poster.application_end_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // 이미지 URL 구성 (Supabase Storage 경로 활용)
  const imageUrl = poster.thumbnail_url ?? null;
  const primaryLink = links.find((link) => link.is_primary) || links[0] || null;

  return (
    <div className="min-h-screen bg-white pb-24 md:pb-10">
      <Header />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        {/* 포스터 이미지 */}
        <div className="aspect-[3/4] rounded-2xl overflow-hidden border shadow-lg mb-6 bg-gray-100 flex items-center justify-center relative">
          {imageUrl ? (
            <Image src={imageUrl} alt={poster.title} fill sizes="(max-width: 672px) 100vw, 672px" className="object-cover" />
          ) : (
            <span className="text-gray-300 font-bold">이미지가 없습니다</span>
          )}
        </div>

        {/* 상단 타이틀 영역 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            {daysLeft !== null && (
              <span className={`px-2 py-0.5 text-[10px] font-black rounded text-white ${daysLeft <= 3 ? 'bg-rose-500' : 'bg-blue-600'}`}>
                {daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? 'D-Day' : '마감'}
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
        </div>

        {/* 핵심 요약 정보 */}
        <section className="p-6 bg-gray-50 rounded-3xl mb-8 border border-gray-100">
          <h2 className="text-sm font-black text-blue-600 mb-5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full" /> 📍 핵심 요약
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

        {/* 안내 문구 */}
        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl mb-10">
          <p className="text-[11px] text-blue-600 font-bold text-center leading-relaxed">
            정확한 신청 자격 및 절차는 아래 버튼을 눌러<br />공식 공고문을 반드시 확인해 주세요.
          </p>
        </div>

        {/* 관련 링크 섹션 (있을 경우) */}
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

        {/* 댓글 섹션 */}
        <CommentSection posterId={params.id} />

        {/* 하단 고정 액션바 (모바일) */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t md:relative md:bg-transparent md:border-none md:p-0">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button
              onClick={toggleFavorite}
              className={`w-14 h-14 flex items-center justify-center border rounded-2xl transition-all shadow-sm ${
                isFavorited ? 'bg-rose-50 border-rose-200' : 'bg-white border-gray-100'
              }`}
            >
               <span className="text-xl">{isFavorited ? '❤️' : '🤍'}</span>
            </button>

            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success("링크가 복사되었습니다!");
              }}
              className="w-14 h-14 flex items-center justify-center border border-gray-100 bg-white rounded-2xl transition-all shadow-sm hover:bg-gray-50"
              title="링크 복사"
            >
              <Link2 size={20} className="text-gray-500" />
            </button>

            <button
              onClick={async () => {
                if (navigator.share) {
                  await navigator.share({ title: poster.title, text: poster.summary_short ?? '', url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("링크가 복사되었습니다!");
                }
              }}
              className="w-14 h-14 flex items-center justify-center border border-gray-100 bg-white rounded-2xl transition-all shadow-sm hover:bg-gray-50"
              title="공유"
            >
              <Share2 size={20} className="text-gray-500" />
            </button>

            {/* 공식 링크 중 하나를 메인 버튼으로 사용 */}
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
              공식 홈페이지 바로가기
            </a>
          </div>
        </div>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
