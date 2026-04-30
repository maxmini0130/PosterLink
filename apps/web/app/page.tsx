"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { Footer } from "./components/Footer";
import { PosterCard } from "./components/PosterCard";
import { fetchCategoryRegionNames } from "./lib/posterHelpers";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Zap, Bell, Heart, Search } from "lucide-react";
import Link from "next/link";
import Image from "next/image";


export default function Home() {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [posters, setPosters] = useState<any[]>([]);
  const [urgentPosters, setUrgentPosters] = useState<any[]>([]);
  const [stats, setStats] = useState({ posters: 0, favorites: 0, notifications: 0 });

  useEffect(() => {
    const fetchHomeData = async () => {
      setLoading(true);
      try {
        const attachPosterMeta = async (items: any[]) => {
          const metaMap = await fetchCategoryRegionNames(items.map((poster: any) => poster.id));
          return items.map((poster: any) => ({ ...poster, ...metaMap[poster.id] }));
        };

        // getSession reads from localStorage (no network) — safe even with deleted accounts
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;

        // 로그인 시: 프로필 + 맞춤 추천
        let postersFetched = false;
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("*, regions(name)").eq("id", user.id).single();
          setUserProfile(profile);

          const { data: recommendedData, error: rpcError } = await supabase.rpc('get_recommended_posters', {
            p_user_id: user.id,
            p_limit: 8
          });

          if (!rpcError && recommendedData && recommendedData.length > 0) {
            setPosters(await attachPosterMeta(recommendedData));
            postersFetched = true;
          }
        }

        // 비로그인 또는 RPC 결과 없을 때: 공개 포스터 최신순
        if (!postersFetched) {
          const { data: publicData, error: publicError } = await supabase
            .from("posters")
            .select("id, title, source_org_name, application_end_at, poster_status, thumbnail_url")
            .eq("poster_status", "published")
            .order("created_at", { ascending: false })
            .limit(8);

          if (!publicError && publicData) {
            setPosters(await attachPosterMeta(publicData));
          }
        }

        // 마감 임박 공고 (로그인 여부 무관)
        const now = new Date().toISOString();
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

        const { data: urgentData } = await supabase
          .from("posters")
          .select("*")
          .eq("poster_status", "published")
          .gte("application_end_at", now)
          .lte("application_end_at", sevenDaysLater.toISOString())
          .order("application_end_at", { ascending: true })
          .limit(4);
        if (urgentData && urgentData.length > 0) setUrgentPosters(urgentData);

        // 서비스 통계
        const [postersCount, favCount, notifCount] = await Promise.all([
          supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "published"),
          user ? supabase.from("favorites").select("id", { count: "exact", head: true }).eq("user_id", user.id) : Promise.resolve({ count: 0 }),
          user ? supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false) : Promise.resolve({ count: 0 }),
        ]);
        setStats({
          posters: postersCount.count ?? 0,
          favorites: (favCount as any).count ?? 0,
          notifications: (notifCount as any).count ?? 0,
        });

      } finally {
        setLoading(false);
      }
    };
    fetchHomeData();
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 100 } }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-12 h-12 bg-blue-600 rounded-2xl shadow-xl shadow-blue-100 dark:shadow-none" 
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 transition-colors duration-300">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Hero */}
        <motion.section
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8"
        >
          <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-gray-100 dark:border-slate-700 relative overflow-hidden transition-colors">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-50 dark:bg-blue-900/20 rounded-full blur-3xl opacity-60" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                  <Sparkles size={16} fill="currentColor" />
                </div>
                <span className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Recommended for you</span>
              </div>
              <h2 className="text-3xl font-black text-gray-900 dark:text-slate-50 leading-tight break-keep">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                  {userProfile?.regions?.name || "전국"}{userProfile?.age_band === '20s' ? ' 20대' : ''}
                </span>를 위한{' '}
                맞춤형 공고가 도착했어요 💡
              </h2>
            </div>
          </div>
        </motion.section>

        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-3 gap-3 mb-10"
        >
          <Link href="/posters" className="flex flex-col items-center py-4 bg-blue-50 dark:bg-blue-900/20 rounded-[1.5rem] hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group">
            <Search size={18} className="text-blue-500 mb-1" />
            <p className="text-lg font-black text-blue-600 dark:text-blue-400">{stats.posters}</p>
            <p className="text-[10px] font-black text-blue-400 uppercase">공고</p>
          </Link>
          <Link href="/favorites" className="flex flex-col items-center py-4 bg-rose-50 dark:bg-rose-900/20 rounded-[1.5rem] hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors">
            <Heart size={18} className="text-rose-400 mb-1" />
            <p className="text-lg font-black text-rose-500 dark:text-rose-400">{stats.favorites}</p>
            <p className="text-[10px] font-black text-rose-400 uppercase">찜</p>
          </Link>
          <Link href="/notifications" className="flex flex-col items-center py-4 bg-amber-50 dark:bg-amber-900/20 rounded-[1.5rem] hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors relative">
            <Bell size={18} className="text-amber-400 mb-1" />
            <p className="text-lg font-black text-amber-500 dark:text-amber-400">{stats.notifications}</p>
            <p className="text-[10px] font-black text-amber-400 uppercase">미확인</p>
            {stats.notifications > 0 && (
              <span className="absolute top-3 right-4 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
            )}
          </Link>
        </motion.div>

        {/* Latest Feed with Stagger Animation */}
        <motion.section 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-16"
        >
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-black text-gray-900 dark:text-slate-50">새로 올라온 공고</h3>
              <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
            </div>
            <Link href="/posters" className="text-xs font-black text-gray-400 dark:text-slate-500 flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              VIEW ALL <ArrowRight size={14} />
            </Link>
          </div>
          
          {posters.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10">
              {posters.map((poster) => (
                <motion.div key={poster.id} variants={itemVariants}>
                  <PosterCard 
                    poster={{
                      id: poster.id,
                      title: poster.title,
                      org: poster.source_org_name,
                      deadline: poster.application_end_at,
                      image: poster.thumbnail_url,
                      tags: [poster.categoryName, poster.regionName].filter((tag): tag is string => Boolean(tag))
                    }} 
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center bg-white dark:bg-slate-800 rounded-[3rem] border border-dashed border-gray-200 dark:border-slate-700">
              <p className="text-gray-400 dark:text-slate-500 font-bold">아직 등록된 공고가 없습니다.</p>
            </div>
          )}
        </motion.section>

        {/* Urgent Section with Gradient Background */}
        <AnimatePresence>
          {urgentPosters.length > 0 && (
            <motion.section 
              initial={{ scale: 0.95, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              className="mb-10"
            >
              <div className="bg-gradient-to-br from-rose-500 to-rose-600 dark:from-rose-600 dark:to-rose-700 p-8 rounded-[3rem] shadow-xl shadow-rose-100 dark:shadow-none relative overflow-hidden transition-colors">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <Zap size={120} fill="white" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                       마감 임박! 서두르세요 ⏰
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {urgentPosters.map((poster) => {
                      const daysLeft = Math.ceil((new Date(poster.application_end_at).getTime() - Date.now()) / 86400000);
                      return (
                        <motion.div
                          key={`urgent-${poster.id}`}
                          whileHover={{ y: -4 }}
                        >
                          <Link
                            href={`/posters/${poster.id}`}
                            className="flex gap-4 p-5 bg-white/10 backdrop-blur-md rounded-[2rem] border border-white/20 hover:bg-white/20 transition-colors"
                          >
                            <div className="w-16 h-20 bg-white/20 rounded-2xl flex-shrink-0 overflow-hidden relative">
                              {poster.thumbnail_url && (
                                <Image src={poster.thumbnail_url} alt={poster.title} fill className="object-cover" sizes="64px" />
                              )}
                            </div>
                            <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
                              <h4 className="text-sm font-black text-white line-clamp-2 leading-snug">
                                {poster.title}
                              </h4>
                              <span className={`text-[11px] font-black px-2.5 py-1 rounded-xl w-fit ${daysLeft <= 1 ? 'bg-white text-rose-600' : 'text-white/90 bg-white/20'}`}>
                                {daysLeft === 0 ? 'D-Day' : `D-${daysLeft}`} 마감
                              </span>
                            </div>
                          </Link>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
