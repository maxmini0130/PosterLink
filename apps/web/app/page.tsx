import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { PosterCard } from "./components/PosterCard";

export default function Home() {
  // Mock posters for initial UI
  const mockPosters = [
    { id: '1', title: '2026 청년 어학시험 응시료 지원', org: '서울특별시', deadline: '2026-04-30', tags: ['지원금', '청년'] },
    { id: '2', title: '소상공인 디지털 전환 교육', org: '중소벤처기업부', deadline: '2026-04-20', tags: ['교육', '소상공인'] },
    { id: '3', title: '시니어 IT 활용 교육 과정', org: '경기도', deadline: '2026-05-15', tags: ['교육', '시니어'] },
    { id: '4', title: '청년 전용 버팀목 전세자금대출', org: 'HUG', deadline: '2026-12-31', tags: ['주거', '청년'] },
  ];

  return (
    <div className="min-h-screen bg-white pb-20">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        {/* Recommendation Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 leading-tight">
            <span className="text-blue-600">서울특별시 20대</span>를 위한<br />
            맞춤형 공고 💡
          </h2>
        </div>

        {/* Quick Filter Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          {["전체", "지원금", "교육", "복지", "문화"].map((tab) => (
            <button key={tab} className="px-4 py-2 bg-gray-100 rounded-full text-sm font-medium whitespace-nowrap hover:bg-blue-50 hover:text-blue-600">
              {tab}
            </button>
          ))}
        </div>

        {/* Feed Section */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">인기 공고 🔥</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {mockPosters.map((poster) => (
              <PosterCard key={poster.id} poster={poster} />
            ))}
          </div>
        </section>

        {/* Deadline Soon Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-rose-500">마감 임박! ⏰</h3>
            <button className="text-sm text-gray-400 font-medium">전체보기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockPosters.slice(0, 2).map((poster) => (
              <div key={`urgent-${poster.id}`} className="flex gap-4 p-4 border rounded-2xl hover:bg-rose-50 border-rose-100 transition-colors">
                <div className="w-20 h-24 bg-gray-100 rounded-xl" />
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-rose-500 uppercase">D-4</span>
                    <h4 className="text-sm font-bold line-clamp-2">{poster.title}</h4>
                  </div>
                  <span className="text-xs text-gray-400">{poster.org}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
