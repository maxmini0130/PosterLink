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
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100 border border-gray-100 shadow-sm transition-all group-hover:shadow-md group-hover:-translate-y-1">
        {/* 포스터 이미지 배경 (실제 이미지가 없을 때의 플레이스홀더) */}
        <div className="h-full w-full bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
           <span className="text-blue-200 font-black text-2xl tracking-tighter opacity-50">POSTER</span>
        </div>
        
        {/* D-Day 배지 */}
        <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg shadow-sm backdrop-blur-md ${
          dDay.includes('D-') || dDay === 'D-Day' 
          ? 'bg-blue-600/90 text-white' 
          : 'bg-gray-400/90 text-white'
        }`}>
          <span className="text-[10px] font-black">{dDay}</span>
        </div>
      </div>

      <div className="mt-3 px-1">
        <p className="text-[10px] text-gray-400 font-bold mb-1 truncate">{poster.org}</p>
        <h4 className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors h-[2.5rem]">
          {poster.title}
        </h4>
        <div className="mt-2 flex flex-wrap gap-1">
          {poster.tags.map((tag) => (
            <span key={tag} className="text-[9px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
