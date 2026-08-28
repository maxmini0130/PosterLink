"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";
import { FileText, CheckCircle2, Clock, AlertCircle, Plus, Send, BarChart3, Download, MousePointerClick, Star, Eye } from "lucide-react";

type PerformanceReport = {
  rangeDays: number;
  generatedAt: string;
  totals: {
    posters: number;
    published: number;
    review: number;
    rejected: number;
    views: number;
    clicks: number;
    favorites: number;
    engagementScore: number;
  };
  rates: {
    clickThroughRate: number;
    saveRate: number;
  };
  structured: {
    verified: number;
    needsReview: number;
    unverified: number;
    rejected: number;
    verificationMissingTimestamp: number;
    seoReady: number;
    calendarReady: number;
    deadlineNotificationReady: number;
  };
  insights: string[];
  aiGenerated: boolean;
  topPosters: Array<{
    id: string;
    title: string;
    status: string;
    views: number;
    clicks: number;
    favorites: number;
    engagementScore: number;
  }>;
};

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

export default function OperatorDashboardPage() {
  const [stats, setStats] = useState({ draft: 0, review: 0, published: 0, rejected: 0, closed: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [draftRes, reviewRes, publishedRes, rejectedRes, closedRes, recentRes, reportRes] = await Promise.all([
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("poster_status", "draft"),
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("poster_status", "review"),
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("poster_status", "published"),
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("poster_status", "rejected"),
        supabase.from("posters").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("poster_status", "closed"),
        supabase.from("posters").select("id, title, poster_status, created_at").eq("created_by", user.id).order("created_at", { ascending: false }).limit(5),
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          const response = await fetch("/api/operator/performance-report?days=30", {
            cache: "no-store",
            headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
          });
          return response.ok ? response.json() : null;
        }),
      ]);

      setStats({
        draft: draftRes.count ?? 0,
        review: reviewRes.count ?? 0,
        published: publishedRes.count ?? 0,
        rejected: rejectedRes.count ?? 0,
        closed: closedRes.count ?? 0,
      });
      if (recentRes.data) setRecent(recentRes.data);
      if (reportRes) setReport(reportRes);
      setLoading(false);
    };
    fetchData();
  }, []);

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft:     { label: "초안",     color: "text-gray-400 bg-gray-50 border-gray-100" },
    review:    { label: "검수 대기", color: "text-blue-600 bg-blue-50 border-blue-100" },
    published: { label: "게시 중",  color: "text-green-600 bg-green-50 border-green-100" },
    rejected:  { label: "반려됨",   color: "text-rose-500 bg-rose-50 border-rose-100" },
    closed:    { label: "마감",     color: "text-orange-600 bg-orange-50 border-orange-100" },
  };

  const cards = [
    { key: "draft",     label: "초안",     icon: <FileText size={22} />,     color: "bg-gray-50 text-gray-500" },
    { key: "review",    label: "검수 대기", icon: <Clock size={22} />,        color: "bg-blue-50 text-blue-600" },
    { key: "published", label: "게시 중",   icon: <CheckCircle2 size={22} />, color: "bg-green-50 text-green-600" },
    { key: "closed",    label: "마감",      icon: <Clock size={22} />,        color: "bg-orange-50 text-orange-600" },
    { key: "rejected",  label: "반려됨",    icon: <AlertCircle size={22} />,  color: "bg-rose-50 text-rose-500" },
  ];
  const performanceCards = report ? [
    { label: "조회", value: report.totals.views, icon: <Eye size={20} />, color: "bg-sky-50 text-sky-600" },
    { label: "링크 클릭", value: report.totals.clicks, icon: <MousePointerClick size={20} />, color: "bg-indigo-50 text-indigo-600" },
    { label: "저장", value: report.totals.favorites, icon: <Star size={20} />, color: "bg-amber-50 text-amber-600" },
    { label: "클릭률", value: formatPercent(report.rates.clickThroughRate), icon: <BarChart3 size={20} />, color: "bg-emerald-50 text-emerald-600" },
  ] : [];

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

      <div className="grid grid-cols-2 gap-4 mb-10 sm:grid-cols-3 lg:grid-cols-5">
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

      <section className="mb-10 rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-gray-900">
              <BarChart3 size={18} className="text-blue-600" />
              성과 리포트
            </h2>
            <p className="mt-1 text-xs font-bold text-gray-400">
              최근 30일 기준 조회, 클릭, 저장 반응을 자동 집계합니다.
            </p>
          </div>
          <a
            href="/api/operator/performance-report?days=30&format=csv"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gray-900 px-5 text-xs font-black text-white transition-colors hover:bg-black"
          >
            <Download size={15} />
            CSV 다운로드
          </a>
        </div>

        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-2xl bg-gray-50" />
            ))}
          </div>
        ) : report ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {performanceCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-gray-100 bg-gray-50/40 p-4">
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                    {card.icon}
                  </div>
                  <p className="text-2xl font-black text-gray-900">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-gray-400">{card.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 border-y border-gray-100 py-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="text-xs font-black text-gray-900">구조화 데이터 신뢰 현황</h3>
                <span className="text-[11px] font-bold text-gray-400">사람 검증 완료 데이터만 기능에 사용</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
                <div>
                  <dt className="text-[11px] font-bold text-gray-400">검증 완료</dt>
                  <dd className="mt-1 text-xl font-black text-emerald-600">{report.structured.verified.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold text-gray-400">검토 대기</dt>
                  <dd className="mt-1 text-xl font-black text-amber-600">{report.structured.needsReview.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold text-gray-400">SEO 준비</dt>
                  <dd className="mt-1 text-xl font-black text-gray-900">{report.structured.seoReady.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold text-gray-400">캘린더 준비</dt>
                  <dd className="mt-1 text-xl font-black text-gray-900">{report.structured.calendarReady.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold text-gray-400">마감 알림 준비</dt>
                  <dd className="mt-1 text-xl font-black text-gray-900">{report.structured.deadlineNotificationReady.toLocaleString()}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
              <p className="mb-3 text-xs font-black uppercase tracking-wider text-blue-600">
                {report.aiGenerated ? "AI 인사이트" : "자동 인사이트"}
              </p>
              <div className="space-y-2">
                {report.insights.map((insight, index) => (
                  <p key={index} className="text-sm font-bold leading-6 text-gray-700">{insight}</p>
                ))}
              </div>
            </div>

            {report.topPosters.length > 0 && (
              <div className="mt-6 overflow-hidden rounded-2xl border border-gray-100">
                <div className="grid grid-cols-[1fr_64px_64px_64px] gap-3 bg-gray-50 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">
                  <span>공고</span>
                  <span className="text-right">조회</span>
                  <span className="text-right">클릭</span>
                  <span className="text-right">저장</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {report.topPosters.slice(0, 5).map((poster) => (
                    <div key={poster.id} className="grid grid-cols-[1fr_64px_64px_64px] gap-3 px-4 py-3 text-sm">
                      <span className="line-clamp-1 font-black text-gray-800">{poster.title}</span>
                      <span className="text-right font-bold text-gray-500">{poster.views.toLocaleString()}</span>
                      <span className="text-right font-bold text-gray-500">{poster.clicks.toLocaleString()}</span>
                      <span className="text-right font-bold text-gray-500">{poster.favorites.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="mt-6 rounded-2xl bg-gray-50 p-8 text-center text-sm font-bold text-gray-400">
            성과 리포트를 불러오지 못했습니다.
          </div>
        )}
      </section>

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
