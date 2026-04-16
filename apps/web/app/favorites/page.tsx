"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Header } from "../../components/Header";
import { BottomNav } from "../../components/BottomNav";
import { PosterCard } from "../../components/PosterCard";
import { Heart } from "lucide-react";

export default function FavoritesPage() {
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<any[]>([]);

  useEffect(() => {
    const fetchFavorites = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Join poster_favorites with posters
          const { data, error } = await supabase
            .from("poster_favorites")
            .select(`
              poster_id,
              posters (
                *,
                categories (name),
                regions (name)
              )
            `)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (data) {
            // Flatten the structure
            const flattened = data.map((f: any) => f.posters).filter(Boolean);
            setFavorites(flattened);
          }
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
      
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            내가 찜한 포스터 <Heart className="fill-rose-500 text-rose-500" size={24} />
          </h1>
          <p className="text-sm text-gray-400 font-bold mt-1">놓치고 싶지 않은 공고들을 모아보세요.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="aspect-[3/4] bg-gray-50 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : favorites.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {favorites.map((poster) => (
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
          <div className="py-24 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4">
              <Heart className="text-gray-200" size={32} />
            </div>
            <p className="text-sm text-gray-400 font-bold">아직 찜한 포스터가 없습니다.</p>
            <Link href="/posters" className="mt-4 inline-block text-sm text-blue-600 font-black underline">
              포스터 탐색하러 가기
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

// Need to import Link for the empty state
import Link from "next/link";
