"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import { AlertTriangle, Clock, FileCheck, MousePointerClick, Search, Settings, TrendingUp, Users } from "lucide-react";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    reviewPending: 0,
    published: 0,
    reportsPending: 0,
    totalUsers: 0,
    linkClicks: 0,
  });
  const [popularKeywords, setPopularKeywords] = useState<string[]>([]);
  const [recentActions, setRecentActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [reviewRes, publishedRes, reportsRes, usersRes, linkClickRes, keywordRes, actionsRes] = await Promise.all([
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "review"),
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "published"),
        supabase.from("comment_reports").select("id", { count: "exact", head: true }).eq("report_status", "received"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("poster_link_click_logs").select("id", { count: "exact", head: true }),
        supabase.rpc("get_popular_keywords", { p_limit: 5 }),
        supabase
          .from("admin_actions")
          .select("target_type, action_type, action_reason, metadata_json, created_at")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      setStats({
        reviewPending: reviewRes.count ?? 0,
        published: publishedRes.count ?? 0,
        reportsPending: reportsRes.count ?? 0,
        totalUsers: usersRes.count ?? 0,
        linkClicks: linkClickRes.count ?? 0,
      });
      setPopularKeywords((keywordRes.data ?? []).map((row: any) => row.keyword));
      setRecentActions(actionsRes.data ?? []);
      setLoading(false);
    };

    fetchStats();
  }, []);

  const cards = [
    {
      label: "검수 대기",
      value: stats.reviewPending,
      icon: <Clock size={24} />,
      color: "bg-indigo-50 text-indigo-600",
      href: "/admin/posters",
      urgent: stats.reviewPending > 0,
    },
    {
      label: "게시 중인 포스터",
      value: stats.published,
      icon: <TrendingUp size={24} />,
      color: "bg-green-50 text-green-600",
      href: "/admin/posters",
      urgent: false,
    },
    {
      label: "처리 대기 신고",
      value: stats.reportsPending,
      icon: <AlertTriangle size={24} />,
      color: "bg-rose-50 text-rose-500",
      href: "/admin/reports",
      urgent: stats.reportsPending > 0,
    },
    {
      label: "전체 사용자",
      value: stats.totalUsers,
      icon: <Users size={24} />,
      color: "bg-blue-50 text-blue-600",
      href: "/admin/settings",
      urgent: false,
    },
    {
      label: "공식 링크 클릭",
      value: stats.linkClicks,
      icon: <MousePointerClick size={24} />,
      color: "bg-amber-50 text-amber-600",
      href: "/admin",
      urgent: false,
    },
  ];

  const shortcuts = [
    { label: "포스터 검수", desc: "운영자가 등록한 포스터를 승인하거나 반려합니다", icon: <FileCheck size={22} />, href: "/admin/posters" },
    { label: "신고 관리", desc: "사용자 신고 댓글을 검토하고 처리합니다", icon: <AlertTriangle size={22} />, href: "/admin/reports" },
    { label: "기준정보 관리", desc: "카테고리와 지역 정보를 추가하거나 삭제합니다", icon: <Settings size={22} />, href: "/admin/settings" },
  ];

  return (
    <div className="pb-10">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-gray-900 italic tracking-tight">Dashboard 🛡️</h1>
        <p className="text-gray-400 font-bold mt-2">PosterLink 서비스 현황을 한눈에 확인합니다.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}
            className={`bg-white p-6 rounded-[2rem] border shadow-sm hover:shadow-md transition-all ${card.urgent ? "border-rose-200 ring-2 ring-rose-50" : "border-gray-100"}`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${card.color}`}>
              {card.icon}
            </div>
            <p className="text-3xl font-black text-gray-900">
              {loading ? <span className="inline-block w-8 h-8 bg-gray-100 rounded-lg animate-pulse" /> : card.value}
            </p>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mt-1">{card.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-12">
        <section className="rounded-[2rem] border border-gray-100 bg-white p-7 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Search size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900">인기 검색어</h2>
              <p className="text-xs font-bold text-gray-400">최근 검색 로그 기준</p>
            </div>
          </div>
          {popularKeywords.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {popularKeywords.map((keyword) => (
                <span key={keyword} className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-black text-gray-500">
                  {keyword}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm font-bold text-gray-300">아직 검색 로그가 없습니다.</p>
          )}
        </section>

        <section className="rounded-[2rem] border border-gray-100 bg-white p-7 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <FileCheck size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900">최근 관리자 작업</h2>
              <p className="text-xs font-bold text-gray-400">승인, 반려, 신고 처리, 기준정보 변경</p>
            </div>
          </div>
          {recentActions.length > 0 ? (
            <div className="space-y-3">
              {recentActions.map((action, index) => (
                <div key={`${action.created_at}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-black text-gray-700">
                      {action.target_type} · {action.action_type}
                    </p>
                    {action.action_reason && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] font-bold text-gray-400">{action.action_reason}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-gray-300">
                    {new Date(action.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm font-bold text-gray-300">아직 관리자 작업 로그가 없습니다.</p>
          )}
        </section>
      </div>

      {/* Shortcuts */}
      <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">바로가기</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {shortcuts.map((s) => (
          <Link key={s.label} href={s.href}
            className="bg-white p-7 rounded-[2rem] border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              {s.icon}
            </div>
            <p className="font-black text-gray-900 mb-1">{s.label}</p>
            <p className="text-xs font-bold text-gray-400 leading-relaxed">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
