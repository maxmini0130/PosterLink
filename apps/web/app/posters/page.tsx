"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { PosterCard } from "../components/PosterCard";
import { Search, SlidersHorizontal } from "lucide-react";

export default function PosterListPage() {
  const [loading, setLoading] = useState(true);
  const [posters, setPosters] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("latest"); // latest, deadline

  useEffect(() => {
    const fetchInitialData = async () => {
      const { data: catData } = await supabase.from("categories").select("*").order("sort_order");
      const { data: regData } = await supabase.from("regions").select("*").in("level", ["nation", "sido"]).order("level", { ascending: false });
      
      if (catData) setCategories(catData);
      if (regData) setRegions(regData);
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    const fetchPosters = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("posters")
          .select(`
            *,
            categories (name),
            regions (name)
          `)
          .eq("status", "published");

        if (searchQuery) {
          query = query.ilike("title", `%${searchQuery}%`);
        }

        if (selectedCategoryId) {
          query = query.eq("category_id", selectedCategoryId);
        }

        if (selectedRegionId) {
          // If a specific region is selected, also include nationwide (null)
          query = query.or(`primary_region_id.eq.${selectedRegionId},primary_region_id.is.null`);
        }

        if (sortBy === "latest") {
          query = query.order("created_at", { ascending: false });
        } else if (sortBy === "deadline") {
          query = query.order("application_end_at", { ascending: true });
        }

        const { data, error } = await query;
        if (data) setPosters(data);
      } catch (err) {
        console.error("Error fetching posters:", err);
      } finally {
        setLoading(false);
      }
    };

    // Debounce search
    const timer = setTimeout(() => {
      fetchPosters();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategoryId, selectedRegionId, sortBy]);

  return (
    <div className="min-h-screen bg-white pb-24">
      <Header />
      
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex flex-col gap-6 mb-8">
          <h1 className="text-2xl font-black text-gray-900">공공 포스터 탐색 🔍</h1>
          
          {/* Search Bar */}
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="포스터 제목이나 기관명을 검색하세요" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none"
            />
          </div>

          {/* Filter Chips */}
          <div className="space-y-4">
            {/* Regions */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button 
                onClick={() => setSelectedRegionId(null)}
                className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${!selectedRegionId ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-gray-100 text-gray-400'}`}
              >
                전국 지역
              </button>
              {regions.map((reg) => (
                <button 
                  key={reg.id}
                  onClick={() => setSelectedRegionId(reg.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${selectedRegionId === reg.id ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-gray-100 text-gray-400'}`}
                >
                  {reg.name}
                </button>
              ))}
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button 
                onClick={() => setSelectedCategoryId(null)}
                className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${!selectedCategoryId ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-gray-100 text-gray-400'}`}
              >
                전체 분야
              </button>
              {categories.map((cat) => (
                <button 
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${selectedCategoryId === cat.id ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-gray-100 text-gray-400'}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Sort Tabs */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <div className="flex gap-4">
              <button 
                onClick={() => setSortBy("latest")}
                className={`text-sm font-black transition-colors ${sortBy === 'latest' ? 'text-blue-600' : 'text-gray-300'}`}
              >
                최신순
              </button>
              <button 
                onClick={() => setSortBy("deadline")}
                className={`text-sm font-black transition-colors ${sortBy === 'deadline' ? 'text-blue-600' : 'text-gray-300'}`}
              >
                마감임박순
              </button>
            </div>
            <div className="flex items-center gap-1 text-gray-400">
              <span className="text-xs font-bold">총 {posters.length}건</span>
            </div>
          </div>
        </div>

        {/* Results Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="aspect-[3/4] bg-gray-50 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : posters.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {posters.map((poster) => (
              <PosterCard 
                key={poster.id} 
                poster={{
                  id: poster.id,
                  title: poster.title,
                  org: poster.source_org_name,
                  deadline: poster.application_end_at,
                  tags: [poster.categories?.name, poster.regions?.name].filter(Boolean)
                }} 
              />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center">
            <p className="text-gray-400 font-bold">검색 결과가 없습니다. 🧐</p>
            <button 
              onClick={() => {setSearchQuery(""); setSelectedCategoryId(null); setSelectedRegionId(null);}}
              className="mt-4 text-sm text-blue-600 font-black underline"
            >
              필터 초기화
            </button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
