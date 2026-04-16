import Link from "next/link";
import { Poster } from "../lib/dummy";

interface PosterCardProps {
  poster: Poster;
}

export function PosterCard({ poster }: PosterCardProps) {
  const daysLeft = Math.ceil((new Date(poster.application_end_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  return (
    <Link href={`/posters/${poster.id}`} className="block group">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border bg-gray-100 shadow-sm transition-shadow group-hover:shadow-md">
        <img src={poster.thumbnail_url} alt={poster.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        <div className="absolute top-2 left-2 px-2 py-1 bg-primary text-white text-[10px] font-bold rounded uppercase">
          D-{daysLeft > 0 ? daysLeft : "Day"}
        </div>
      </div>
      <div className="mt-2">
        <p className="text-[10px] text-gray-500 font-medium mb-1 truncate">{poster.source_org_name}</p>
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{poster.title}</h3>
        <div className="mt-1 flex flex-wrap gap-1">
          {poster.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] bg-secondary/30 text-primary px-1.5 py-0.5 rounded-md">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
