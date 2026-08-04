import Link from "next/link";
import { getDDay, isDeadlineSoon } from "@posterlink/lib";
import { Building2, CalendarClock, Eye, Heart, MapPin } from "lucide-react";
import { resolvePosterImageGallery } from "../../lib/posterImage";
import { PosterImageCarousel } from "./PosterImageCarousel";

interface PosterCardProps {
  poster: {
    id: string;
    title: string;
    org?: string;
    deadline?: string;
    deadlineType?: string | null;
    tags?: string[];
    image?: string;
    images?: string[];
    sourceUrl?: string;
    viewCount?: number;
    linkClickCount?: number;
    favoriteCount?: number;
    similarityScore?: number | null;
  };
}

export function PosterCard({ poster }: PosterCardProps) {
  const dDay = getDDay(poster.deadline);
  const soon = isDeadlineSoon(poster.deadline);
  const closed = dDay === "마감";
  const tags = poster.tags ?? [];
  const [category, region] = tags;
  const imageUrls = resolvePosterImageGallery(poster.images ?? [], poster.image, poster.sourceUrl);
  const showViewCount = (poster.viewCount ?? 0) >= 100;
  const showFavoriteCount = (poster.favoriteCount ?? 0) >= 10;
  // 찜/조회 이력 기반 의미 유사도 — 이력이 없거나 임베딩이 없으면 null이라 표시 안 함.
  // 너무 낮은 유사도는 "AI가 이 정도로 추천했다"는 신뢰를 깎으므로 일정 이상만 배지로 노출.
  const fitPercent = typeof poster.similarityScore === "number" ? Math.round(poster.similarityScore * 100) : null;
  const showFitBadge = fitPercent !== null && fitPercent >= 30;

  return (
    <Link href={`/posters/${poster.id}`} className="group block h-full">
      <article
        className={`flex h-full flex-col border bg-white transition-colors group-hover:border-blue-500 ${
          closed ? "border-slate-300" : "border-slate-200"
        }`}
      >
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-3 flex flex-wrap items-center gap-1">
            {(category ? [category, region].filter(Boolean) : tags.slice(0, 2)).map((tag) => (
              <span key={tag} className="border border-slate-200 px-2 py-1 text-[10px] font-black text-slate-600">
                {tag}
              </span>
            ))}
            {showFitBadge && (
              <span className="border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">
                맞춤 {fitPercent}%
              </span>
            )}
          </div>

          <h3
            className={`line-clamp-3 min-h-[4.5rem] text-base font-black leading-6 transition-colors ${
              closed ? "text-slate-500 line-through decoration-slate-400" : "text-slate-950 group-hover:text-blue-700"
            }`}
          >
            {poster.title}
          </h3>

          <div className="mt-4 space-y-2 text-xs font-bold text-slate-500">
            <p className={`inline-flex items-center gap-1.5 font-black ${soon && !closed ? "text-rose-700" : "text-slate-700"}`}>
              <CalendarClock size={14} />
              {deadlineLabel(poster.deadline, poster.deadlineType, dDay)}
            </p>
            {region && (
              <p className="flex items-center gap-1.5">
                <MapPin size={14} />
                {region}
              </p>
            )}
            {poster.org && (
              <p className="flex items-center gap-1.5">
                <Building2 size={14} />
                <span className="truncate">{poster.org}</span>
              </p>
            )}
          </div>
        </div>

        <div className="mx-4 aspect-[4/3] overflow-hidden border border-slate-200 bg-slate-50">
          <PosterImageCarousel
            images={imageUrls}
            title={poster.title}
            org={poster.org}
            fallbackClassName="p-3"
            imgClassName={`h-full w-full object-contain bg-white transition-transform duration-500 group-hover:scale-[1.03] ${
              closed ? "grayscale opacity-55" : ""
            }`}
            iconSize={20}
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <span className="text-xs font-black text-blue-700">상세보기</span>
          {(showViewCount || showFavoriteCount) && (
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-500">
              {showViewCount && (
                <span className="inline-flex items-center gap-1">
                  <Eye size={12} />
                  {compactNumber(poster.viewCount)}
                </span>
              )}
              {showFavoriteCount && (
                <span className="inline-flex items-center gap-1">
                  <Heart size={12} />
                  {compactNumber(poster.favoriteCount)}
                </span>
              )}
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

function deadlineLabel(deadline: string | undefined, deadlineType: string | null | undefined, dDay: string) {
  if (!deadline) {
    if (deadlineType === "ongoing") return "상시 모집";
    if (deadlineType === "until_exhausted") return "소진 시 마감";
    if (deadlineType === "scheduled") return "모집 예정";
    return "일정 확인 필요";
  }
  if (dDay === "마감") return "신청 마감";
  if (dDay === "D-Day") return "오늘 마감";

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return "기관 공고 확인";

  const formatted = formatKoreanDate(date);

  return `${formatted}까지 · ${dDay}`;
}

function formatKoreanDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function compactNumber(value?: number) {
  return (value ?? 0).toLocaleString();
}
