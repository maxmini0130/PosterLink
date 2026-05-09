import Link from "next/link";
import { getDDay, isDeadlineSoon } from "@posterlink/lib";
import { Eye, Heart, MousePointerClick } from "lucide-react";
import { resolvePosterImageUrl } from "../../lib/posterImage";
import { PosterImageFallback } from "./PosterImageFallback";

interface PosterCardProps {
  poster: {
    id: string;
    title: string;
    org?: string;
    deadline?: string;
    tags?: string[];
    image?: string;
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
  const imageUrl = resolvePosterImageUrl(poster.image, poster.sourceUrl);

  return (
    <Link href={`/posters/${poster.id}`} className="group block">
      <div className={`relative aspect-[3/4] overflow-hidden rounded-2xl border shadow-sm transition-all group-hover:shadow-md group-hover:-translate-y-1 ${
        closed
          ? "border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
          : "border-gray-100 bg-gray-100 dark:border-slate-700 dark:bg-slate-800"
      }`}>
        <PosterImageFallback
          src={imageUrl}
          alt={poster.title}
          title={poster.title}
          org={poster.org}
          fallbackClassName="p-4"
          imgClassName={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
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
        
        {/* D-Day 배지 */}
        <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg shadow-sm backdrop-blur-md transition-colors ${
          soon ? 'bg-rose-500/90 text-white' :
          dDay !== '마감' ? 'bg-blue-600/90 dark:bg-blue-500/90 text-white'
          : 'bg-slate-700/90 dark:bg-slate-600/90 text-white'
        }`}>
          <span className="text-[10px] font-black">{dDay}</span>
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
