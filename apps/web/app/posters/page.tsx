"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { PosterCard } from "../components/PosterCard";
import { fetchCategoryRegionNames } from "../lib/posterHelpers";
import { Search, X, History, TrendingUp, Filter, ArrowLeft } from "lucide-react";

export default function PosterListPage() {
  const [loading, setLoading] = useState(true);
  const [posters, setPosters] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [popularKeywords, setPopularKeywords] = useState<string[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("latest");

  const searchInputRef = useRef<HTMLInputElement>(null);

  // 1. Initial Data Load
  useEffect(() => {
    const fetchBase = async () => {
      const { data: catData } = await supabase.from("categories").select("*").order("sort_order");
      const { data: regData } = await supabase.from("regions").select("*").in("level", ["nation", "sido"]).order("level", { ascending: false });
      if (catData) setCategories(catData);
      if (regData) setRegions(regData);
      
      // Load recent searches from localStorage
      try {
        const saved = localStorage.getItem("recent_searches");
        if (saved) setRecentSearches(JSON.parse(saved));
      } catch {
        localStorage.removeItem("recent_searches");
      }

      // 인기 검색어 DB에서 로드
      const { data: kwData } = await supabase.rpc("get_popular_keywords", { p_limit: 5 });
      if (kwData && kwData.length > 0) {
        setPopularKeywords(kwData.map((r: any) => r.keyword));
      } else {
        setPopularKeywords(["청년수당", "소상공인 지원", "내일배움카드", "디지털 교육", "창업 지원"]);
      }
    };
    fetchBase();
  }, []);

  // 2. Fetch Posters with Filters
  const fetchPosters = async (queryStr = searchQuery) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("search_posters_with_synonyms", {
        p_query: queryStr.trim(),
        p_category_id: selectedCategoryId,
        p_region_id: selectedRegionId,
      });

      if (error) throw error;

      const sortedData = [...(data ?? [])].sort((a: any, b: any) => {
        if (sortBy === "deadline") {
          const aTime = a.application_end_at ? new Date(a.application_end_at).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.application_end_at ? new Date(b.application_end_at).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        }

        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      });

      const metaMap = await fetchCategoryRegionNames(sortedData.map((poster: any) => poster.id));
      setPosters(sortedData.map((poster: any) => ({ ...poster, ...metaMap[poster.id] })));
    } catch (err) {
      console.error("Error fetching posters:", err);
      setPosters([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchPosters(), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategoryId, selectedRegionId, sortBy]);

  // 3. Search Actions
  const handleSearchSubmit = (e?: React.FormEvent, term?: string) => {
    e?.preventDefault();
    const finalTerm = term || searchQuery;
    if (!finalTerm.trim()) return;

    // Save to recent searches
    const updated = [finalTerm, ...recentSearches.filter(s => s !== finalTerm)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("recent_searches", JSON.stringify(updated));

    // 검색 로그 저장
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabase.rpc("log_search", {
        p_user_id: session?.user?.id ?? null,
        p_query: finalTerm.trim(),
        p_result_count: 0,
      });
    });

    setSearchQuery(finalTerm);
    setIsSearchFocused(false);
    searchInputRef.current?.blur();
  };

  const removeRecentSearch = (term: string) => {
    const updated = recentSearches.filter(s => s !== term);
    setRecentSearches(updated);
    localStorage.setItem("recent_searches", JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      <Header />
      
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Search Section */}
        <div className={`fixed inset-0 z-[60] bg-white transition-all duration-300 ${isSearchFocused ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}>
          <div className="p-4 flex items-center gap-3 border-b">
            <button onClick={() => setIsSearchFocused(false)} className="p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft size={24} />
            </button>
            <form onSubmit={handleSearchSubmit} className="flex-1 relative">
              <input 
                ref={searchInputRef}
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색어를 입력하세요"
                className="w-full py-3 px-4 bg-gray-50 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-100 text-gray-900 placeholder:text-gray-400"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400">
                  <X size={16} />
                </button>
              )}
            </form>
          </div>
          
          <div className="p-6">
            {recentSearches.length > 0 && (
              <section className="mb-10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <History size={14} /> Recent Searches
                  </h3>
                  <button onClick={() => {setRecentSearches([]); localStorage.removeItem("recent_searches");}} className="text-xs font-bold text-gray-300 hover:text-rose-500">모두 삭제</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map(s => (
                    <div key={s} className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                      <button onClick={() => handleSearchSubmit(undefined, s)} className="text-sm font-bold text-gray-700">{s}</button>
                      <button onClick={() => removeRecentSearch(s)} className="text-gray-300 hover:text-gray-600"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                <TrendingUp size={14} /> Popular Keywords
              </h3>
              <div className="flex flex-wrap gap-2">
                {popularKeywords.map(k => (
                  <button key={k} onClick={() => handleSearchSubmit(undefined, k)} className="px-4 py-2 border border-gray-100 rounded-xl text-sm font-bold text-gray-500 hover:border-blue-200 hover:text-blue-600 transition-all">
                    {k}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Main List UI */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
             <h1 className="text-2xl font-black text-gray-900">Explore 🔍</h1>
             <button className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:bg-blue-50 hover:text-blue-600 transition-all">
                <Filter size={20} />
             </button>
          </div>
          
          {/* Main Search Bar (Trigger) */}
          <div 
            onClick={() => {setIsSearchFocused(true); setTimeout(() => searchInputRef.current?.focus(), 100);}}
            className="group flex items-center gap-3 px-5 py-4 bg-gray-50 rounded-[1.5rem] border border-transparent hover:border-blue-100 cursor-pointer transition-all"
          >
            <Search className="text-gray-300 group-hover:text-blue-500 transition-colors" size={20} />
            <span className="text-sm font-bold text-gray-400">
              {searchQuery || "어떤 공고를 찾으시나요?"}
            </span>
          </div>

          {/* Active Filter Badges */}
          {(selectedCategoryId || selectedRegionId || searchQuery) && (
            <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1">
              {searchQuery && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-black rounded-lg shadow-lg shadow-blue-100">
                  "{searchQuery}" <button onClick={() => setSearchQuery("")}><X size={12}/></button>
                </span>
              )}
              {selectedRegionId && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-black rounded-lg border border-indigo-100">
                  {regions.find(r => r.id === selectedRegionId)?.name} <button onClick={() => setSelectedRegionId(null)}><X size={12}/></button>
                </span>
              )}
              {selectedCategoryId && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-black rounded-lg border border-emerald-100">
                  {categories.find(c => c.id === selectedCategoryId)?.name} <button onClick={() => setSelectedCategoryId(null)}><X size={12}/></button>
                </span>
              )}
            </div>
          )}

          {/* Quick Filters */}
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button onClick={() => setSelectedCategoryId(null)} className={`px-5 py-2.5 rounded-2xl text-[13px] font-black whitespace-nowrap transition-all ${!selectedCategoryId ? 'bg-gray-900 text-white shadow-xl shadow-gray-200' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>전체 분야</button>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setSelectedCategoryId(cat.id)} className={`px-5 py-2.5 rounded-2xl text-[13px] font-black whitespace-nowrap transition-all ${selectedCategoryId === cat.id ? 'bg-gray-900 text-white shadow-xl shadow-gray-200' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>{cat.name}</button>
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <button onClick={() => setSelectedRegionId(null)} className={`px-5 py-2.5 rounded-2xl text-[13px] font-black whitespace-nowrap transition-all ${!selectedRegionId ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'bg-blue-50 text-blue-400 hover:bg-blue-100'}`}>전체 지역</button>
              {regions.map(region => (
                <button key={region.id} onClick={() => setSelectedRegionId(region.id)} className={`px-5 py-2.5 rounded-2xl text-[13px] font-black whitespace-nowrap transition-all ${selectedRegionId === region.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'bg-blue-50 text-blue-400 hover:bg-blue-100'}`}>{region.name}</button>
              ))}
            </div>
          </div>

          {/* Sort & Result Count */}
          <div className="flex items-center justify-between border-b border-gray-50 pb-4">
             <span className="text-[11px] font-black text-gray-300 uppercase tracking-widest">Total {posters.length} Results</span>
             <div className="flex gap-4">
               <button onClick={() => setSortBy("latest")} className={`text-xs font-black transition-colors ${sortBy === 'latest' ? 'text-blue-600' : 'text-gray-300'}`}>LATEST</button>
               <button onClick={() => setSortBy("deadline")} className={`text-xs font-black transition-colors ${sortBy === 'deadline' ? 'text-blue-600' : 'text-gray-300'}`}>DEADLINE</button>
             </div>
          </div>
        </div>

        {/* Results Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
            {[1,2,3,4].map(i => <div key={i} className="aspect-[3/4] bg-gray-50 rounded-3xl animate-pulse" />)}
          </div>
        ) : posters.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10 mt-8">
            {posters.map((poster) => (
              <PosterCard 
                key={poster.id} 
                poster={{
                  id: poster.id,
                  title: poster.title,
                  org: poster.source_org_name,
                  deadline: poster.application_end_at,
                  image: poster.thumbnail_url,
                  tags: [poster.categoryName, poster.regionName].filter((tag): tag is string => Boolean(tag))
                }} 
              />
            ))}
          </div>
        ) : (
          <div className="py-32 text-center bg-gray-50/50 rounded-[3rem] border border-dashed border-gray-100 mt-8">
            <Search className="mx-auto text-gray-200 mb-4" size={48} />
            <p className="text-gray-400 font-black">검색 결과가 없습니다.</p>
            <p className="text-gray-300 text-xs font-bold mt-1">다른 검색어나 필터를 시도해보세요.</p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
