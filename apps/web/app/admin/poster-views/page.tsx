"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, MousePointerClick, RefreshCcw, Search, Users } from "lucide-react";

import {
  DEFAULT_POSTER_VIEW_PERIOD,
  POSTER_VIEW_PERIOD_DAYS,
  type PosterViewPeriodDays,
  type PosterViewStat,
  type PosterViewTotals,
} from "../../../lib/posterViewStats";

type PosterViewRow = PosterViewStat & {
  title: string | null;
  status: string | null;
  applicationEndAt: string | null;
  missing: boolean;
};

type PosterViewResponse = {
  days: PosterViewPeriodDays;
  since: string;
  generatedAt: string;
  truncated: boolean;
  totals: PosterViewTotals;
  rows: PosterViewRow[];
};

const PAGE_STEP = 50;

const STATUS_LABELS: Record<string, string> = {
  draft: "임시저장",
  review: "검수 대기",
  published: "게시 중",
  hidden: "숨김",
  rejected: "반려",
  closed: "마감",
  archived: "보관",
};

const STATUS_TONES: Record<string, string> = {
  published: "bg-emerald-50 text-emerald-700",
  review: "bg-amber-50 text-amber-700",
  closed: "bg-gray-100 text-gray-600",
  rejected: "bg-rose-50 text-rose-700",
};

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateTimeFormatter.format(date);
}

function periodLabel(days: number) {
  return days === 90 ? "최근 90일(보관 기간 전체)" : `최근 ${days}일`;
}

export default function AdminPosterViewsPage() {
  const [days, setDays] = useState<PosterViewPeriodDays>(DEFAULT_POSTER_VIEW_PERIOD);
  const [data, setData] = useState<PosterViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);

  const load = useCallback(async (period: PosterViewPeriodDays) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/poster-views?days=${period}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Partial<PosterViewResponse> & {
        error?: string;
      };
      if (!response.ok || !payload.rows || !payload.totals) {
        throw new Error(payload.error || "조회수를 불러오지 못했습니다.");
      }
      setData(payload as PosterViewResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "조회수를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  useEffect(() => {
    setVisibleCount(PAGE_STEP);
  }, [days, query]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        (row.title ?? "").toLowerCase().includes(needle) || row.posterId.toLowerCase().includes(needle),
    );
  }, [data?.rows, query]);

  const visibleRows = filteredRows.slice(0, visibleCount);
  const rankById = useMemo(
    () => new Map((data?.rows ?? []).map((row, index) => [row.posterId, index + 1])),
    [data?.rows],
  );
  const totals = data?.totals;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-500">Poster Views</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-950">포스터 조회수</h1>
          <p className="mt-2 text-sm font-bold text-gray-500">
            포스터 상세 화면이 열린 횟수를 포스터별로 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm"
            role="group"
            aria-label="집계 기간"
          >
            {POSTER_VIEW_PERIOD_DAYS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={days === option}
                onClick={() => setDays(option)}
                className={`rounded-md px-3 py-2 text-xs font-black transition-colors ${
                  days === option ? "bg-gray-950 text-white" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {option}일
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load(days)}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-xs font-black text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            새로고침
          </button>
        </div>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5 text-sm" aria-label="조회수 집계 기준">
        <details>
          <summary className="cursor-pointer font-black">집계 기준과 한계 (한국 시간)</summary>
          <ul className="mt-3 list-disc space-y-1 pl-5 font-bold text-gray-600">
            <li>
              조회수는 포스터 상세 화면이 열린 횟수입니다. 같은 브라우저에서 30분 안에 같은 포스터를 다시 열면 한 번으로
              셉니다.
            </li>
            <li>
              조회 원본 기록은 개인정보 보관 기준에 따라 3개월이 지나면 삭제되므로, 그보다 오래된 조회는 집계되지
              않습니다.
            </li>
            <li>
              관리자·운영자 본인의 조회와 자동 접속(봇)을 구분하지 못해 모두 포함됩니다. 방문자 수는 브라우저 기준
              추정치입니다.
            </li>
            <li>링크 클릭은 같은 기간에 상세 화면에서 원문·신청 링크를 누른 횟수입니다.</li>
          </ul>
        </details>
      </section>

      {data?.truncated && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          기록이 너무 많아 일부만 집계했습니다. 기간을 줄여서 확인해 주세요.
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={`${periodLabel(days)} 요약`}>
        {[
          { label: "전체 조회수", value: totals?.views, icon: Eye },
          { label: "조회된 포스터", value: totals?.viewedPosters, icon: Search },
          { label: "방문자(추정)", value: totals?.uniqueVisitors, icon: Users },
          { label: "링크 클릭", value: totals?.linkClicks, icon: MousePointerClick },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-black text-gray-500">
              <Icon size={14} aria-hidden="true" />
              {label}
            </div>
            <p className="mt-2 text-2xl font-black text-gray-950">
              {loading && !data ? "…" : (value ?? 0).toLocaleString("ko-KR")}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-black text-gray-950">
            {periodLabel(days)} 조회수 순위
            {data && (
              <span className="ml-2 text-sm font-bold text-gray-500">
                {query ? `${filteredRows.length.toLocaleString("ko-KR")}건 일치` : `${data.rows.length.toLocaleString("ko-KR")}건`}
              </span>
            )}
          </h2>
          <label className="relative block sm:w-72">
            <span className="sr-only">포스터 제목으로 검색</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="포스터 제목 검색"
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm font-bold text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </label>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-gray-500">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" /> 조회수를 집계하는 중입니다.
          </div>
        ) : !data ? null : filteredRows.length === 0 ? (
          <p className="py-16 text-center text-sm font-bold text-gray-500">
            {query ? "검색어와 일치하는 포스터가 없습니다." : `${periodLabel(days)} 동안 조회된 포스터가 없습니다.`}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm sm:min-w-[760px]">
                <caption className="sr-only">{periodLabel(days)} 포스터별 상세 화면 조회수</caption>
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-black text-gray-500">
                    <th scope="col" className="w-12 py-3 pr-3 text-right">순위</th>
                    <th scope="col" className="py-3 pr-4">포스터</th>
                    <th scope="col" className="whitespace-nowrap py-3 pr-1 text-right sm:pr-4">조회수</th>
                    <th scope="col" className="hidden py-3 pr-4 text-right sm:table-cell">최근 7일</th>
                    <th scope="col" className="hidden py-3 pr-4 text-right sm:table-cell">방문자</th>
                    <th scope="col" className="hidden py-3 pr-4 text-right sm:table-cell">링크 클릭</th>
                    <th scope="col" className="hidden py-3 pr-1 text-right sm:table-cell">마지막 조회</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleRows.map((row) => (
                    <tr key={row.posterId} className="align-top">
                      <td className="py-3 pr-3 text-right text-xs font-black tabular-nums text-gray-400">
                        {rankById.get(row.posterId)}
                      </td>
                      <td className="py-3 pr-3 sm:max-w-[420px] sm:pr-4">
                        {row.missing ? (
                          <span className="font-bold text-gray-400">포스터 정보를 불러오지 못했습니다</span>
                        ) : (
                          <Link
                            href={`/posters/${row.posterId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block font-black text-gray-900 sm:truncate hover:text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                            title={row.title ?? undefined}
                          >
                            {row.title || "제목 없음"}
                          </Link>
                        )}
                        {row.status && (
                          <span
                            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${
                              STATUS_TONES[row.status] ?? "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {STATUS_LABELS[row.status] ?? row.status}
                          </span>
                        )}
                        <span className="mt-1 block text-xs font-bold text-gray-500 sm:hidden">
                          최근 7일 {row.views7d.toLocaleString("ko-KR")} · 방문자 {row.uniqueVisitors.toLocaleString("ko-KR")} · 클릭{" "}
                          {row.linkClicks.toLocaleString("ko-KR")} · 마지막 {formatDateTime(row.lastViewedAt)}
                        </span>
                      </td>
                      <td className="py-3 pr-1 text-right text-base font-black tabular-nums text-gray-950 sm:pr-4">
                        {row.views.toLocaleString("ko-KR")}
                      </td>
                      <td className="hidden py-3 pr-4 text-right font-bold tabular-nums text-gray-700 sm:table-cell">
                        {row.views7d.toLocaleString("ko-KR")}
                      </td>
                      <td className="hidden py-3 pr-4 text-right font-bold tabular-nums text-gray-700 sm:table-cell">
                        {row.uniqueVisitors.toLocaleString("ko-KR")}
                      </td>
                      <td className="hidden py-3 pr-4 text-right font-bold tabular-nums text-gray-700 sm:table-cell">
                        {row.linkClicks.toLocaleString("ko-KR")}
                      </td>
                      <td className="hidden whitespace-nowrap py-3 pr-1 text-right text-xs font-bold text-gray-500 sm:table-cell">
                        {formatDateTime(row.lastViewedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredRows.length > visibleCount && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + PAGE_STEP)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-600 shadow-sm hover:bg-gray-50"
                >
                  더 보기 ({(filteredRows.length - visibleCount).toLocaleString("ko-KR")}건 남음)
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
