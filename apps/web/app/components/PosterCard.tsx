import Link from "next/link";
import { getDDay, isDeadlineSoon } from "@posterlink/lib";
import { Building2, CalendarClock, Eye, Heart, MapPin, MousePointerClick } from "lucide-react";
import { resolvePosterImageGallery } from "../../lib/posterImage";
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
  const tags = poster.tags ?? [];
  const [category, region] = tags;
  const imageUrls = resolvePosterImageGallery(poster.images ?? [], poster.image, poster.sourceUrl);

  return (
    <Link href={`/posters/${poster.id}`} className="group block h-full">
      <article
        className={`flex h-full flex-col border bg-white transition-colors group-hover:border-blue-500 ${
          closed ? "border-slate-300" : "border-slate-200"
        }`}
      >
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-3 flex flex-wrap gap-1">
            {(category ? [category, region].filter(Boolean) : tags.slice(0, 2)).map((tag) => (
              <span key={tag} className="border border-slate-200 px-2 py-1 text-[10px] font-black text-slate-600">
                {tag}
              </span>
            ))}
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
              {deadlineLabel(poster.deadline, dDay)}
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
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Eye size={12} />
              {compactNumber(poster.viewCount)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart size={12} />
              {compactNumber(poster.favoriteCount)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MousePointerClick size={12} />
              {compactNumber(poster.linkClickCount)}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function deadlineLabel(deadline: string | undefined, dDay: string) {
  if (!deadline) return "상시 또는 기관 공지 확인";
  if (dDay === "마감") return "신청 마감";
  if (dDay === "D-Day") return "오늘 마감";

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return dDay;

  const formatted = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(date);

  return `신청 마감 ${formatted} · ${dDay}`;
}

function compactNumber(value?: number) {
  return (value ?? 0).toLocaleString();
}
