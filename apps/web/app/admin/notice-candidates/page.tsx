"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FileText,
  ImageOff,
  Loader2,
  Pencil,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "lucide-react";

type CandidateStatus = "pending" | "drafting" | "converted" | "dismissed" | "archived";

type NoticeCandidate = {
  id: string;
  source_key: string;
  source_url: string | null;
  title: string;
  source_org_name: string | null;
  summary_short: string | null;
  summary_long: string | null;
  candidate_status: CandidateStatus;
  candidate_type: string;
  source_site_id: string | null;
  collection_source_slug: string | null;
  board_name: string | null;
  category_name: string | null;
  notice_date: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  reason: string | null;
  quality_issues: Array<{ code?: string; reason?: string; severity?: string }> | null;
  field_verification: Record<string, any> | null;
  raw_payload: Record<string, any> | null;
  generated_poster_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

type Summary = {
  total: number;
  pending: number;
  drafting: number;
  converted: number;
  dismissed: number;
  archived: number;
};

type ApiPayload = {
  configured: boolean;
  candidates: NoticeCandidate[];
  summary: Summary;
  message?: string;
  error?: string;
};

type EditDraft = {
  title: string;
  source_org_name: string;
  source_url: string;
  category_name: string;
  notice_date: string;
  application_start_at: string;
  application_end_at: string;
  summary_short: string;
  summary_long: string;
  admin_note: string;
};

const STATUS_OPTIONS: Array<[CandidateStatus | "all", string]> = [
  ["pending", "대기"],
  ["drafting", "제작중"],
  ["converted", "전환완료"],
  ["dismissed", "제외"],
  ["archived", "보관"],
  ["all", "전체"],
];

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatNumber(value?: number | null) {
  return numberFormatter.format(value ?? 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "pending") return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200";
  if (status === "drafting") return "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200";
  if (status === "converted") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200";
  if (status === "dismissed") return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200";
  return "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200";
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find(([value]) => value === status)?.[1] ?? status;
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildEditDraft(candidate: NoticeCandidate): EditDraft {
  return {
    title: candidate.title ?? "",
    source_org_name: candidate.source_org_name ?? "",
    source_url: candidate.source_url ?? candidate.source_key ?? "",
    category_name: candidate.category_name ?? "",
    notice_date: toDateTimeLocalValue(candidate.notice_date),
    application_start_at: toDateTimeLocalValue(candidate.application_start_at),
    application_end_at: toDateTimeLocalValue(candidate.application_end_at),
    summary_short: candidate.summary_short ?? "",
    summary_long: candidate.summary_long ?? "",
    admin_note: candidate.admin_note ?? "",
  };
}

function dateTimeLocalToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof ImageOff;
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

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-white p-10 text-center text-sm font-bold text-gray-400 dark:border-slate-800 dark:bg-slate-900">
      {text}
    </div>
  );
}

export default function AdminNoticeCandidatesPage() {
  const [status, setStatus] = useState<CandidateStatus | "all">("pending");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  const loadCandidates = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      if (query.trim()) params.set("q", query.trim());

      const response = await fetch(`/api/admin/notice-candidates?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? "이미지 없는 공고 후보를 불러오지 못했습니다.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 없는 공고 후보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const summary = data?.summary;

  const sortedCandidates = useMemo(() => {
    const candidates = data?.candidates ?? [];
    return [...candidates].sort((a, b) => {
      const statusWeight = Number(a.candidate_status === "pending") - Number(b.candidate_status === "pending");
      if (statusWeight !== 0) return -statusWeight;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [data?.candidates]);

  const updateStatus = async (candidate: NoticeCandidate, nextStatus: CandidateStatus) => {
    setUpdatingId(candidate.id);
    try {
      const response = await fetch("/api/admin/notice-candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: candidate.id, candidate_status: nextStatus }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "상태를 변경하지 못했습니다.");
      toast.success(`${statusLabel(nextStatus)} 상태로 변경했습니다.`);
      await loadCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "상태를 변경하지 못했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  const startEditing = (candidate: NoticeCandidate) => {
    setEditingId(candidate.id);
    setEditDraft(buildEditDraft(candidate));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const updateDraft = (field: keyof EditDraft, value: string) => {
    setEditDraft((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const saveCandidate = async (candidate: NoticeCandidate) => {
    if (!editDraft) return;
    if (!editDraft.title.trim()) {
      toast.error("제목은 비워둘 수 없습니다.");
      return;
    }

    setUpdatingId(candidate.id);
    try {
      const response = await fetch("/api/admin/notice-candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: candidate.id,
          title: editDraft.title,
          source_org_name: editDraft.source_org_name,
          source_url: editDraft.source_url,
          category_name: editDraft.category_name,
          notice_date: dateTimeLocalToIso(editDraft.notice_date),
          application_start_at: dateTimeLocalToIso(editDraft.application_start_at),
          application_end_at: dateTimeLocalToIso(editDraft.application_end_at),
          summary_short: editDraft.summary_short,
          summary_long: editDraft.summary_long,
          admin_note: editDraft.admin_note,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "후보 정보를 저장하지 못했습니다.");
      toast.success("후보 정보를 저장했습니다.");
      cancelEditing();
      await loadCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "후보 정보를 저장하지 못했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteCandidate = async (candidate: NoticeCandidate) => {
    if (!window.confirm(`"${candidate.title}" 후보를 삭제할까요?`)) return;
    setUpdatingId(candidate.id);
    try {
      const response = await fetch(`/api/admin/notice-candidates?id=${candidate.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "후보를 삭제하지 못했습니다.");
      toast.success("후보를 삭제했습니다.");
      await loadCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "후보를 삭제하지 못했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-500">Notice Candidates</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-white">이미지 없는 공고 후보</h1>
          <p className="mt-2 text-sm font-bold text-gray-500 dark:text-slate-400">
            포스터 이미지는 없지만 공고 가치가 있는 글을 분리해서 관리합니다.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Search size={15} className="text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadCandidates();
              }}
              placeholder="제목, 기관, 수집원 검색"
              className="h-full bg-transparent text-sm font-bold outline-none placeholder:text-gray-400"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as CandidateStatus | "all")}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-black outline-none dark:border-slate-800 dark:bg-slate-900"
          >
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button
            type="button"
            onClick={loadCandidates}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-xs font-black text-gray-600 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            새로고침
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      )}

      {data?.configured === false && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="text-base font-black">이미지 없는 공고 후보 테이블이 아직 없습니다.</p>
          <p className="mt-2">`supabase/migrations/20260722030000_add_poster_notice_candidates.sql` 실행이 필요합니다.</p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={ImageOff} label="대기 후보" value={summary?.pending ?? 0} sub="AI 포스터 제작 검토 대상" />
        <MetricCard icon={Wand2} label="제작중" value={summary?.drafting ?? 0} sub="포스터 생성 작업 중" />
        <MetricCard icon={CheckCircle2} label="전환완료" value={summary?.converted ?? 0} sub="포스터로 게시 완료" />
        <MetricCard icon={XCircle} label="제외" value={summary?.dismissed ?? 0} sub="게시하지 않기로 판단" />
        <MetricCard icon={Archive} label="전체" value={summary?.total ?? 0} sub="누적 후보 수" />
      </section>

      {loading && !data ? (
        <div className="flex min-h-80 items-center justify-center rounded-lg border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : sortedCandidates.length > 0 ? (
        <section className="space-y-3">
          {sortedCandidates.map((candidate) => {
            const sourceUrl = candidate.source_url || candidate.source_key;
            const issues = candidate.quality_issues ?? [];
            const disabled = updatingId === candidate.id;
            const isEditing = editingId === candidate.id && editDraft;

            return (
              <article
                key={candidate.id}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusTone(candidate.candidate_status)}`}>
                        {statusLabel(candidate.candidate_status)}
                      </span>
                      {candidate.category_name && (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black text-gray-500 dark:bg-slate-800 dark:text-slate-300">
                          {candidate.category_name}
                        </span>
                      )}
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-200">
                        이미지 없음
                      </span>
                    </div>
                    <h2 className="text-lg font-black leading-snug text-gray-950 dark:text-white">{candidate.title}</h2>
                    <p className="mt-1 text-xs font-bold text-gray-400">
                      {candidate.source_org_name ?? "-"} · {candidate.collection_source_slug ?? candidate.source_site_id ?? "-"} · {formatDate(candidate.created_at)}
                    </p>
                    {candidate.summary_short && (
                      <p className="mt-3 text-sm font-bold leading-6 text-gray-600 dark:text-slate-300">{candidate.summary_short}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {sourceUrl && (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-black text-gray-600 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                      >
                        <ExternalLink size={15} />
                        원문
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => isEditing ? cancelEditing() : startEditing(candidate)}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-black text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                    >
                      {isEditing ? <X size={15} /> : <Pencil size={15} />}
                      {isEditing ? "닫기" : "편집"}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => updateStatus(candidate, "drafting")}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {disabled ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                      제작중
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => updateStatus(candidate, "converted")}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 size={15} />
                      완료
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => updateStatus(candidate, "dismissed")}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-50 px-3 text-xs font-black text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                    >
                      <XCircle size={15} />
                      제외
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => deleteCandidate(candidate)}
                      className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-3 text-gray-400 hover:bg-gray-50 hover:text-rose-600 disabled:opacity-50 dark:border-slate-800 dark:hover:bg-slate-800"
                      title="삭제"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                        제목
                        <input
                          value={editDraft.title}
                          onChange={(event) => updateDraft("title", event.target.value)}
                          className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </label>
                      <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                        기관명
                        <input
                          value={editDraft.source_org_name}
                          onChange={(event) => updateDraft("source_org_name", event.target.value)}
                          className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </label>
                      <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                        카테고리
                        <input
                          value={editDraft.category_name}
                          onChange={(event) => updateDraft("category_name", event.target.value)}
                          className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </label>
                      <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                        원문 URL
                        <input
                          value={editDraft.source_url}
                          onChange={(event) => updateDraft("source_url", event.target.value)}
                          className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </label>
                      <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                        공고일
                        <input
                          type="datetime-local"
                          value={editDraft.notice_date}
                          onChange={(event) => updateDraft("notice_date", event.target.value)}
                          className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </label>
                      <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                        신청 시작일
                        <input
                          type="datetime-local"
                          value={editDraft.application_start_at}
                          onChange={(event) => updateDraft("application_start_at", event.target.value)}
                          className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </label>
                      <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                        신청 마감일
                        <input
                          type="datetime-local"
                          value={editDraft.application_end_at}
                          onChange={(event) => updateDraft("application_end_at", event.target.value)}
                          className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </label>
                      <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                        관리자 메모
                        <input
                          value={editDraft.admin_note}
                          onChange={(event) => updateDraft("admin_note", event.target.value)}
                          className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </label>
                    </div>
                    <label className="mt-3 block text-xs font-black text-gray-500 dark:text-slate-300">
                      한줄 요약
                      <textarea
                        value={editDraft.summary_short}
                        onChange={(event) => updateDraft("summary_short", event.target.value)}
                        rows={2}
                        className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold leading-6 text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                      />
                    </label>
                    <label className="mt-3 block text-xs font-black text-gray-500 dark:text-slate-300">
                      상세 요약
                      <textarea
                        value={editDraft.summary_long}
                        onChange={(event) => updateDraft("summary_long", event.target.value)}
                        rows={5}
                        className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold leading-6 text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                      />
                    </label>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={disabled}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-xs font-black text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                      >
                        <X size={15} />
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => saveCandidate(candidate)}
                        disabled={disabled}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-4 text-xs font-black text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-slate-200"
                      >
                        {disabled ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        저장
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-4 grid gap-3 text-xs font-bold text-gray-500 md:grid-cols-3">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-950">
                    <p className="font-black text-gray-400">공고일</p>
                    <p className="mt-1 text-gray-900 dark:text-white">{formatDate(candidate.notice_date)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-950">
                    <p className="font-black text-gray-400">마감일</p>
                    <p className="mt-1 text-gray-900 dark:text-white">{formatDate(candidate.application_end_at)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-950">
                    <p className="font-black text-gray-400">사유</p>
                    <p className="mt-1 line-clamp-2 text-gray-900 dark:text-white">{candidate.reason ?? "poster image missing"}</p>
                  </div>
                </div>

                {(candidate.summary_long || issues.length > 0 || candidate.admin_note) && (
                  <details className="mt-4 rounded-lg border border-gray-100 p-4 dark:border-slate-800">
                    <summary className="cursor-pointer text-xs font-black text-gray-500 dark:text-slate-300">
                      원문 요약과 검증 이슈 보기
                    </summary>
                    {candidate.summary_long && (
                      <p className="mt-3 whitespace-pre-wrap text-sm font-bold leading-6 text-gray-600 dark:text-slate-300">
                        {candidate.summary_long}
                      </p>
                    )}
                    {issues.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {issues.slice(0, 8).map((issue, index) => (
                          <span key={`${issue.code ?? "issue"}-${index}`} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                            {issue.code ?? issue.reason ?? "review"}
                          </span>
                        ))}
                      </div>
                    )}
                    {candidate.admin_note && (
                      <p className="mt-3 text-xs font-bold text-gray-400">
                        <Pencil size={13} className="mr-1 inline" />
                        {candidate.admin_note}
                      </p>
                    )}
                  </details>
                )}
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyBlock text="조건에 맞는 이미지 없는 공고 후보가 없습니다." />
      )}

      <section className="rounded-lg border border-indigo-100 bg-indigo-50 p-5 text-sm font-bold text-indigo-800 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-100">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 shrink-0" size={18} />
          <p>
            이 목록은 공개 포스터 목록이 아닙니다. 원문을 확인한 뒤 나중에 AI로 포스터 이미지를 생성하거나, 직접 디자인한 이미지를 붙여 포스터로 전환하는 용도로 사용합니다.
          </p>
        </div>
      </section>
    </div>
  );
}
