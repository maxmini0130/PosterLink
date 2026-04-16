import Link from "next/link";

interface PosterCardProps {
  poster: {
    id: string;
    title: string;
    org: string;
    deadline: string;
    tags: string[];
  };
}

export function PosterCard({ poster }: PosterCardProps) {
  return (
    <Link href={`/posters/${poster.id}`} className="group">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100 border border-gray-100 shadow-sm transition-shadow group-hover:shadow-md">
        {/* Placeholder for actual poster image */}
        <div className="h-full w-full bg-gradient-to-br from-blue-50 to-blue-100" />
        <div className="absolute top-3 left-3 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm">
          <span className="text-[10px] font-bold text-blue-600">D-12</span>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[10px] text-gray-400 font-medium mb-1">{poster.org}</p>
        <h4 className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors">
          {poster.title}
        </h4>
        <div className="mt-2 flex gap-1">
          {poster.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[9px] font-bold text-gray-400">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
