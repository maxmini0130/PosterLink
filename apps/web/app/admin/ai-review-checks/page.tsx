"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PauseCircle,
  RefreshCcw,
  Undo2,
} from "lucide-react";
import {
  highRisks,
  riskLabel,
  violationLabel,
  type SourceReviewRisk,
} from "../../../lib/sourceReviewChecks";

type AutoRecord = {
  decision: "published" | "closed" | "rejected";
  confidence: number;
  reason: string;
  resolution?: string;
  reviewedAt: string;
  model: string;
  risks: SourceReviewRisk[];
  uncertainties?: string[];
  rejectionReason?: string | null;
  closedReason?: string | null;
  duplicateJudgement?: string | null;
  evidence?: {
    field: string;
    quote: string;
    source_url: string;
    from: "text" | "image";
  }[];
  postCheck: { status: string; at?: string };
  previousTitle: string | null;
};

type HoldRecord = {
  reviewedAt: string;
  decision: string | null;
  confidence: number | null;
  reason: string | null;
  heldReason: string | null;
  violations: { code: string; detail: string }[];
  error: string | null;
  proposedTitle: string | null;
};

type Item<R> = {
  id: string;
  title: string;
  organizer_name: string | null;
  poster_status: string;
  application_end_at: string | null;
  updated_at: string;
  source_key: string | null;
  record: R;
};

type ListPayload = {
  pending: Item<AutoRecord>[];
  held: Item<HoldRecord>[];
  recent: Item<AutoRecord>[];
};

const DECISION_LABEL: Record<string, string> = {
  published: "공개",
  closed: "마감",
  rejected: "반려",
  held: "보류",
};
const STATUS_LABEL: Record<string, string> = {
  confirmed: "확인 완료",
  reverted: "되돌림",
  not_needed: "확인 불필요",
  pending: "확인 필요",
};

function formatKst(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function DecisionBadge({ decision }: { decision: string | null }) {
  const tone =
    decision === "rejected"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200"
      : decision === "closed"
        ? "bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-200"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${tone}`}>
      {DECISION_LABEL[decision ?? ""] ?? decision ?? "-"}
    </span>
  );
}

export default function AiReviewChecksPage() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/ai-review-checks", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "목록을 불러오지 못했습니다.");
      setData(payload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (item: Item<AutoRecord>, action: "confirm" | "revert") => {
    if (
      action === "revert" &&
      !window.confirm(
        `'${item.title}'을(를) 자동 반영 전 상태로 되돌려 검수 대기로 보낼까요?`,
      )
    )
      return;
    setBusyId(item.id);
    try {
      const response = await fetch("/api/admin/ai-review-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          action,
          expectedUpdatedAt: item.updated_at,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "처리하지 못했습니다.");
      toast.success(payload.message);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl pb-20">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            AI 반영 확인
          </h1>
          <p className="mt-2 text-sm font-bold text-gray-500 dark:text-slate-400">
            AI 원문 검토가 자동으로 반영한 공고 중 오판 가능성이 있는 건과, 규칙
            검증에 걸려 검수 대기에 남은 건입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-white px-4 py-2 text-xs font-black text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-300"
        >
          <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />{" "}
          새로고침
        </button>
      </div>

      {loading && !data ? (
        <div
          className="flex h-64 items-center justify-center rounded-[2rem] bg-white dark:bg-slate-900"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <span className="sr-only">불러오는 중</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
        >
          {error}
        </div>
      ) : data ? (
        <div className="space-y-10">
          <section aria-labelledby="pending-heading">
            <h2
              id="pending-heading"
              className="mb-3 flex items-center gap-2 text-base font-black text-gray-900 dark:text-white"
            >
              <AlertTriangle size={18} className="text-amber-500" aria-hidden />{" "}
              자동 반영 · 확인 필요 {data.pending.length}건
            </h2>
            {data.pending.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-sm font-bold text-gray-500 dark:bg-slate-900 dark:text-slate-400">
                확인할 공고가 없습니다.
              </p>
            ) : (
              <ul className="space-y-4">
                {data.pending.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-[1.5rem] border border-amber-200 bg-white p-5 shadow-sm dark:border-amber-900/60 dark:bg-slate-900"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <DecisionBadge decision={item.record.decision} />
                          <span className="text-[11px] font-bold text-gray-500 dark:text-slate-400">
                            신뢰도 {Math.round(item.record.confidence * 100)}% ·{" "}
                            {formatKst(item.record.reviewedAt)} 반영
                          </span>
                        </div>
                        <p className="break-words text-sm font-black text-gray-900 dark:text-white">
                          {item.title}
                        </p>
                        {item.record.previousTitle &&
                        item.record.previousTitle !== item.title ? (
                          <p className="mt-0.5 break-words text-xs font-bold text-gray-400 line-through dark:text-slate-500">
                            {item.record.previousTitle}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs font-bold text-gray-500 dark:text-slate-400">
                          {item.organizer_name ?? "-"} · 마감{" "}
                          {formatKst(item.application_end_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void act(item, "confirm")}
                          disabled={busyId !== null}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {busyId === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={14} aria-hidden />
                          )}{" "}
                          확인 완료
                        </button>
                        <button
                          type="button"
                          onClick={() => void act(item, "revert")}
                          disabled={busyId !== null}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-700 hover:bg-gray-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Undo2 size={14} aria-hidden /> 되돌리기
                        </button>
                        <Link
                          href={`/posters/${item.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-200"
                        >
                          <ExternalLink size={14} aria-hidden /> 공고 보기
                        </Link>
                      </div>
                    </div>
                    <div
                      className="mt-3 flex flex-wrap gap-1.5"
                      aria-label="확인이 필요한 이유"
                    >
                      {highRisks(item.record).map((risk) => (
                        <span
                          key={risk.code}
                          className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                          title={risk.detail}
                        >
                          {riskLabel(risk.code)}
                        </span>
                      ))}
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-black text-gray-600 dark:text-slate-300">
                        판단 근거 보기
                      </summary>
                      <div className="mt-2 space-y-2 text-xs font-medium leading-relaxed text-gray-700 dark:text-slate-300">
                        <p>{item.record.reason}</p>
                        {item.record.resolution ? (
                          <p>수정: {item.record.resolution}</p>
                        ) : null}
                        {item.record.rejectionReason ? (
                          <p>반려 사유: {item.record.rejectionReason}</p>
                        ) : null}
                        {item.record.closedReason ? (
                          <p>마감 사유: {item.record.closedReason}</p>
                        ) : null}
                        {item.record.duplicateJudgement ? (
                          <p>중복 판단: {item.record.duplicateJudgement}</p>
                        ) : null}
                        <ul className="list-disc space-y-1 pl-5">
                          {item.record.risks.map((risk) => (
                            <li key={risk.code}>
                              <span className="font-black">
                                {riskLabel(risk.code)}
                              </span>
                              : {risk.detail}
                            </li>
                          ))}
                        </ul>
                        {item.record.evidence?.length ? (
                          <ul className="space-y-1 rounded-xl bg-gray-50 p-3 dark:bg-slate-800">
                            {item.record.evidence.map((e, index) => (
                              <li
                                key={`${e.field}-${index}`}
                                className="break-words"
                              >
                                <span className="font-black">{e.field}</span>
                                {e.from === "image" ? " (이미지)" : ""}: “
                                {e.quote}”
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="held-heading">
            <h2
              id="held-heading"
              className="mb-3 flex items-center gap-2 text-base font-black text-gray-900 dark:text-white"
            >
              <PauseCircle size={18} className="text-slate-500" aria-hidden />{" "}
              반영 안 함 · 검수 대기 {data.held.length}건
            </h2>
            {data.held.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-sm font-bold text-gray-500 dark:bg-slate-900 dark:text-slate-400">
                보류된 공고가 없습니다.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.held.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-[1.5rem] border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-black text-gray-900 dark:text-white">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs font-bold text-gray-500 dark:text-slate-400">
                          AI 제안{" "}
                          {DECISION_LABEL[item.record.decision ?? ""] ?? "없음"}
                          {item.record.confidence != null
                            ? ` · 신뢰도 ${Math.round(item.record.confidence * 100)}%`
                            : ""}{" "}
                          · {formatKst(item.record.reviewedAt)}
                        </p>
                      </div>
                      <Link
                        href={`/admin/posters?status=review&posterId=${item.id}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-200"
                      >
                        검수 화면에서 보기
                      </Link>
                    </div>
                    <ul className="mt-3 space-y-1 text-xs font-medium text-gray-700 dark:text-slate-300">
                      {item.record.error ? (
                        <li>오류: {item.record.error}</li>
                      ) : null}
                      {item.record.violations.map((v, index) => (
                        <li key={`${v.code}-${index}`} className="break-words">
                          <span className="font-black">
                            {violationLabel(v.code)}
                          </span>
                          : {v.detail}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="recent-heading">
            <h2
              id="recent-heading"
              className="mb-3 text-base font-black text-gray-900 dark:text-white"
            >
              최근 자동 반영 {data.recent.length}건
            </h2>
            {data.recent.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-sm font-bold text-gray-500 dark:bg-slate-900 dark:text-slate-400">
                아직 자동 반영된 공고가 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-[1.5rem] border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-[11px] font-black text-gray-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">공고</th>
                      <th className="px-4 py-3">결정</th>
                      <th className="px-4 py-3">확인</th>
                      <th className="px-4 py-3">반영</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-gray-100 dark:border-slate-800"
                      >
                        <td className="max-w-[320px] px-4 py-3 font-bold text-gray-900 dark:text-white">
                          <Link
                            href={`/posters/${item.id}`}
                            target="_blank"
                            className="break-words hover:underline"
                          >
                            {item.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <DecisionBadge decision={item.record.decision} />
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-600 dark:text-slate-300">
                          {STATUS_LABEL[item.record.postCheck?.status] ?? "-"}
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-500 dark:text-slate-400">
                          {formatKst(item.record.reviewedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
