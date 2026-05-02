import Link from "next/link";
import Image from "next/image";
import { getDDay, isDeadlineSoon } from "@posterlink/lib";
import { MousePointerClick } from "lucide-react";

interface PosterCardProps {
  poster: {
    id: string;
    title: string;
    org?: string;
    deadline?: string;
    tags?: string[];
    image?: string;
    linkClickCount?: number;
  };
}

export function PosterCard({ poster }: PosterCardProps) {
  const dDay = getDDay(poster.deadline);
  const soon = isDeadlineSoon(poster.deadline);

  return (
    <Link href={`/posters/${poster.id}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm transition-all group-hover:shadow-md group-hover:-translate-y-1">
        {poster.image ? (
          <Image src={poster.image} alt={poster.title} fill sizes="(max-width: 768px) 50vw, 200px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
            <span className="text-blue-200 dark:text-slate-600 font-black text-2xl tracking-tighter opacity-50 uppercase">POSTER</span>
          </div>
        )}
        
        {/* D-Day 배지 */}
        <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg shadow-sm backdrop-blur-md transition-colors ${
          soon ? 'bg-rose-500/90 text-white' :
          dDay !== '마감' ? 'bg-blue-600/90 dark:bg-blue-500/90 text-white'
          : 'bg-gray-400/90 dark:bg-slate-600/90 text-white'
        }`}>
          <span className="text-[10px] font-black">{dDay}</span>
        </div>
      </div>

      <div className="mt-3 px-1">
        <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold mb-1 truncate">{poster.org}</p>
        <h4 className="text-sm font-bold text-gray-900 dark:text-slate-100 line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors h-[2.5rem]">
          {poster.title}
        </h4>
        <div className="mt-2 flex flex-wrap gap-1">
          {(poster.tags ?? []).map((tag) => (
            <span key={tag} className="text-[9px] font-black text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-md transition-colors">
              #{tag}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] font-black text-amber-500 dark:text-amber-400">
          <MousePointerClick size={12} />
          <span>공식 링크 클릭 {(poster.linkClickCount ?? 0).toLocaleString()}</span>
        </div>
      </div>
    </Link>
  );
}
