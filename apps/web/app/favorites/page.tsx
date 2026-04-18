"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { PosterCard } from "../components/PosterCard";
import { Heart, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function FavoritesPage() {
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<any[]>([]);

  useEffect(() => {
    const fetchFavorites = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (user) {
          // Join favorites with posters and related info
          const { data, error } = await supabase
            .from("favorites")
            .select("poster_id, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (error) { console.error("Fetch Favorites Error:", error); return; }
          if (!data || data.length === 0) return;

          const posterIds = data.map((f: any) => f.poster_id);
          const { data: postersData } = await supabase
            .from("posters")
            .select("*")
            .in("id", posterIds);

          if (postersData) setFavorites(postersData);
        }
      } catch (err) {
        console.error("Error fetching favorites:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, []);

  return (
    <div className="min-h-screen bg-white pb-24">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-[1.5rem] flex items-center justify-center mb-4 shadow-sm">
            <Heart size={32} fill="currentColor" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 italic tracking-tight">Saved Posters 💖</h1>
          <p className="text-sm text-gray-400 font-bold mt-2">놓치고 싶지 않은 소중한 공고들을 모아보세요.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="aspect-[3/4] bg-gray-50 rounded-[2.5rem] animate-pulse" />
            ))}
          </div>
        ) : favorites.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-12">
            {favorites.map((poster) => (
              <PosterCard 
                key={poster.id} 
                poster={{
                  id: poster.id,
                  title: poster.title,
                  org: poster.source_org_name,
                  deadline: poster.application_end_at,
                  tags: [],
                  image: poster.thumbnail_url
                }} 
              />
            ))}
          </div>
        ) : (
          <div className="py-40 text-center bg-gray-50/50 rounded-[4rem] border-2 border-dashed border-gray-100">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Heart className="text-gray-200" size={40} />
            </div>
            <p className="text-gray-900 font-black text-lg">아직 찜한 포스터가 없습니다.</p>
            <p className="text-gray-400 text-sm font-bold mt-2 mb-8">마음에 드는 포스터를 발견하면 ❤️ 버튼을 눌러보세요.</p>
            <Link 
              href="/posters" 
              className="inline-flex items-center gap-2 px-8 py-4 bg-gray-900 text-white font-black rounded-[1.5rem] hover:bg-black transition-all shadow-xl shadow-gray-200"
            >
              EXPLORE POSTERS <ArrowRight size={18} />
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
