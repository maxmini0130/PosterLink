"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";

type CollectionSource = {
  id: string;
  source_slug: string;
  name: string;
  source_type: string;
  region_scope: string | null;
  region_name: string | null;
  homepage_url: string | null;
  list_url: string;
  collection_method: string;
  collection_interval_minutes: number;
  priority: number;
  status: string;
  reliability: string;
  is_public: boolean;
  manager_contact: string | null;
  monthly_expected_posts: number;
  valid_post_rate: number;
  last_collected_at: string | null;
  last_success_at: string | null;
  latest_post_found_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  consecutive_error_count: number;
  last_run_status: string | null;
  last_run_checked_count: number;
  last_run_new_count: number;
  last_run_valid_count: number;
  last_run_duplicate_count: number;
  last_run_rejected_count: number;
  average_delay_hours: number | null;
  required_field_missing_rate: number;
  config_json: Record<string, any> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type SourceSummary = {
  total: number;
  active: number;
  automated: number;
  errors: number;
  planned: number;
  due: number;
  stale: number;
  low_quality: number;
  needs_attention: number;
  monthly_expected_posts: number;
  average_valid_post_rate: number;
  status_counts: Record<string, number>;
  type_counts: Record<string, number>;
};

type CollectionSourceRun = {
  id: string;
  source_id: string | null;
  source_slug: string;
  source_name: string | null;
  run_phase: string;
  run_status: string;
  checked_count: number;
  new_count: number;
  valid_count: number;
  duplicate_count: number;
  rejected_count: number;
  failed_count: number;
  valid_post_rate: number;
  error_message: string | null;
  metadata_json: Record<string, any> | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
};

type ApiPayload = {
  configured: boolean;
  sources: CollectionSource[];
  recent_runs?: CollectionSourceRun[];
  summary: SourceSummary;
  message?: string;
};

type RunResult = {
  sourceName: string;
  logs: string;
  resultFile?: string | null;
  uploaded?: boolean;
  workflowUrl?: string | null;
};

const TYPE_OPTIONS = [
  ["central_portal", "중앙 포털"],
  ["local_government", "지자체"],
  ["foundation", "재단"],
  ["youth_center", "청년센터"],
  ["startup", "창업"],
  ["welfare", "복지"],
  ["culture", "문화"],
  ["education", "교육"],
  ["library", "도서관"],
  ["sports", "체육"],
  ["university", "대학"],
  ["public_employment", "공공채용"],
  ["open_data", "공공데이터"],
  ["other", "기타"],
] as const;

const METHOD_OPTIONS = [
  ["api", "API"],
  ["rss", "RSS"],
  ["json", "JSON"],
  ["html", "HTML"],
  ["attachment", "첨부파일"],
  ["manual", "수동"],
  ["mixed", "혼합"],
] as const;

const STATUS_OPTIONS = [
  ["planned", "예정"],
  ["active", "정상"],
  ["paused", "중지"],
  ["error", "오류"],
  ["blocked", "차단"],
  ["retired", "종료"],
] as const;

const RELIABILITY_OPTIONS = [
  ["high", "상"],
  ["medium", "중"],
  ["low", "하"],
] as const;

const EMPTY_FORM = {
  source_slug: "",
  name: "",
  source_type: "local_government",
  region_scope: "sigungu",
  region_name: "",
  homepage_url: "",
  list_url: "",
  collection_method: "html",
  collection_interval_minutes: 720,
  priority: 50,
  status: "planned",
  reliability: "medium",
  monthly_expected_posts: 10,
  config_json: "{\n  \"adapter\": \"generic-board\",\n  \"maxPages\": 2,\n  \"selectors\": {}\n}",
  notes: "",
};

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatNumber(value: number | undefined | null) {
  return numberFormatter.format(value ?? 0);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200";
  if (status === "planned") return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200";
  if (status === "paused" || status === "retired") return "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200";
  return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200";
}

type SourceHealthLevel = "attention" | "watch" | "healthy" | "planned";

type SourceHealth = {
  level: SourceHealthLevel;
  label: string;
  tone: string;
  reasons: string[];
  weight: number;
};

const HEALTH_FILTER_OPTIONS = [
  ["all", "전체 건강도"],
  ["attention", "점검 필요"],
  ["watch", "주의"],
  ["healthy", "정상"],
  ["planned", "예정/수동"],
] as const;

function runStatusTone(status: string) {
  if (status === "running") return "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200";
  if (status === "success") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200";
  if (status === "empty") return "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200";
  if (status === "partial") return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200";
  return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200";
}

function runPhaseLabel(value: string) {
  if (value === "crawl") return "수집";
  if (value === "upload") return "업로드";
  return "전체";
}

function runStatusLabel(value: string) {
  if (value === "running") return "실행 중";
  if (value === "success") return "성공";
  if (value === "partial") return "부분 오류";
  if (value === "error") return "오류";
  if (value === "empty") return "비어 있음";
  return value;
}

function formatDuration(ms: number | null) {
  if (!ms) return "-";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  return `${Math.round(seconds / 60)}분`;
}

function getRunDiagnostic(run: CollectionSourceRun) {
  const metadata = run.metadata_json;
  if (!metadata || typeof metadata !== "object") return "";

  const sites = Array.isArray(metadata.sites) ? metadata.sites : [];
  const summaries = sites
    .map((site: any) => site?.summary)
    .filter((summary: any) => summary && typeof summary === "object");

  const totals = summaries.reduce((acc: Record<string, number>, summary: Record<string, any>) => {
    for (const [key, value] of Object.entries(summary)) {
      const numberValue = Number(value ?? 0);
      if (Number.isFinite(numberValue)) acc[key] = (acc[key] ?? 0) + numberValue;
    }
    return acc;
  }, {});

  const parts: string[] = [];
  const found = totals.found ?? totals.checked ?? 0;
  if (found > 0) parts.push(`발견 ${formatNumber(found)}건`);
  if ((totals.collected ?? 0) > 0) parts.push(`수집후보 ${formatNumber(totals.collected)}건`);
  if ((totals.post_filtered ?? 0) > 0) parts.push(`제목제외 ${formatNumber(totals.post_filtered)}건`);
  if ((totals.no_poster_image ?? 0) > 0) parts.push(`이미지없음 ${formatNumber(totals.no_poster_image)}건`);
  if ((totals.image_rule_rejected ?? 0) > 0) parts.push(`이미지규칙제외 ${formatNumber(totals.image_rule_rejected)}건`);
  if ((totals.verification_rejected ?? 0) > 0) parts.push(`AI검증제외 ${formatNumber(totals.verification_rejected)}건`);
  if ((totals.skipped_seen ?? 0) > 0) parts.push(`이미확인 ${formatNumber(totals.skipped_seen)}건`);
  if ((totals.detail_failed ?? 0) + (totals.board_failed ?? 0) > 0) {
    parts.push(`파싱실패 ${formatNumber((totals.detail_failed ?? 0) + (totals.board_failed ?? 0))}건`);
  }

  const reasons = Object.entries(metadata.skip_reasons ?? {})
    .sort(([, a], [, b]) => Number(b ?? 0) - Number(a ?? 0))
    .slice(0, 2)
    .map(([key, value]) => `${key} ${formatNumber(Number(value ?? 0))}`);
  if (reasons.length > 0) parts.push(`주요 사유: ${reasons.join(", ")}`);

  return parts.join(" · ");
}

function parseTime(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function elapsedHours(value: string | null) {
  const timestamp = parseTime(value);
  if (!timestamp) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / (60 * 60 * 1000)));
}

function formatElapsedHours(hours: number | null) {
  if (hours === null) return "기록 없음";
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

function parseConfigJsonInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("설정 JSON은 객체 형태여야 합니다.");
  }
  return parsed;
}

function formatConfigJson(value: Record<string, any> | null | undefined) {
  return JSON.stringify(value && typeof value === "object" ? value : {}, null, 2);
}

function getSourceHealth(source: CollectionSource): SourceHealth {
  if (source.status === "planned" || source.collection_method === "manual") {
    return {
      level: "planned",
      label: source.status === "planned" ? "예정" : "수동",
      tone: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200",
      reasons: [source.status === "planned" ? "아직 자동수집 전" : "수동 관리 기관"],
      weight: 10,
    };
  }

  const reasons: string[] = [];
  const checkedCount = Number(source.last_run_checked_count ?? 0);
  const validRate = Number(source.valid_post_rate ?? 0);
  const missingRate = Number(source.required_field_missing_rate ?? 0);
  const hoursSinceSuccess = elapsedHours(source.last_success_at);
  const hoursSinceCollected = elapsedHours(source.last_collected_at);
  const intervalHours = Math.max(1, Math.round(source.collection_interval_minutes / 60));
  const isDue = source.status === "active" && (
    hoursSinceCollected === null || hoursSinceCollected >= intervalHours
  );
  const isStale = source.status === "active" && (
    hoursSinceSuccess === null || hoursSinceSuccess >= Math.max(intervalHours * 2, 48)
  );

  if (source.status === "error" || source.status === "blocked") reasons.push(statusLabel(source.status));
  if (source.consecutive_error_count > 0) reasons.push(`${source.consecutive_error_count}회 연속 오류`);
  if (source.last_run_status === "error" || source.last_run_status === "partial") reasons.push(`최근 실행 ${source.last_run_status}`);
  if (isStale) reasons.push(`마지막 성공 ${formatElapsedHours(hoursSinceSuccess)}`);
  if (checkedCount >= 5 && validRate < 40) reasons.push(`유효율 ${Math.round(validRate)}%`);
  if (checkedCount >= 5 && missingRate >= 30) reasons.push(`필수정보 누락 ${Math.round(missingRate)}%`);

  if (reasons.length > 0) {
    return {
      level: "attention",
      label: "점검 필요",
      tone: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200",
      reasons,
      weight: 100 + reasons.length,
    };
  }

  if (isDue || source.status === "paused") {
    return {
      level: "watch",
      label: isDue ? "수집 예정" : "중지",
      tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200",
      reasons: [isDue ? `수집 주기 ${intervalHours}시간 경과` : "운영자가 중지함"],
      weight: 50,
    };
  }

  return {
    level: "healthy",
    label: "정상",
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
    reasons: ["최근 수집 정상"],
    weight: 0,
  };
}

function typeLabel(value: string) {
  return TYPE_OPTIONS.find(([key]) => key === value)?.[1] ?? value;
}

function methodLabel(value: string) {
  return METHOD_OPTIONS.find(([key]) => key === value)?.[1] ?? value;
}

function statusLabel(value: string) {
  return STATUS_OPTIONS.find(([key]) => key === value)?.[1] ?? value;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white">{formatNumber(value)}</p>
        </div>
        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Icon size={20} />
        </div>
      </div>
      <p className="mt-3 text-xs font-bold text-gray-400">{sub}</p>
    </div>
  );
}

export default function AdminCollectionSourcesPage() {
  const [sources, setSources] = useState<CollectionSource[]>([]);
  const [recentRuns, setRecentRuns] = useState<CollectionSourceRun[]>([]);
  const [summary, setSummary] = useState<SourceSummary | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  const loadSources = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/collection-sources?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json()) as ApiPayload & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "수집 기관을 불러오지 못했습니다.");
      setConfigured(payload.configured);
      setSources(payload.sources ?? []);
      setRecentRuns(payload.recent_runs ?? []);
      setSummary(payload.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "수집 기관을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredSources = useMemo(() => {
    return [...sources]
      .filter((source) => {
        if (healthFilter === "all") return true;
        return getSourceHealth(source).level === healthFilter;
      })
      .sort((a, b) => {
        const healthDiff = getSourceHealth(b).weight - getSourceHealth(a).weight;
        if (healthDiff !== 0) return healthDiff;
        return b.priority - a.priority;
      });
  }, [healthFilter, sources]);

  const createSource = async () => {
    if (!form.source_slug.trim() || !form.name.trim() || !form.list_url.trim()) {
      toast.error("기관 코드, 기관명, 게시판 URL은 필수입니다.");
      return;
    }

    setSaving(true);
    try {
      const configJson = parseConfigJsonInput(form.config_json);
      const res = await fetch("/api/admin/collection-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, config_json: configJson }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "기관을 등록하지 못했습니다.");
      toast.success("수집 기관을 등록했습니다.");
      setForm({ ...EMPTY_FORM });
      await loadSources();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "기관을 등록하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const updateSourceConfig = async (source: CollectionSource) => {
    const nextConfig = prompt("고급 설정 JSON", formatConfigJson(source.config_json));
    if (nextConfig === null) return;

    try {
      const configJson = parseConfigJsonInput(nextConfig);
      await updateSource(source, { config_json: configJson } as Partial<CollectionSource>);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "설정 JSON을 해석하지 못했습니다.");
    }
  };

  const updateSource = async (source: CollectionSource, patch: Partial<CollectionSource>) => {
    const previous = sources;
    setSources((rows) => rows.map((row) => (row.id === source.id ? { ...row, ...patch } : row)));

    try {
      const res = await fetch("/api/admin/collection-sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: source.id, ...patch }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "수정하지 못했습니다.");
      toast.success("저장했습니다.");
    } catch (err) {
      setSources(previous);
      toast.error(err instanceof Error ? err.message : "수정하지 못했습니다.");
    }
  };

  const runSource = async (source: CollectionSource) => {
    setRunningSourceId(source.id);
    setRunResult(null);

    try {
      const res = await fetch("/api/admin/crawler/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: source.source_slug, upload: true }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "수집 실행에 실패했습니다.");

      setRunResult({
        sourceName: source.name,
        logs: [
          "GitHub Actions 백그라운드 수집을 시작했습니다.",
          `Source: ${source.source_slug}`,
          payload?.workflowUrl ? `Workflow: ${payload.workflowUrl}` : null,
          "워크플로가 끝난 뒤 이 페이지를 새로고침하면 수집 이력에서 결과를 확인할 수 있습니다.",
        ].filter(Boolean).join("\n"),
        resultFile: null,
        uploaded: false,
        workflowUrl: payload?.workflowUrl ?? null,
      });
      toast.success(`${source.name} 백그라운드 수집을 시작했습니다.`);
      await loadSources();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수집 실행에 실패했습니다.");
    } finally {
      setRunningSourceId(null);
    }
  };

  const deleteSource = async (source: CollectionSource) => {
    if (!confirm(`${source.name} 수집 기관을 삭제할까요?`)) return;
    try {
      const res = await fetch(`/api/admin/collection-sources?id=${source.id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "삭제하지 못했습니다.");
      toast.success("삭제했습니다.");
      await loadSources();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제하지 못했습니다.");
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-500">Collection Sources</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-white">수집 기관 관리</h1>
          <p className="mt-2 text-sm font-bold text-gray-500 dark:text-slate-400">
            기관과 게시판 URL, 수집 방식, 상태를 관리해서 공고 부족 원인을 추적합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSources}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-xs font-black text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
          새로고침
        </button>
      </header>

      {!configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-800">
          `supabase/migrations/20260719000000_add_collection_sources.sql` 마이그레이션 적용이 필요합니다.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>
      )}

      {runResult && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-200">Last Collection Run</p>
              <h2 className="mt-1 text-lg font-black text-gray-950 dark:text-white">{runResult.sourceName}</h2>
              <p className="mt-1 text-xs font-bold text-emerald-700 dark:text-emerald-200">
                {runResult.workflowUrl ? "GitHub Actions에서 백그라운드 수집을 시작했습니다." : runResult.uploaded ? "수집 결과를 Supabase에 업로드했습니다." : "수집 결과 파일이 없어 업로드를 건너뛰었습니다."}
                {runResult.resultFile ? ` · ${runResult.resultFile}` : ""}
              </p>
              {runResult.workflowUrl && (
                <a
                  href={runResult.workflowUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-black text-emerald-700 shadow-sm ring-1 ring-emerald-200 transition-colors hover:bg-emerald-100 dark:bg-slate-950 dark:text-emerald-200 dark:ring-emerald-500/20"
                >
                  <ExternalLink size={13} />
                  GitHub Actions
                </a>
              )}
            </div>
          </div>
          {runResult.logs && (
            <pre className="mt-4 max-h-72 overflow-auto rounded-lg bg-gray-950 p-4 text-xs font-bold leading-6 text-gray-100">
              {runResult.logs.slice(-8000)}
            </pre>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard icon={Building2} label="관리 기관" value={summary?.total ?? 0} sub="등록된 기관/게시판" />
        <MetricCard icon={CheckCircle2} label="자동수집" value={summary?.automated ?? 0} sub="수동 제외 수집원" />
        <MetricCard icon={Database} label="월 예상 공고" value={summary?.monthly_expected_posts ?? 0} sub="계획 수립용 가정" />
        <MetricCard icon={AlertTriangle} label="오류 기관" value={summary?.errors ?? 0} sub="점검 필요 상태" />
        <MetricCard icon={Search} label="점검 필요" value={summary?.needs_attention ?? 0} sub="오류·장기 미수집·저품질" />
        <MetricCard icon={Clock} label="예정 기관" value={summary?.planned ?? 0} sub="아직 연결 전" />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-indigo-500" />
            <h2 className="text-lg font-black text-gray-950 dark:text-white">최근 수집 이력</h2>
          </div>
          <span className="text-xs font-black text-gray-400">최근 30건</span>
        </div>

        {recentRuns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-black uppercase tracking-widest text-gray-400 dark:border-slate-800">
                  <th className="py-3 pr-4">기관</th>
                  <th className="py-3 pr-4">단계</th>
                  <th className="py-3 pr-4">상태</th>
                  <th className="py-3 pr-4">결과</th>
                  <th className="py-3 pr-4">소요</th>
                  <th className="py-3 pr-4">실행 시각</th>
                  <th className="py-3 pr-4">오류</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {recentRuns.slice(0, 12).map((run) => (
                  <tr key={run.id} className="align-top">
                    <td className="max-w-[220px] py-3 pr-4">
                      <p className="truncate font-black text-gray-950 dark:text-white">{run.source_name || run.source_slug}</p>
                      <p className="mt-1 truncate text-xs font-bold text-gray-400">{run.source_slug}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">
                        {runPhaseLabel(run.run_phase)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${runStatusTone(run.run_status)}`}>
                        {runStatusLabel(run.run_status)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs font-bold text-gray-500">
                      <p>확인 {formatNumber(run.checked_count)} · 신규 {formatNumber(run.new_count)} · 유효 {formatNumber(run.valid_count)}</p>
                      <p className="mt-1 text-gray-400">중복 {formatNumber(run.duplicate_count)} · 제외 {formatNumber(run.rejected_count)} · 실패 {formatNumber(run.failed_count)}</p>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-xs font-bold text-gray-500">{formatDuration(run.duration_ms)}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-xs font-bold text-gray-500">{formatDate(run.created_at)}</td>
                    <td className="max-w-[260px] py-3 pr-4 text-xs font-bold text-gray-400">
                      {run.error_message ? (
                        <p className="line-clamp-2 text-rose-500">{run.error_message}</p>
                      ) : getRunDiagnostic(run) ? (
                        <p className="line-clamp-3">{getRunDiagnostic(run)}</p>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm font-bold text-gray-400 dark:border-slate-800">
            아직 저장된 수집 실행 이력이 없습니다.
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center gap-2">
          <Plus size={18} className="text-indigo-500" />
          <h2 className="text-lg font-black text-gray-950 dark:text-white">기관 추가</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={form.source_slug}
            onChange={(event) => setForm((prev) => ({ ...prev, source_slug: event.target.value }))}
            placeholder="기관 코드 예: mapo-gu"
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950"
          />
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="기관명"
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950"
          />
          <select
            value={form.source_type}
            onChange={(event) => setForm((prev) => ({ ...prev, source_type: event.target.value }))}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950"
          >
            {TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input
            value={form.region_name}
            onChange={(event) => setForm((prev) => ({ ...prev, region_name: event.target.value }))}
            placeholder="지역 예: 서울특별시 마포구"
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950"
          />
          <input
            value={form.homepage_url}
            onChange={(event) => setForm((prev) => ({ ...prev, homepage_url: event.target.value }))}
            placeholder="홈페이지 URL"
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950"
          />
          <input
            value={form.list_url}
            onChange={(event) => setForm((prev) => ({ ...prev, list_url: event.target.value }))}
            placeholder="게시판/목록 URL"
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950"
          />
          <select
            value={form.collection_method}
            onChange={(event) => setForm((prev) => ({ ...prev, collection_method: event.target.value }))}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950"
          >
            {METHOD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <textarea
            value={form.config_json}
            onChange={(event) => setForm((prev) => ({ ...prev, config_json: event.target.value }))}
            placeholder="고급 설정 JSON"
            rows={5}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 font-mono text-xs font-bold outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 md:col-span-2 xl:col-span-3"
          />
          <button
            type="button"
            onClick={createSource}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            등록
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Settings2 size={18} className="text-indigo-500" />
            <h2 className="text-lg font-black text-gray-950 dark:text-white">수집 운영 현황</h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 dark:border-slate-800 dark:bg-slate-950">
              <Search size={15} className="text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadSources();
                }}
                placeholder="기관명/지역 검색"
                className="h-10 bg-transparent text-sm font-bold outline-none placeholder:text-gray-400"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-black outline-none dark:border-slate-800 dark:bg-slate-950"
            >
              <option value="all">전체 상태</option>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select
              value={healthFilter}
              onChange={(event) => setHealthFilter(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-black outline-none dark:border-slate-800 dark:bg-slate-950"
            >
              {HEALTH_FILTER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button
              type="button"
              onClick={loadSources}
              className="h-10 rounded-lg bg-gray-950 px-4 text-xs font-black text-white"
            >
              검색
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : filteredSources.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-black uppercase tracking-widest text-gray-400 dark:border-slate-800">
                  <th className="py-3 pr-4">기관</th>
                  <th className="py-3 pr-4">분류</th>
                  <th className="py-3 pr-4">방식</th>
                  <th className="py-3 pr-4">상태</th>
                  <th className="py-3 pr-4">점검</th>
                  <th className="py-3 pr-4">우선</th>
                  <th className="py-3 pr-4">최근 성공</th>
                  <th className="py-3 pr-4">신규/유효</th>
                  <th className="py-3 pr-4">오류</th>
                  <th className="py-3 pr-4">링크</th>
                  <th className="py-3 pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {filteredSources.map((source) => {
                  const health = getSourceHealth(source);
                  return (
                  <tr key={source.id} className="align-top">
                    <td className="max-w-[260px] py-3 pr-4">
                      <p className="font-black text-gray-950 dark:text-white">{source.name}</p>
                      <p className="mt-1 truncate text-xs font-bold text-gray-400">{source.source_slug} · {source.region_name ?? source.region_scope}</p>
                      {source.notes && <p className="mt-1 line-clamp-2 text-xs font-bold text-gray-400">{source.notes}</p>}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black text-gray-700 dark:bg-slate-800 dark:text-slate-200">
                        {typeLabel(source.source_type)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-black text-gray-700 dark:text-slate-200">{methodLabel(source.collection_method)}</span>
                      <p className="mt-1 text-xs font-bold text-gray-400">{Math.round(source.collection_interval_minutes / 60)}시간 주기</p>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        value={source.status}
                        onChange={(event) => void updateSource(source, { status: event.target.value } as Partial<CollectionSource>)}
                        className={`rounded-full border-none px-2.5 py-1 text-xs font-black outline-none ${statusTone(source.status)}`}
                      >
                        {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    <td className="max-w-[220px] py-3 pr-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${health.tone}`}>
                        {health.label}
                      </span>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {health.reasons.slice(0, 3).map((reason) => (
                          <span key={reason} className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-500 dark:bg-slate-800 dark:text-slate-300">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={source.priority}
                        onChange={(event) => void updateSource(source, { priority: Number(event.target.value) } as Partial<CollectionSource>)}
                        className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-black outline-none dark:border-slate-800 dark:bg-slate-950"
                      />
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-xs font-bold text-gray-500">
                      {formatDate(source.last_success_at)}
                      <p className="mt-1 text-gray-400">최근 공고 {formatDate(source.latest_post_found_at)}</p>
                    </td>
                    <td className="py-3 pr-4 text-xs font-bold text-gray-500">
                      <p>신규 {formatNumber(source.last_run_new_count)} · 유효 {formatNumber(source.last_run_valid_count)}</p>
                      <p className="mt-1 text-gray-400">중복 {formatNumber(source.last_run_duplicate_count)} · 제외 {formatNumber(source.last_run_rejected_count)}</p>
                    </td>
                    <td className="max-w-[220px] py-3 pr-4 text-xs font-bold text-gray-500">
                      {source.consecutive_error_count > 0 ? (
                        <>
                          <p className="font-black text-rose-600">{source.consecutive_error_count}회 연속</p>
                          <p className="mt-1 line-clamp-2 text-gray-400">{source.last_error_message}</p>
                        </>
                      ) : (
                        <span className="text-emerald-600">-</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex gap-2">
                        {source.homepage_url && (
                          <a href={source.homepage_url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-gray-100 p-2 text-gray-500 hover:text-gray-900 dark:bg-slate-800 dark:text-slate-300">
                            <ExternalLink size={14} />
                          </a>
                        )}
                        <a href={source.list_url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-indigo-50 p-2 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-200">
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void updateSourceConfig(source)}
                          title="고급 설정 JSON 수정"
                          className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                          <Settings2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void runSource(source)}
                          disabled={Boolean(runningSourceId)}
                          title="GitHub Actions 백그라운드 수집 실행"
                          className="rounded-lg p-2 text-indigo-500 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-indigo-500/10"
                        >
                          {runningSourceId === source.id ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteSource(source)}
                          className="rounded-lg p-2 text-gray-300 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center text-sm font-bold text-gray-400 dark:border-slate-800">
            등록된 수집 기관이 없습니다.
          </div>
        )}
      </section>
    </div>
  );
}
