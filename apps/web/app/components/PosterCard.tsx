import Link from "next/link";
import { getDDay, isDeadlineSoon } from "@posterlink/lib";
import { Eye, Heart, MousePointerClick } from "lucide-react";
import { resolvePosterImageUrl } from "../../lib/posterImage";
import { PosterImageCarousel } from "./PosterImageCarousel";

interface PosterCardProps {
  poster: {
    id: string;
    title: string;
    org?: string;
    deadline?: string;
    tags?: string[];
    image?: string;
    images?: string[];
    sourceUrl?: string;
    viewCount?: number;
    linkClickCount?: number;
    favoriteCount?: number;
  };
}

export function PosterCard({ poster }: PosterCardProps) {
  const dDay = getDDay(poster.deadline);
  const soon = isDeadlineSoon(poster.deadline);
  const closed = dDay === "마감";
  const statusLabel = closed ? "마감됨" : dDay === "D-Day" ? "오늘 마감" : poster.deadline ? "신청 가능" : "상시";
  const statusClass = closed
    ? "bg-slate-700/90 text-white"
    : dDay === "D-Day" || soon
      ? "bg-rose-500/90 text-white"
      : "bg-emerald-600/90 text-white";
  const imageUrl = resolvePosterImageUrl(poster.image, poster.sourceUrl);
  const imageUrls = [...(poster.images ?? []), imageUrl]
    .map((url) => resolvePosterImageUrl(url, poster.sourceUrl))
    .filter((url, index, arr): url is string => Boolean(url) && arr.indexOf(url) === index);

  return (
    <Link href={`/posters/${poster.id}`} className="group block">
      <div className={`relative aspect-[3/4] overflow-hidden rounded-2xl border shadow-sm transition-all group-hover:shadow-md group-hover:-translate-y-1 ${
        closed
          ? "border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
          : "border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-800"
      }`}>
        <PosterImageCarousel
          images={imageUrls}
          title={poster.title}
          org={poster.org}
          fallbackClassName="p-4"
          imgClassName={`h-full w-full object-contain bg-gray-50 transition-transform duration-500 group-hover:scale-105 ${
            closed ? "grayscale opacity-55" : ""
          }`}
        />

        {closed && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/25 backdrop-grayscale">
            <span className="rounded-2xl bg-white/90 px-4 py-2 text-xs font-black text-slate-600 shadow-sm">
              마감된 공고
            </span>
          </div>
        )}

        <div className={`absolute left-3 top-3 rounded-lg px-2.5 py-1 shadow-sm backdrop-blur-md transition-colors ${statusClass}`}>
          <span className="text-[10px] font-black">{statusLabel}</span>
        </div>

        {dDay !== "마감" && dDay !== "D-Day" && poster.deadline && (
          <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1 text-[10px] font-black text-gray-700 shadow-sm backdrop-blur-md">
            {dDay}
          </div>
        )}

        {!closed && dDay === "D-Day" && (
          <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1 text-[10px] font-black text-rose-600 shadow-sm backdrop-blur-md">
            오늘까지
          </div>
        )}

        {!closed && !poster.deadline && (
          <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1 text-[10px] font-black text-emerald-700 shadow-sm backdrop-blur-md">
            기간 제한 없음
          </div>
        )}

        <div className="absolute bottom-3 right-3 rounded-lg bg-black/45 px-2.5 py-1 text-[10px] font-black text-white opacity-0 shadow-sm backdrop-blur-md transition-opacity group-hover:opacity-100">
          자세히 보기
        </div>
      </div>

      <div className="mt-3 px-1">
        <p className={`mb-1 truncate text-[10px] font-bold ${closed ? "text-slate-500" : "text-gray-400 dark:text-slate-500"}`}>{poster.org}</p>
        <h4 className={`h-[2.5rem] text-sm font-bold leading-snug line-clamp-2 transition-colors ${
          closed
            ? "text-slate-500 line-through decoration-slate-500/50"
            : "text-[color:var(--foreground)] group-hover:text-blue-600 dark:group-hover:text-blue-400"
        }`}>
          {poster.title}
        </h4>
        <div className="mt-2 flex flex-wrap gap-1">
          {(poster.tags ?? []).map((tag) => (
            <span key={tag} className="text-[9px] font-black text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-md transition-colors">
              #{tag}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-black">
          <span className="inline-flex items-center gap-1 text-sky-500 dark:text-sky-400">
            <Eye size={12} />
            조회 {(poster.viewCount ?? 0).toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1 text-rose-500 dark:text-rose-400">
            <Heart size={12} fill="currentColor" />
            찜 {(poster.favoriteCount ?? 0).toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-400">
            <MousePointerClick size={12} />
            클릭 {(poster.linkClickCount ?? 0).toLocaleString()}
          </span>
        </div>
      </div>
    </Link>
  );
}
