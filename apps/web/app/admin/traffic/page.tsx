"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ExternalLink,
  Globe2,
  Loader2,
  MousePointerClick,
  RefreshCcw,
  Route,
  Search,
  Users,
} from "lucide-react";

type Overview = {
  total_visitors: number;
  total_sessions: number;
  total_pageviews: number;
  period_visitors: number;
  period_sessions: number;
  period_pageviews: number;
  today_visitors: number;
  today_pageviews: number;
};

type SourceRow = {
  source: string;
  detail: string | null;
  visitors: number;
  sessions: number;
  pageviews: number;
};

type PathRow = {
  path: string;
  visitors: number;
  sessions: number;
  pageviews?: number;
};

type DailyRow = {
  date: string;
  visitors: number;
  sessions: number;
  pageviews: number;
};

type ClientPlatformRow = {
  key: string;
  label: string;
  visitors: number;
  sessions: number;
  pageviews: number;
};

type RecentVisit = {
  created_at: string;
  path: string;
  query_string: string | null;
  source: string;
  client_platform?: {
    key: string;
    label: string;
  } | null;
  referrer_host: string | null;
  referrer_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  user_agent?: string | null;
  user_id?: string | null;
  ip_hash?: string | null;
  visitor_key?: string | null;
  session_key?: string | null;
};

type TrafficData = {
  configured: boolean;
  overviewExact?: boolean;
  rangeDays: number;
  sampledRows?: number;
  generatedAt?: string;
  message?: string;
  overview?: Overview;
  sources?: SourceRow[];
  clientPlatforms?: ClientPlatformRow[];
  landingPages?: PathRow[];
  topPages?: PathRow[];
  daily?: DailyRow[];
  recentVisits?: RecentVisit[];
};

const DAY_OPTIONS = [7, 30, 90, 365];
const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatNumber(value: number | undefined) {
  return numberFormatter.format(value ?? 0);
}

function formatPercent(value: number | undefined, total: number | undefined) {
  if (!value || !total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatGeneratedAt(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortKey(value?: string | null) {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function identityLabel(row: RecentVisit) {
  if (row.user_id) return `user:${shortKey(row.user_id)}`;
  if (row.ip_hash) return `ip:${shortKey(row.ip_hash)}`;
  return shortKey(row.visitor_key);
}

function sourceTone(source: string) {
  const value = source.toLowerCase();
  if (value.includes("google")) return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200";
  if (value.includes("naver")) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200";
  if (value.includes("instagram") || value.includes("facebook") || value.includes("threads")) {
    return "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-200";
  }
  if (source.includes("직접")) return "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200";
  return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200";
}

function platformTone(key?: string | null) {
  if (key === "app") return "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200";
  if (key === "mobile_web") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200";
  if (key === "tablet_web") return "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200";
  if (key === "desktop_web") return "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200";
  return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200";
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subLabel,
}: {
  icon: typeof Users;
  label: string;
  value: number | undefined;
  subLabel: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white">
            {formatNumber(value)}
          </p>
        </div>
        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Icon size={20} />
        </div>
      </div>
      <p className="mt-3 text-xs font-bold text-gray-400">{subLabel}</p>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center text-sm font-bold text-gray-400 dark:border-slate-800 dark:bg-slate-900">
      {text}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Activity;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-black text-gray-950 dark:text-white">{title}</h2>
        <p className="text-xs font-bold text-gray-400">{subtitle}</p>
      </div>
      <Icon className="shrink-0 text-gray-300 dark:text-slate-600" size={20} />
    </div>
  );
}

export default function AdminTrafficPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTraffic = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/traffic?days=${days}`, { cache: "no-store" });
      const payload = (await response.json()) as TrafficData & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "방문 통계를 불러오지 못했습니다.");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "방문 통계를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTraffic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const maxDailyPageviews = useMemo(
    () => Math.max(1, ...(data?.daily ?? []).map((row) => row.pageviews)),
    [data?.daily]
  );
  const maxSourceSessions = useMemo(
    () => Math.max(1, ...(data?.sources ?? []).map((row) => row.sessions)),
    [data?.sources]
  );
  const maxPlatformSessions = useMemo(
    () => Math.max(1, ...(data?.clientPlatforms ?? []).map((row) => row.sessions)),
    [data?.clientPlatforms]
  );
  const maxTopPageViews = useMemo(
    () => Math.max(1, ...(data?.topPages ?? []).map((row) => row.pageviews ?? 0)),
    [data?.topPages]
  );

  const overview = data?.overview;
  const recentVisits = data?.recentVisits ?? [];
  const clientPlatforms = data?.clientPlatforms ?? [];
  const mobileWebSessions = clientPlatforms.find((row) => row.key === "mobile_web")?.sessions ?? 0;
  const appSessions = clientPlatforms.find((row) => row.key === "app")?.sessions ?? 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-500">Traffic</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-white">방문 통계</h1>
          <p className="mt-2 text-sm font-bold text-gray-500 dark:text-slate-400">
            누적 방문자와 유입 경로, 최근 방문 로그를 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={`rounded-md px-3 py-2 text-xs font-black transition-colors ${
                  days === option
                    ? "bg-gray-950 text-white dark:bg-white dark:text-slate-950"
                    : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {option === 365 ? "1년" : `${option}일`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loadTraffic}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-xs font-black text-gray-600 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            새로고침
          </button>
        </div>
      </header>

      {data?.generatedAt && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-400">
          <span>마지막 갱신 {formatGeneratedAt(data.generatedAt)}</span>
          <span>·</span>
          <span>분석 로그 {formatNumber(data.sampledRows)}건</span>
          {data.overviewExact === false && (
            <>
              <span>·</span>
              <span>일부 누적값은 최근 로그 기준입니다.</span>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex min-h-80 items-center justify-center rounded-lg border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : data?.configured === false ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="text-base font-black">방문 로그 테이블을 찾지 못했습니다.</p>
          <p className="mt-2">`supabase/migrations/20260718000000_add_site_visit_logs.sql` 적용 상태를 확인해주세요.</p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Users} label="전체 방문자" value={overview?.total_visitors} subLabel="중복 제외 방문자 기준" />
            <MetricCard icon={Activity} label={`${days}일 방문자`} value={overview?.period_visitors} subLabel="선택 기간 중복 제외" />
            <MetricCard icon={MousePointerClick} label={`${days}일 세션`} value={overview?.period_sessions} subLabel="브라우저 세션 기준" />
            <MetricCard icon={BarChart3} label={`${days}일 페이지뷰`} value={overview?.period_pageviews} subLabel="전체 페이지 이동 수" />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SectionTitle icon={Globe2} title="방문 환경" subtitle="앱, 모바일 웹, 데스크톱 웹 비중" />
            {clientPlatforms.length > 0 ? (
              <div className="grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-slate-800">
                    <p className="text-xs font-black text-gray-400">모바일 웹 비중</p>
                    <p className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
                      {formatPercent(mobileWebSessions, overview?.period_sessions)}
                    </p>
                    <p className="mt-1 text-xs font-bold text-gray-400">{formatNumber(mobileWebSessions)}세션</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-slate-800">
                    <p className="text-xs font-black text-gray-400">앱 비중</p>
                    <p className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
                      {formatPercent(appSessions, overview?.period_sessions)}
                    </p>
                    <p className="mt-1 text-xs font-bold text-gray-400">{formatNumber(appSessions)}세션</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {clientPlatforms.map((row) => (
                    <div key={row.key}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${platformTone(row.key)}`}>
                          {row.label}
                        </span>
                        <p className="text-xs font-black text-gray-500 dark:text-slate-300">
                          {formatNumber(row.sessions)}세션 · {formatPercent(row.sessions, overview?.period_sessions)}
                        </p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${Math.max(5, (row.sessions / maxPlatformSessions) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs font-bold text-gray-400">
                        방문자 {formatNumber(row.visitors)}명 · 페이지뷰 {formatNumber(row.pageviews)}건
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyBlock text="방문 환경 데이터가 없습니다." />
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <SectionTitle icon={CalendarDays} title="일별 추이" subtitle="방문자와 페이지뷰" />
              {(data?.daily ?? []).length > 0 ? (
                <div className="space-y-3">
                  {(data?.daily ?? []).map((row) => (
                    <div key={row.date} className="grid grid-cols-[84px_1fr_104px] items-center gap-3 text-xs">
                      <span className="font-black text-gray-500 dark:text-slate-300">{row.date.slice(5)}</span>
                      <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${Math.max(4, (row.pageviews / maxDailyPageviews) * 100)}%` }}
                        />
                      </div>
                      <span className="text-right font-black text-gray-900 dark:text-white">
                        {formatNumber(row.visitors)}명 / {formatNumber(row.pageviews)}뷰
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBlock text="선택한 기간에 방문 로그가 없습니다." />
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <SectionTitle icon={Globe2} title="오늘" subtitle="오늘 들어온 방문" />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-4 dark:bg-slate-800">
                  <p className="text-xs font-black text-gray-400">방문자</p>
                  <p className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
                    {formatNumber(overview?.today_visitors)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4 dark:bg-slate-800">
                  <p className="text-xs font-black text-gray-400">페이지뷰</p>
                  <p className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
                    {formatNumber(overview?.today_pageviews)}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs font-bold text-gray-400">
                총 페이지뷰 {formatNumber(overview?.total_pageviews)}건 · 총 세션 {formatNumber(overview?.total_sessions)}건
              </p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <SectionTitle icon={ExternalLink} title="유입 경로" subtitle="첫 방문 세션의 출처" />
              {(data?.sources ?? []).length > 0 ? (
                <div className="space-y-4">
                  {(data?.sources ?? []).map((row) => (
                    <div key={row.source}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-black ${sourceTone(row.source)}`}>
                            <span className="truncate">{row.source}</span>
                          </span>
                          {row.detail && <p className="mt-1 truncate text-xs font-bold text-gray-400">{row.detail}</p>}
                        </div>
                        <p className="shrink-0 text-xs font-black text-gray-500 dark:text-slate-300">
                          {formatNumber(row.sessions)}세션
                        </p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(5, (row.sessions / maxSourceSessions) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs font-bold text-gray-400">
                        방문자 {formatNumber(row.visitors)}명 · 페이지뷰 {formatNumber(row.pageviews)}건
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBlock text="유입 경로 데이터가 없습니다." />
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <SectionTitle icon={Route} title="랜딩 페이지" subtitle="처음 도착한 페이지" />
              {(data?.landingPages ?? []).length > 0 ? (
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {(data?.landingPages ?? []).map((row) => (
                    <div key={row.path} className="flex items-center justify-between gap-4 py-3">
                      <span className="min-w-0 truncate text-sm font-black text-gray-900 dark:text-white">{row.path}</span>
                      <span className="shrink-0 text-xs font-black text-gray-400">{formatNumber(row.sessions)}세션</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBlock text="랜딩 페이지 데이터가 없습니다." />
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SectionTitle icon={Search} title="많이 본 페이지" subtitle="선택 기간 페이지뷰 기준" />
            {(data?.topPages ?? []).length > 0 ? (
              <div className="space-y-3">
                {(data?.topPages ?? []).map((row) => (
                  <div key={row.path} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="truncate font-black text-gray-900 dark:text-white">{row.path}</span>
                        <span className="shrink-0 text-xs font-black text-gray-400">{formatNumber(row.pageviews)}뷰</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${Math.max(5, ((row.pageviews ?? 0) / maxTopPageViews) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-right text-xs font-bold text-gray-400">{formatNumber(row.visitors)}명</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyBlock text="페이지뷰 데이터가 없습니다." />
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SectionTitle icon={Activity} title="최근 방문 로그" subtitle="최근 80건" />
            {recentVisits.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs font-black uppercase tracking-widest text-gray-400 dark:border-slate-800">
                      <th className="py-3 pr-4">시간</th>
                      <th className="py-3 pr-4">페이지</th>
                      <th className="py-3 pr-4">유입</th>
                      <th className="py-3 pr-4">환경</th>
                      <th className="py-3 pr-4">UTM</th>
                      <th className="py-3 pr-4">방문자</th>
                      <th className="py-3 pr-4">세션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {recentVisits.map((row, index) => (
                      <tr key={`${row.created_at}-${index}`} className="align-top">
                        <td className="whitespace-nowrap py-3 pr-4 text-xs font-bold text-gray-500">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="max-w-[360px] py-3 pr-4">
                          <span className="block truncate font-black text-gray-900 dark:text-white">
                            {row.path}
                            {row.query_string ?? ""}
                          </span>
                          {row.user_agent && (
                            <span className="mt-1 block truncate text-xs font-bold text-gray-400">{row.user_agent}</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${sourceTone(row.source)}`}>
                            {row.source}
                          </span>
                          {row.referrer_host && (
                            <span className="mt-1 block text-xs font-bold text-gray-400">{row.referrer_host}</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${platformTone(row.client_platform?.key)}`}>
                            {row.client_platform?.label ?? "알 수 없음"}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs font-bold text-gray-400">
                          {[row.utm_source, row.utm_medium, row.utm_campaign].filter(Boolean).join(" / ") || "-"}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 text-xs font-bold text-gray-500">
                          {identityLabel(row)}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 text-xs font-bold text-gray-500">
                          {shortKey(row.session_key)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyBlock text="최근 방문 로그가 없습니다." />
            )}
          </section>
        </>
      )}
    </div>
  );
}
