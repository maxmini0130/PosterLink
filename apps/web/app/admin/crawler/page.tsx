"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  ImageOff,
  RefreshCw,
  SearchCheck,
  XCircle,
} from "lucide-react";
import { resolvePosterImageUrl } from "../../../lib/posterImage";
import { PosterImageFallback } from "../../components/PosterImageFallback";

type CrawlerStats = {
  total: number;
  review: number;
  published: number;
  rejected: number;
  draft: number;
  hidden: number;
  last24h: number;
  missingImages: number;
  suspicious: number;
};

type CrawlerPoster = {
  id: string;
  title: string;
  source_org_name: string | null;
  poster_status: string;
  created_at: string;
  application_end_at: string | null;
  thumbnail_url: string | null;
  source_key: string | null;
  summary_short: string | null;
  sourceUrl: string | null;
  sourceHost: string;
  suspicionReasons?: string[];
};

type CrawlerSummary = {
  stats: CrawlerStats;
  sourceCounts: { source: string; count: number }[];
  recent: CrawlerPoster[];
  suspicious: CrawlerPoster[];
};

const STATUS_LABEL: Record<string, string> = {
  review: "검수대기",
  published: "게시완료",
  rejected: "반려",
  draft: "임시",
  hidden: "숨김",
  closed: "마감",
  archived: "보관",
};

function formatDate(value: string | null) {
  if (!value) return "상시";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PosterRow({ poster, showReasons = false }: { poster: CrawlerPoster; showReasons?: boolean }) {
  return (
    <div className="flex gap-4 rounded-2xl border border-gray-100 p-4 dark:border-slate-800">
      <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-50 dark:bg-slate-800">
        <PosterImageFallback
          src={resolvePosterImageUrl(poster.thumbnail_url, poster.source_key)}
          alt={poster.title}
          title={poster.title}
          org={poster.source_org_name}
          fallbackClassName="p-2"
          imgClassName="h-full w-full object-cover"
          iconSize={18}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-600 dark:bg-indigo-900/20">
            {STATUS_LABEL[poster.poster_status] ?? poster.poster_status}
          </span>
          <span className="text-[11px] font-bold text-gray-300">{formatDate(poster.created_at)} 적재</span>
          <span className="text-[11px] font-bold text-gray-300">마감 {formatDate(poster.application_end_at)}</span>
        </div>
        <p className="truncate text-sm font-black text-gray-900 dark:text-white">{poster.title}</p>
        <p className="mt-1 truncate text-xs font-bold text-gray-400">
          {poster.source_org_name || "기관 미상"} · {poster.sourceHost}
        </p>
        {showReasons && poster.suspicionReasons?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {poster.suspicionReasons.map((reason) => (
              <span key={reason} className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">
                {reason}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/admin/posters"
            className="rounded-xl bg-gray-900 px-3 py-2 text-[11px] font-black text-white transition-colors hover:bg-black"
          >
            검수하기
          </Link>
          {poster.sourceUrl && (
            <a
              href={poster.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-xl bg-gray-50 px-3 py-2 text-[11px] font-black text-gray-500 transition-colors hover:bg-gray-100 dark:bg-slate-800 dark:text-slate-300"
            >
              <ExternalLink size={13} />
              원문
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminCrawlerPage() {
  const [summary, setSummary] = useState<CrawlerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crawler/summary", { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "크롤러 DB 현황을 불러오지 못했습니다.");
      setSummary(payload);
    } catch (err: any) {
      setError(err.message ?? "크롤러 DB 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const cards = useMemo(() => {
    const stats = summary?.stats;
    return [
      { label: "전체 적재", value: stats?.total ?? 0, icon: <Database size={22} />, color: "bg-slate-900 text-white" },
      { label: "최근 24시간", value: stats?.last24h ?? 0, icon: <Clock size={22} />, color: "bg-blue-50 text-blue-600" },
      { label: "검수대기", value: stats?.review ?? 0, icon: <SearchCheck size={22} />, color: "bg-indigo-50 text-indigo-600" },
      { label: "게시완료", value: stats?.published ?? 0, icon: <CheckCircle2 size={22} />, color: "bg-emerald-50 text-emerald-600" },
      { label: "이미지 누락", value: stats?.missingImages ?? 0, icon: <ImageOff size={22} />, color: "bg-rose-50 text-rose-500" },
      { label: "의심 데이터", value: stats?.suspicious ?? 0, icon: <AlertTriangle size={22} />, color: "bg-amber-50 text-amber-600" },
    ];
  }, [summary]);

  return (
    <div className="pb-16">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Bot size={24} />
          </div>
          <h1 className="text-4xl font-black italic tracking-tight text-gray-900 dark:text-white">
            Crawler Intake
          </h1>
          <p className="mt-2 font-bold text-gray-400 dark:text-slate-500">
            GitHub Actions 크롤러가 DB에 넣은 포스터를 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/posters"
            className="rounded-2xl bg-gray-900 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-black"
          >
            검수 화면으로
          </Link>
          <button
            type="button"
            onClick={fetchSummary}
            disabled={loading}
            className="flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-gray-600 shadow-sm ring-1 ring-gray-100 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-600">
          <XCircle size={18} />
          {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${card.color}`}>
              {card.icon}
            </div>
            <p className="text-3xl font-black text-gray-900 dark:text-white">
              {loading ? <span className="inline-block h-8 w-12 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" /> : card.value}
            </p>
            <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-gray-400">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-black text-gray-900 dark:text-white">출처별 최근 적재</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />)}
            </div>
          ) : summary?.sourceCounts.length ? (
            <div className="space-y-2">
              {summary.sourceCounts.slice(0, 8).map((item) => (
                <div key={item.source} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                  <span className="truncate text-xs font-black text-gray-600 dark:text-slate-300">{item.source}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-indigo-600 dark:bg-slate-900">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-sm font-bold text-gray-300">크롤러 적재 데이터가 없습니다.</p>
          )}
        </section>

        <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black text-gray-900 dark:text-white">최근 DB 적재 포스터</h2>
            <span className="text-[11px] font-black text-gray-300">source_key 기준</span>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-slate-800" />)}
            </div>
          ) : summary?.recent.length ? (
            <div className="space-y-4">
              {summary.recent.map((poster) => <PosterRow key={poster.id} poster={poster} />)}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center dark:border-slate-800">
              <Database className="mx-auto mb-4 text-gray-200 dark:text-slate-700" size={48} />
              <p className="text-sm font-black text-gray-400">아직 DB에 적재된 크롤러 포스터가 없습니다.</p>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-[2rem] border border-amber-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-black text-gray-900 dark:text-white">
            <AlertTriangle size={16} className="text-amber-500" />
            의심 데이터
          </h2>
          <span className="text-[11px] font-black text-gray-300">최근 500건 기준</span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-slate-800" />)}
          </div>
        ) : summary?.suspicious.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {summary.suspicious.map((poster) => (
              <PosterRow key={poster.id} poster={poster} showReasons />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-emerald-100 bg-emerald-50/40 py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={40} />
            <p className="text-sm font-black text-emerald-700">깨진 제목, 메타데이터 제목, 비포스터 이미지 의심 항목이 없습니다.</p>
          </div>
        )}
      </section>
    </div>
  );
}
