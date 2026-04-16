import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { PosterCard } from "../components/PosterCard";
import { DUMMY_POSTERS } from "../lib/dummy";

export default function PosterListPage() {
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex flex-col gap-4 mb-6">
          <h1 className="text-2xl font-bold">공공 포스터 탐색</h1>
          
          {/* Search Placeholder */}
          <div className="relative">
            <input 
              type="text" 
              placeholder="포스터 제목이나 기관명을 검색하세요" 
              className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm border-none focus:ring-2 focus:ring-primary/20 transition-all outline-none"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 text-xs font-semibold overflow-x-auto pb-2">
            <button className="px-3 py-1.5 border border-gray-200 rounded-lg whitespace-nowrap">지역: 전체</button>
            <button className="px-3 py-1.5 border border-gray-200 rounded-lg whitespace-nowrap">연령: 전체</button>
            <button className="px-3 py-1.5 border border-gray-200 rounded-lg whitespace-nowrap">정렬: 최신순</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {DUMMY_POSTERS.map((poster) => (
            <PosterCard key={poster.id} poster={poster} />
          ))}
          {/* Repeat dummy data to show scrolling */}
          {DUMMY_POSTERS.map((poster) => (
            <PosterCard key={`repeat-${poster.id}`} poster={poster} />
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
