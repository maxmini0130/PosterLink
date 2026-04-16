"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Header } from "../../components/Header";
import { BottomNav } from "../../components/BottomNav";
import { PosterCard } from "../../components/PosterCard";
import { DUMMY_POSTERS, Poster } from "../../lib/dummy";

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<Poster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFavorites = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("favorites").select("poster_id").eq("user_id", user.id);
        if (data) {
          const favoriteIds = data.map(f => f.poster_id);
          // Filter dummy data for now
          setFavorites(DUMMY_POSTERS.filter(p => favoriteIds.includes(p.id)));
        }
      }
      setLoading(false);
    };
    fetchFavorites();
  }, []);

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">내가 찜한 포스터</h1>
        {loading ? (
          <p>로딩 중...</p>
        ) : favorites.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {favorites.map(p => <PosterCard key={p.id} poster={p} />)}
          </div>
        ) : (
          <div className="py-20 text-center text-gray-400">
            찜한 포스터가 없습니다.
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
