"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import { FileCheck, AlertTriangle, Settings, Users, TrendingUp, Clock } from "lucide-react";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    reviewPending: 0,
    published: 0,
    reportsPending: 0,
    totalUsers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [reviewRes, publishedRes, reportsRes, usersRes] = await Promise.all([
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "review_requested"),
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "published"),
        supabase.from("comment_reports").select("id", { count: "exact", head: true }).eq("report_status", "received"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

      setStats({
        reviewPending: reviewRes.count ?? 0,
        published: publishedRes.count ?? 0,
        reportsPending: reportsRes.count ?? 0,
        totalUsers: usersRes.count ?? 0,
      });
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
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
