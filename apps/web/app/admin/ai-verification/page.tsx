"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  FileWarning,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type UsageRow = {
  day_kst: string;
  stage: number;
  stage_label: string;
  model: string;
  operation: string;
  status: string;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  image_count: number;
  estimated_unit_cost: number;
};

type FieldOverviewRow = {
  field_key: string;
  report_status: string;
  report_count: number;
  last_reported_at: string | null;
};

type FieldReport = {
  id: string;
  poster_id: string;
  field_key: string;
  note: string | null;
  report_status: string;
  created_at: string;
  sameFieldReportCount: number;
  poster?: {
    id: string;
    title: string;
    poster_status: string | null;
  } | null;
  reporter?: {
    nickname?: string | null;
  } | null;
};

type ExposureSummary = {
  statusCounts: {
    published: number;
    review: number;
  };
  tierCounts: {
    A: number;
    B: number;
    C: number;
    uncategorized: number;
  };
  uncomputedCount: number;
  computedCount: number;
  gateCounts: {
    seo: number;
    calendar: number;
    deadlineAlert: number;
    recommendation: number;
  };
  autoPublish: {
    enabled: boolean;
    tiers: string[];
    reviewCandidates: number;
    eligibleCandidates: number;
    blockedReasons: Record<string, number>;
    requiresApply: boolean;
  };
};

type AiVerificationData = {
  days: number;
  generatedAt: string;
  usageRows: UsageRow[];
  fieldOverview: FieldOverviewRow[];
  exposureSummary: ExposureSummary;
  fieldReports: FieldReport[];
};

const DAY_OPTIONS = [1, 7, 30, 90];
const STAGE_LABELS: Record<string, string> = {
  rule: "규칙",
  cheap_text: "저가 텍스트",
  high_text: "상위 텍스트",
  vlm: "VLM",
};

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatNumber(value: number | null | undefined) {
  return numberFormatter.format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

export default function AdminAiVerificationPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AiVerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchData = async (nextDays = days) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/ai-verification?days=${nextDays}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI 검증 현황을 불러오지 못했습니다.");
      setData(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 검증 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const usageSummary = useMemo(() => {
    const rows = data?.usageRows ?? [];
    return rows.reduce((acc, row) => {
      acc.calls += Number(row.call_count ?? 0);
      acc.inputTokens += Number(row.input_tokens ?? 0);
      acc.outputTokens += Number(row.output_tokens ?? 0);
      acc.images += Number(row.image_count ?? 0);
      acc.cost += Number(row.estimated_unit_cost ?? 0);
      acc.byStage[row.stage_label] = (acc.byStage[row.stage_label] ?? 0) + Number(row.call_count ?? 0);
      return acc;
    }, {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      images: 0,
      cost: 0,
      byStage: {} as Record<string, number>,
    });
  }, [data]);

  const receivedReports = (data?.fieldReports ?? []).filter((report) => report.report_status === "received");
  const riskyReports = receivedReports.filter((report) => report.sameFieldReportCount >= 2);

  async function updateReportStatus(reportId: string, status: "actioned" | "dismissed" | "reviewing") {
    setActioningId(reportId);
    try {
      const response = await fetch("/api/admin/ai-verification", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "신고 상태를 변경하지 못했습니다.");
      toast.success("신고 상태를 변경했습니다.");
      await fetchData(days);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "신고 상태를 변경하지 못했습니다.");
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-black italic tracking-tight text-gray-900 dark:text-white">AI 검증 현황</h1>
          <p className="mt-2 text-sm font-bold text-gray-400 dark:text-slate-500">
            모델 사용량, 노출 티어, 노출 게이트 상태를 함께 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={`rounded-xl px-4 py-2 text-xs font-black transition-all ${
                days === option
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {option}일
            </button>
          ))}
          <button
            type="button"
            onClick={() => fetchData(days)}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-gray-500 shadow-sm hover:bg-gray-50 dark:bg-slate-900 dark:text-slate-300"
          >
            <RefreshCcw size={14} />
            새로고침
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-80 items-center justify-center rounded-[2rem] bg-white dark:bg-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              { label: "모델 호출", value: usageSummary.calls, icon: <BarChart3 size={20} />, tone: "bg-indigo-50 text-indigo-600" },
              { label: "입력 토큰", value: usageSummary.inputTokens, icon: <Database size={20} />, tone: "bg-blue-50 text-blue-600" },
              { label: "출력 토큰", value: usageSummary.outputTokens, icon: <Database size={20} />, tone: "bg-sky-50 text-sky-600" },
              { label: "이미지", value: usageSummary.images, icon: <FileWarning size={20} />, tone: "bg-amber-50 text-amber-600" },
              { label: "비용 단위", value: usageSummary.cost, icon: <ShieldCheck size={20} />, tone: "bg-emerald-50 text-emerald-600" },
            ].map((card) => (
              <div key={card.label} className="rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${card.tone}`}>
                  {card.icon}
                </div>
                <p className="text-2xl font-black text-gray-900 dark:text-white">{formatNumber(card.value)}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-wider text-gray-400">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-black text-gray-900 dark:text-white">노출 티어 분포</h2>
              <div className="space-y-3">
                {Object.entries(data?.exposureSummary?.tierCounts ?? {}).map(([tier, count]) => {
                  const isUncategorized = tier === "uncategorized";
                  const tone = isUncategorized
                    ? "bg-gray-100 text-gray-700"
                    : tier === "A"
                      ? "bg-emerald-100 text-emerald-700"
                      : tier === "B"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700";
                  const label = isUncategorized ? "미분류" : `티어 ${tier}`;
                  return (
                    <div key={tier} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-lg px-2 py-1 text-[11px] font-black ${tone}`}>{label}</span>
                        <span className="text-xs font-bold text-gray-500">published/review 기준</span>
                      </div>
                      <span className="text-sm font-black text-indigo-600">{formatNumber(count)}</span>
                    </div>
                  );
                })}
                <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                  <p className="text-[11px] font-bold text-gray-500">
                    미분류 게시물: {formatNumber(data?.exposureSummary?.uncomputedCount ?? 0)}건
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-black text-gray-900 dark:text-white">자동 공개 킬 스위치</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                  <span className="text-sm font-black text-gray-700 dark:text-slate-200">현재 상태</span>
                  <span className={`rounded-lg px-2 py-1 text-xs font-black ${data?.exposureSummary?.autoPublish.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                    {data?.exposureSummary?.autoPublish.enabled ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                  <span className="text-sm font-black text-gray-700 dark:text-slate-200">허용 티어</span>
                  <span className="text-sm font-black text-gray-700 dark:text-slate-200">
                    {(data?.exposureSummary?.autoPublish.tiers ?? []).join(", ") || "A"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                  <span className="text-sm font-black text-gray-700 dark:text-slate-200">자동 공개 후보(review)</span>
                  <span className="text-sm font-black text-indigo-600">
                    {formatNumber(data?.exposureSummary?.autoPublish.reviewCandidates ?? 0)}건
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                  <span className="text-sm font-black text-gray-700 dark:text-slate-200">실제 적용 가능 후보</span>
                  <span className="text-sm font-black text-emerald-600">
                    {formatNumber(data?.exposureSummary?.autoPublish.eligibleCandidates ?? 0)}건
                  </span>
                </div>
                {Object.keys(data?.exposureSummary?.autoPublish.blockedReasons ?? {}).length > 0 && (
                  <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                    <p className="mb-2 text-[11px] font-black text-gray-500">자동 공개 차단 사유</p>
                    <div className="space-y-2">
                      {Object.entries(data?.exposureSummary?.autoPublish.blockedReasons ?? {}).map(([reason, count]) => (
                        <div key={reason} className="flex items-center justify-between text-xs">
                          <span className="font-bold text-gray-600 dark:text-slate-300">{reason}</span>
                          <span className="font-black text-gray-900 dark:text-white">{formatNumber(count)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-4 dark:border-slate-700">
                  <p className="text-[11px] font-black text-gray-500">
                    적용 전 조건: 환경변수 `EXPOSURE_AUTO_PUBLISH=true` 및 `--apply`가 함께 필요합니다.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-black text-gray-900 dark:text-white">단계별 사용량</h2>
              <div className="space-y-3">
                {Object.entries(usageSummary.byStage).length > 0 ? Object.entries(usageSummary.byStage).map(([stage, count]) => (
                  <div key={stage} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                    <span className="text-sm font-black text-gray-700 dark:text-slate-200">{STAGE_LABELS[stage] ?? stage}</span>
                    <span className="text-sm font-black text-indigo-600">{formatNumber(count)}</span>
                  </div>
                )) : (
                  <p className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm font-bold text-gray-400 dark:bg-slate-800">
                    아직 기록된 AI 사용량이 없습니다.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-black text-gray-900 dark:text-white">티어 게이트 통과 현황</h2>
              <div className="space-y-3">
                {Object.entries(data?.exposureSummary?.gateCounts ?? {}).map(([gate, count]) => (
                  <div key={gate} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                    <span className="text-sm font-black text-gray-700 dark:text-slate-200">
                      {gate === "deadlineAlert" ? "데드라인 알림 게이트" : gate === "recommendation" ? "추천 게이트" : gate === "calendar" ? "캘린더 게이트" : "SEO 게이트"}
                    </span>
                    <span className="text-sm font-black text-indigo-600">{formatNumber(count)} / {formatNumber(data?.exposureSummary?.computedCount ?? 0)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-black text-gray-900 dark:text-white">필드 신고 요약</h2>
              <div className="space-y-3">
                {(data?.fieldOverview ?? []).length > 0 ? data!.fieldOverview.slice(0, 8).map((row) => (
                  <div key={`${row.field_key}-${row.report_status}`} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-800">
                    <div>
                      <p className="text-sm font-black text-gray-700 dark:text-slate-200">{row.field_key}</p>
                      <p className="text-[11px] font-bold text-gray-400">{row.report_status} · {formatDate(row.last_reported_at)}</p>
                    </div>
                    <span className="text-sm font-black text-rose-600">{formatNumber(row.report_count)}</span>
                  </div>
                )) : (
                  <p className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm font-bold text-gray-400 dark:bg-slate-800">
                    아직 필드 신고가 없습니다.
                  </p>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-gray-900 dark:text-white">처리 대기 필드 신고</h2>
                <p className="mt-1 text-xs font-bold text-gray-400">
                  같은 공고의 같은 필드 신고가 2건 이상이면 우선 확인 대상입니다.
                </p>
              </div>
              {riskyReports.length > 0 && (
                <span className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600">
                  <AlertTriangle size={14} />
                  우선 확인 {riskyReports.length}
                </span>
              )}
            </div>

            {receivedReports.length > 0 ? (
              <div className="space-y-4">
                {receivedReports.map((report) => (
                  <div key={report.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-black text-indigo-600">{report.field_key}</span>
                      {report.sameFieldReportCount >= 2 && (
                        <span className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-600">
                          동일 필드 {report.sameFieldReportCount}건
                        </span>
                      )}
                      <span className="text-[11px] font-bold text-gray-400">{formatDate(report.created_at)}</span>
                    </div>
                    <p className="mb-1 text-sm font-black text-gray-900 dark:text-white">
                      {report.poster?.title ?? "공고 정보 없음"}
                    </p>
                    <p className="mb-3 text-xs font-bold text-gray-400">
                      신고자: {report.reporter?.nickname ?? "알 수 없음"}
                    </p>
                    {report.note && (
                      <p className="mb-4 rounded-xl bg-white px-4 py-3 text-sm font-bold leading-relaxed text-gray-600 dark:bg-slate-900 dark:text-slate-300">
                        {report.note}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/posters/${report.poster_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-500 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900"
                      >
                        공고 보기
                      </a>
                      <button
                        type="button"
                        disabled={actioningId === report.id}
                        onClick={() => updateReportStatus(report.id, "reviewing")}
                        className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-600 hover:bg-amber-100 disabled:opacity-50"
                      >
                        검토 중
                      </button>
                      <button
                        type="button"
                        disabled={actioningId === report.id}
                        onClick={() => updateReportStatus(report.id, "actioned")}
                        className="inline-flex items-center gap-1 rounded-xl bg-gray-900 px-3 py-2 text-xs font-black text-white hover:bg-black disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} />
                        처리 완료
                      </button>
                      <button
                        type="button"
                        disabled={actioningId === report.id}
                        onClick={() => updateReportStatus(report.id, "dismissed")}
                        className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-gray-400 hover:bg-gray-100 disabled:opacity-50 dark:bg-slate-900"
                      >
                        <XCircle size={13} />
                        기각
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center dark:border-slate-700">
                <CheckCircle2 className="mx-auto mb-4 text-emerald-100" size={56} />
                <p className="text-sm font-black text-gray-400">처리 대기 중인 필드 신고가 없습니다.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
