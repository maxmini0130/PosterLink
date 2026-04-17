import Link from "next/link";

interface PosterCardProps {
  poster: {
    id: string;
    title: string;
    org: string;
    deadline: string;
    tags: string[];
    image?: string;
  };
}

export function PosterCard({ poster }: PosterCardProps) {
  // 마감일 D-Day 계산
  const getDDay = (deadline: string) => {
    const diff = new Date(deadline).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "D-Day";
    if (days < 0) return "마감";
    return `D-${days}`;
  };

  const dDay = poster.deadline ? getDDay(poster.deadline) : "상시";

  return (
    <Link href={`/posters/${poster.id}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm transition-all group-hover:shadow-md group-hover:-translate-y-1">
        {poster.image ? (
          <img src={poster.image} alt={poster.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
            <span className="text-blue-200 dark:text-slate-600 font-black text-2xl tracking-tighter opacity-50 uppercase">POSTER</span>
          </div>
        )}
        
        {/* D-Day 배지 */}
        <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg shadow-sm backdrop-blur-md transition-colors ${
          dDay.includes('D-') || dDay === 'D-Day' 
          ? 'bg-blue-600/90 dark:bg-blue-500/90 text-white' 
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
          {poster.tags.map((tag) => (
            <span key={tag} className="text-[9px] font-black text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-md transition-colors">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
