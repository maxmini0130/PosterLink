"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";
import { FileText, CheckCircle2, Clock, AlertCircle, Plus, Send } from "lucide-react";

export default function OperatorDashboardPage() {
  const [stats, setStats] = useState({ draft: 0, review: 0, published: 0, rejected: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [draftRes, reviewRes, publishedRes, rejectedRes, recentRes] = await Promise.all([
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("poster_status", "draft"),
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("poster_status", "review"),
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("poster_status", "published"),
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("poster_status", "rejected"),
        supabase.from("posters").select("id, title, poster_status, created_at").eq("created_by", user.id).order("created_at", { ascending: false }).limit(5),
      ]);

      setStats({
        draft: draftRes.count ?? 0,
        review: reviewRes.count ?? 0,
        published: publishedRes.count ?? 0,
        rejected: rejectedRes.count ?? 0,
      });
      if (recentRes.data) setRecent(recentRes.data);
      setLoading(false);
    };
    fetchData();
  }, []);

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft:     { label: "초안",     color: "text-gray-400 bg-gray-50 border-gray-100" },
    review:    { label: "검수 대기", color: "text-blue-600 bg-blue-50 border-blue-100" },
    published: { label: "게시 중",  color: "text-green-600 bg-green-50 border-green-100" },
    rejected:  { label: "반려됨",   color: "text-rose-500 bg-rose-50 border-rose-100" },
    expired:   { label: "마감",     color: "text-orange-600 bg-orange-50 border-orange-100" },
  };

  const cards = [
    { key: "draft",     label: "초안",     icon: <FileText size={22} />,     color: "bg-gray-50 text-gray-500" },
    { key: "review",    label: "검수 대기", icon: <Clock size={22} />,        color: "bg-blue-50 text-blue-600" },
    { key: "published", label: "게시 중",   icon: <CheckCircle2 size={22} />, color: "bg-green-50 text-green-600" },
    { key: "rejected",  label: "반려됨",    icon: <AlertCircle size={22} />,  color: "bg-rose-50 text-rose-500" },
  ];

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-black text-gray-900">내 대시보드 📋</h1>
          <p className="text-gray-400 font-bold mt-1 text-sm">등록한 포스터 현황을 확인하세요.</p>
        </div>
        <Link
          href="/operator/posters/new"
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all text-sm"
        >
          <Plus size={18} /> 새 포스터 등록
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {cards.map((card) => (
          <div key={card.key} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card.color}`}>
              {card.icon}
            </div>
            <p className="text-2xl font-black text-gray-900">
              {loading ? <span className="inline-block w-8 h-6 bg-gray-100 rounded animate-pulse" /> : stats[card.key as keyof typeof stats]}
            </p>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-50">
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">최근 등록 포스터</h2>
          <Link href="/operator/posters" className="text-xs font-black text-blue-600 hover:underline">전체 보기</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {loading ? (
            [1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-gray-50/50 mx-4 my-2 rounded-xl" />)
          ) : recent.length > 0 ? (
            recent.map((p) => {
              const sc = statusConfig[p.poster_status] ?? { label: p.poster_status, color: "text-gray-400 bg-gray-50 border-gray-100" };
              return (
                <div key={p.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors">
                  <div>
                    <p className="text-sm font-black text-gray-900 line-clamp-1">{p.title}</p>
                    <p className="text-[11px] font-bold text-gray-400 mt-0.5">{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black border ${sc.color}`}>{sc.label}</span>
                    {p.poster_status === "draft" && (
                      <Link href={`/operator/posters/${p.id}/edit`} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
                        <Send size={16} />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center text-gray-400 font-bold text-sm">등록한 포스터가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
