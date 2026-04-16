"use client";

import { useState, useEffect } from "react";
import { Header } from "../../components/Header";
import { BottomNav } from "../../components/BottomNav";
import { DUMMY_POSTERS } from "../../lib/dummy";
import { notFound } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function PosterDetailPage({ params }: { params: { id: string } }) {
  const poster = DUMMY_POSTERS.find((p) => p.id === params.id);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!poster) {
    notFound();
  }

  useEffect(() => {
    const checkFavorite = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("favorites").select().eq("user_id", user.id).eq("poster_id", poster.id).single();
        setIsFavorited(!!data);
      }
      setLoading(false);
    };
    checkFavorite();
  }, [poster.id]);

  const toggleFavorite = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    if (isFavorited) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("poster_id", poster.id);
    } else {
      await supabase.from("favorites").insert({ user_id: user.id, poster_id: poster.id });
    }
    setIsFavorited(!isFavorited);
  };

  const daysLeft = Math.ceil((new Date(poster.application_end_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="min-h-screen bg-white pb-24 md:pb-10">
      <Header />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <div className="aspect-[3/4] rounded-2xl overflow-hidden border shadow-lg mb-6">
          <img src={poster.thumbnail_url} alt={poster.title} className="w-full h-full object-cover" />
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-accent text-white text-[10px] font-bold rounded">
              D-{daysLeft > 0 ? daysLeft : "Day"}
            </span>
            <span className="text-sm text-gray-500 font-medium">{poster.source_org_name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-4">{poster.title}</h1>
          <div className="flex flex-wrap gap-2">
            {poster.tags.map((tag) => (
              <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        </div>

        <section className="p-6 bg-gray-50 rounded-2xl mb-8">
          <h2 className="text-sm font-bold text-primary mb-4">📍 핵심 요약</h2>
          <ul className="space-y-4 text-sm text-gray-700">
            <li className="flex gap-4">
              <span className="font-bold text-gray-400 w-16 flex-shrink-0">신청기간</span>
              <span>{new Date(poster.application_end_at).toLocaleDateString()} 까지</span>
            </li>
            <li className="flex gap-4">
              <span className="font-bold text-gray-400 w-16 flex-shrink-0">대상지역</span>
              <span>{poster.region}</span>
            </li>
          </ul>
        </section>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t md:relative md:bg-transparent md:border-none md:p-0">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button 
              onClick={toggleFavorite}
              className={`w-14 h-14 flex items-center justify-center border rounded-xl transition-colors ${isFavorited ? 'bg-accent/10 border-accent' : 'bg-white'}`}
            >
               {isFavorited ? '❤️' : '🤍'}
            </button>
            <a href="#" target="_blank" className="flex-1 h-14 flex items-center justify-center bg-primary text-white font-bold rounded-xl shadow-lg">
              공식 홈페이지 바로가기
            </a>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
