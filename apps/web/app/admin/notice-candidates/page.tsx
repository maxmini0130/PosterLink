"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  ImageOff,
  ImagePlus,
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

type CandidateQualityIssue = {
  code?: string;
  reason?: string;
  severity?: string;
  evidence?: string;
  duplicatePosterId?: string | null;
  duplicateScore?: number | null;
  [key: string]: any;
};

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
  quality_issues: CandidateQualityIssue[] | null;
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

type ConvertedPosterLink = {
  id: string;
  title: string;
  source_org_name: string | null;
};

type CandidatePreflightStatus = "pass" | "warning" | "block";
type CandidatePreflightCheck = {
  key: string;
  label: string;
  status: CandidatePreflightStatus;
  detail: string;
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

type PosterMakerDraft = {
  title: string;
  source_org_name: string;
  category_name: string;
  period_text: string;
  summary: string;
  accent: string;
};

type ConvertCandidateOverrides = {
  title?: string | null;
  source_org_name?: string | null;
  source_url?: string | null;
  category_name?: string | null;
  notice_date?: string | null;
  application_start_at?: string | null;
  application_end_at?: string | null;
  summary_short?: string | null;
  summary_long?: string | null;
  image_source?: "admin_upload" | "template_canvas";
};

const STATUS_OPTIONS: Array<[CandidateStatus | "all", string]> = [
  ["pending", "대기"],
  ["drafting", "제작중"],
  ["converted", "전환완료"],
  ["dismissed", "제외"],
  ["archived", "보관"],
  ["all", "전체"],
];

const POSTER_PALETTES = [
  { name: "Blue", accent: "#2563eb", soft: "#dbeafe", dark: "#0f172a" },
  { name: "Green", accent: "#059669", soft: "#d1fae5", dark: "#052e16" },
  { name: "Rose", accent: "#e11d48", soft: "#ffe4e6", dark: "#4c0519" },
  { name: "Amber", accent: "#d97706", soft: "#fef3c7", dark: "#451a03" },
  { name: "Violet", accent: "#7c3aed", soft: "#ede9fe", dark: "#2e1065" },
] as const;

const DEFAULT_ACCENT = POSTER_PALETTES[0].accent;

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

function isValidHttpUrl(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

function formatPosterDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildDefaultPeriodText(candidate: NoticeCandidate) {
  const start = formatPosterDate(candidate.application_start_at);
  const end = formatPosterDate(candidate.application_end_at);
  if (start && end) return `${start} - ${end}`;
  if (end) return `마감 ${end}`;
  return "원문 공고 확인";
}

function normalizePosterText(value?: string | null, fallback = "") {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function getCandidateDuplicateIssues(candidate: NoticeCandidate): CandidateQualityIssue[] {
  const qualityIssues = candidate.quality_issues ?? [];
  const verificationIssues = Array.isArray(candidate.field_verification?.duplicateIssues)
    ? candidate.field_verification.duplicateIssues as CandidateQualityIssue[]
    : [];
  const issues = [...qualityIssues, ...verificationIssues].filter((issue) => {
    const code = String(issue?.code ?? "").toLowerCase();
    const reason = String(issue?.reason ?? "").toLowerCase();
    const evidence = String(issue?.evidence ?? "").toLowerCase();
    return Boolean(
      issue?.duplicatePosterId ||
      code.includes("duplicate") ||
      reason.includes("duplicate") ||
      evidence.includes("existing")
    );
  });
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = [
      issue.code ?? "",
      issue.duplicatePosterId ?? "",
      issue.duplicateScore ?? "",
      issue.evidence ?? "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getDuplicateIssueLabel(issue: CandidateQualityIssue) {
  return [
    issue.code ?? "duplicate-suspected",
    typeof issue.duplicateScore === "number" ? `점수 ${issue.duplicateScore}` : "",
    issue.duplicatePosterId ? `기존 ${issue.duplicatePosterId}` : "",
  ].filter(Boolean).join(" · ");
}

function getDuplicateIssueDetail(issue: CandidateQualityIssue) {
  return normalizePosterText(
    [issue.reason, issue.evidence].filter(Boolean).join(" · "),
    "기존 포스터와 비슷한 항목입니다. 제작/전환 전 원문을 확인하세요."
  );
}

function createCandidatePreflightCheck(
  key: string,
  label: string,
  status: CandidatePreflightStatus,
  detail: string
): CandidatePreflightCheck {
  return { key, label, status, detail };
}

function getCandidatePreflightChecks(candidate: NoticeCandidate): CandidatePreflightCheck[] {
  const title = normalizePosterText(candidate.title);
  const sourceUrl = candidate.source_url || candidate.source_key;
  const orgName = normalizePosterText(candidate.source_org_name);
  const categoryName = normalizePosterText(candidate.category_name);
  const summary = normalizePosterText(candidate.summary_short ?? candidate.summary_long);
  const qualityIssues = candidate.quality_issues ?? [];
  const duplicateIssues = getCandidateDuplicateIssues(candidate);
  const applicationEnd = candidate.application_end_at ? new Date(candidate.application_end_at) : null;
  const applicationStart = candidate.application_start_at ? new Date(candidate.application_start_at) : null;
  const endInvalid = Boolean(applicationEnd && Number.isNaN(applicationEnd.getTime()));
  const startInvalid = Boolean(applicationStart && Number.isNaN(applicationStart.getTime()));
  const isExpired = Boolean(applicationEnd && !endInvalid && applicationEnd.getTime() < Date.now());
  const startAfterEnd = Boolean(
    applicationStart &&
    applicationEnd &&
    !startInvalid &&
    !endInvalid &&
    applicationStart.getTime() > applicationEnd.getTime()
  );

  return [
    createCandidatePreflightCheck(
      "title",
      "제목",
      title ? "pass" : "block",
      title ? "제목이 있습니다." : "제목이 비어 있습니다."
    ),
    createCandidatePreflightCheck(
      "source",
      "원문 URL",
      isValidHttpUrl(sourceUrl) ? "pass" : "block",
      isValidHttpUrl(sourceUrl) ? "원문 URL이 있습니다." : "원문 URL이 없거나 올바르지 않습니다."
    ),
    createCandidatePreflightCheck(
      "organization",
      "기관",
      orgName ? "pass" : "warning",
      orgName ? `기관: ${orgName}` : "기관명을 확인하세요."
    ),
    createCandidatePreflightCheck(
      "period",
      "신청 기간",
      endInvalid || startInvalid || startAfterEnd || isExpired ? "warning" : "pass",
      endInvalid || startInvalid
        ? "날짜 형식 확인이 필요합니다."
        : startAfterEnd
          ? "시작일이 마감일보다 늦습니다."
          : isExpired
            ? "이미 지난 마감일입니다."
            : candidate.application_end_at
              ? "마감일이 있습니다."
              : "상시 또는 마감일 미기재 공고입니다."
    ),
    createCandidatePreflightCheck(
      "category",
      "분류",
      categoryName ? "pass" : "warning",
      categoryName ? `분류: ${categoryName}` : "분류를 확인하세요."
    ),
    createCandidatePreflightCheck(
      "summary",
      "요약",
      summary ? "pass" : "warning",
      summary ? "요약이 있습니다." : "요약이 없어 원문 확인이 필요합니다."
    ),
    createCandidatePreflightCheck(
      "duplicate",
      "중복",
      duplicateIssues.length > 0 ? "warning" : "pass",
      duplicateIssues.length > 0 ? `기존 포스터와 유사한 항목 ${duplicateIssues.length}건` : "중복 의심이 없습니다."
    ),
    createCandidatePreflightCheck(
      "quality",
      "수집 이슈",
      qualityIssues.length > 0 ? "warning" : "pass",
      qualityIssues.length > 0 ? `수집/검증 이슈 ${qualityIssues.length}건` : "수집 이슈가 없습니다."
    ),
  ];
}

function getCandidatePreflightToneClass(status: CandidatePreflightStatus) {
  if (status === "block") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100";
  return "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100";
}

function buildPosterMakerDraft(candidate: NoticeCandidate): PosterMakerDraft {
  return {
    title: normalizePosterText(candidate.title, "공고 제목"),
    source_org_name: normalizePosterText(candidate.source_org_name, "기관명 확인"),
    category_name: normalizePosterText(candidate.category_name, "공고"),
    period_text: buildDefaultPeriodText(candidate),
    summary: normalizePosterText(candidate.summary_short ?? candidate.summary_long, "자세한 내용은 원문 공고를 확인하세요."),
    accent: DEFAULT_ACCENT,
  };
}

function buildAdminPosterReviewHref(posterId: string) {
  return `/admin/posters?status=review&posterId=${posterId}`;
}

function applyEditDraftToCandidate(candidate: NoticeCandidate, draft: EditDraft | null): NoticeCandidate {
  if (!draft) return candidate;
  return {
    ...candidate,
    title: draft.title,
    source_org_name: draft.source_org_name,
    source_url: draft.source_url || null,
    category_name: draft.category_name || null,
    notice_date: dateTimeLocalToIso(draft.notice_date) || null,
    application_start_at: dateTimeLocalToIso(draft.application_start_at) || null,
    application_end_at: dateTimeLocalToIso(draft.application_end_at) || null,
    summary_short: draft.summary_short || null,
    summary_long: draft.summary_long || null,
    admin_note: draft.admin_note || null,
  };
}

function getPalette(accent: string) {
  return POSTER_PALETTES.find((palette) => palette.accent === accent) ?? POSTER_PALETTES[0];
}

function splitLongWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number) {
  const parts: string[] = [];
  let current = "";
  for (const char of word) {
    const next = current + char;
    if (current && ctx.measureText(next).width > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
) {
  const words = normalizePosterText(text).split(/\s+/).flatMap((word) => {
    return ctx.measureText(word).width > maxWidth ? splitLongWord(ctx, word, maxWidth) : word;
  });
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines && words.length > lines.join(" ").split(/\s+/).length) {
    let lastLine = `${lines[maxLines - 1]}...`;
    while (lastLine.length > 1 && ctx.measureText(lastLine).width > maxWidth) {
      lastLine = `${lastLine.slice(0, -4)}...`;
    }
    lines[maxLines - 1] = lastLine;
  }

  return lines;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const lines = wrapCanvasLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
  return y + lines.length * lineHeight;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

async function generateTemplatePosterFile(draft: PosterMakerDraft) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 생성할 수 없습니다.");

  const palette = getPalette(draft.accent);
  const fontFamily = `"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif`;

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, canvas.width, 415);
  ctx.fillStyle = palette.dark;
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.moveTo(670, 0);
  ctx.lineTo(1080, 0);
  ctx.lineTo(1080, 415);
  ctx.lineTo(500, 415);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  roundedRect(ctx, 72, 72, 250, 58, 29);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 28px ${fontFamily}`;
  ctx.fillText(draft.category_name.slice(0, 18), 102, 111);

  ctx.font = `900 ${draft.title.length > 70 ? 58 : 66}px ${fontFamily}`;
  ctx.fillStyle = "#ffffff";
  const titleBottom = drawWrappedText(ctx, draft.title, 72, 205, 910, 78, 5);

  ctx.font = `800 30px ${fontFamily}`;
  ctx.fillStyle = "rgba(255,255,255,0.84)";
  ctx.fillText(draft.source_org_name.slice(0, 32), 72, Math.min(titleBottom + 35, 382));

  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, 72, 485, 936, 710, 24);
  ctx.fill();

  ctx.fillStyle = palette.soft;
  roundedRect(ctx, 112, 535, 856, 150, 20);
  ctx.fill();
  ctx.fillStyle = palette.dark;
  ctx.font = `900 28px ${fontFamily}`;
  ctx.fillText("신청 기간", 152, 590);
  ctx.font = `900 44px ${fontFamily}`;
  drawWrappedText(ctx, draft.period_text, 152, 652, 780, 52, 2);

  ctx.fillStyle = "#111827";
  ctx.font = `900 34px ${fontFamily}`;
  ctx.fillText("주요 내용", 112, 770);
  ctx.fillStyle = "#334155";
  ctx.font = `800 38px ${fontFamily}`;
  drawWrappedText(ctx, draft.summary, 112, 840, 856, 56, 6);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(112, 1092);
  ctx.lineTo(968, 1092);
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = `900 34px ${fontFamily}`;
  ctx.fillText("자세한 내용은 원문 공고를 확인하세요", 112, 1155);

  ctx.fillStyle = palette.accent;
  roundedRect(ctx, 72, 1240, 250, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 25px ${fontFamily}`;
  ctx.fillText("PosterLink", 114, 1275);
  ctx.fillStyle = "#64748b";
  ctx.font = `800 24px ${fontFamily}`;
  ctx.fillText("정부·지자체·공공기관 공고 모아보기", 348, 1275);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("이미지를 생성하지 못했습니다."));
    }, "image/png");
  });

  return new File([blob], `posterlink-template-${Date.now()}.png`, { type: "image/png" });
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
  const [makerCandidate, setMakerCandidate] = useState<NoticeCandidate | null>(null);
  const [makerDraft, setMakerDraft] = useState<PosterMakerDraft | null>(null);
  const [makerBusy, setMakerBusy] = useState(false);
  const [lastConvertedPoster, setLastConvertedPoster] = useState<ConvertedPosterLink | null>(null);

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
  const activeMakerPalette = makerDraft ? getPalette(makerDraft.accent) : POSTER_PALETTES[0];
  const makerDisabled = makerBusy || Boolean(makerCandidate && updatingId === makerCandidate.id);

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

  const getActiveCandidate = (candidate: NoticeCandidate) => {
    return editingId === candidate.id ? applyEditDraftToCandidate(candidate, editDraft) : candidate;
  };

  const getActiveCandidateOverrides = (candidate: NoticeCandidate): ConvertCandidateOverrides => {
    const activeCandidate = getActiveCandidate(candidate);
    return {
      title: activeCandidate.title,
      source_org_name: activeCandidate.source_org_name,
      source_url: activeCandidate.source_url ?? activeCandidate.source_key,
      category_name: activeCandidate.category_name,
      notice_date: activeCandidate.notice_date,
      application_start_at: activeCandidate.application_start_at,
      application_end_at: activeCandidate.application_end_at,
      summary_short: activeCandidate.summary_short,
      summary_long: activeCandidate.summary_long,
    };
  };

  const openPosterMaker = (candidate: NoticeCandidate) => {
    const activeCandidate = getActiveCandidate(candidate);
    if (!activeCandidate.title.trim()) {
      toast.error("포스터 제목을 입력해주세요.");
      return;
    }
    setMakerCandidate(activeCandidate);
    setMakerDraft(buildPosterMakerDraft(activeCandidate));
  };

  const closePosterMaker = () => {
    setMakerCandidate(null);
    setMakerDraft(null);
    setMakerBusy(false);
  };

  const updateMakerDraft = (field: keyof PosterMakerDraft, value: string) => {
    setMakerDraft((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const convertCandidateWithImage = async (
    candidate: NoticeCandidate,
    file: File,
    overrides?: ConvertCandidateOverrides
  ) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("jpg, png, webp 이미지만 업로드할 수 있습니다.");
      return false;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("이미지는 8MB 이하만 업로드할 수 있습니다.");
      return false;
    }
    const effectiveTitle = normalizePosterText(
      overrides && Object.prototype.hasOwnProperty.call(overrides, "title") ? overrides.title : candidate.title
    );
    if (!effectiveTitle) {
      toast.error("포스터 제목을 입력해주세요.");
      return false;
    }
    const effectiveSourceUrl = overrides && Object.prototype.hasOwnProperty.call(overrides, "source_url")
      ? overrides.source_url
      : candidate.source_url ?? candidate.source_key;
    if (!isValidHttpUrl(effectiveSourceUrl)) {
      toast.error("원문 URL을 확인해주세요.");
      return false;
    }

    setUpdatingId(candidate.id);
    try {
      const formData = new FormData();
      formData.append("id", candidate.id);
      formData.append("image", file);
      const appendOverride = (field: keyof ConvertCandidateOverrides) => {
        if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, field)) return;
        const value = overrides[field];
        if (value !== undefined) formData.append(field, value ?? "");
      };
      appendOverride("title");
      appendOverride("source_org_name");
      appendOverride("source_url");
      appendOverride("category_name");
      appendOverride("notice_date");
      appendOverride("application_start_at");
      appendOverride("application_end_at");
      appendOverride("summary_short");
      appendOverride("summary_long");
      if (overrides?.image_source) formData.append("image_source", overrides.image_source);

      const response = await fetch("/api/admin/notice-candidates/convert", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "포스터로 전환하지 못했습니다.");

      if (payload.poster?.id) {
        setLastConvertedPoster({
          id: payload.poster.id,
          title: payload.poster.title ?? effectiveTitle,
          source_org_name: payload.poster.source_org_name ?? candidate.source_org_name ?? null,
        });
      }
      toast.success("이미지를 붙여 포스터 검수 항목으로 전환했습니다.");
      cancelEditing();
      await loadCandidates();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "포스터로 전환하지 못했습니다.");
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const submitTemplatePoster = async () => {
    if (!makerCandidate || !makerDraft) return;
    if (!makerDraft.title.trim()) {
      toast.error("포스터 제목을 입력해주세요.");
      return;
    }

    setMakerBusy(true);
    try {
      const file = await generateTemplatePosterFile(makerDraft);
      const converted = await convertCandidateWithImage(makerCandidate, file, {
        ...getActiveCandidateOverrides(makerCandidate),
        title: makerDraft.title,
        source_org_name: makerDraft.source_org_name,
        summary_short: makerDraft.summary,
        summary_long: makerCandidate.summary_long,
        category_name: makerDraft.category_name,
        image_source: "template_canvas",
      });
      if (converted) closePosterMaker();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "포스터 이미지를 생성하지 못했습니다.");
    } finally {
      setMakerBusy(false);
    }
  };

  const downloadTemplatePoster = async () => {
    if (!makerDraft) return;
    setMakerBusy(true);
    try {
      const file = await generateTemplatePosterFile(makerDraft);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "포스터 이미지를 저장하지 못했습니다.");
    } finally {
      setMakerBusy(false);
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

      {lastConvertedPoster && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0" size={20} />
              <div className="min-w-0">
                <p className="text-base font-black">검수 포스터로 전환했습니다.</p>
                <p className="mt-1 truncate text-xs text-emerald-700/80 dark:text-emerald-100/80">
                  {lastConvertedPoster.title}
                  {lastConvertedPoster.source_org_name ? ` · ${lastConvertedPoster.source_org_name}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <a
                href={buildAdminPosterReviewHref(lastConvertedPoster.id)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-black text-white transition-colors hover:bg-emerald-800"
              >
                <ExternalLink size={15} />
                검수 열기
              </a>
              <button
                type="button"
                onClick={() => setLastConvertedPoster(null)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-slate-950 dark:text-emerald-100 dark:hover:bg-emerald-500/10"
              >
                <X size={15} />
                닫기
              </button>
            </div>
          </div>
        </section>
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
            const activeCandidate = getActiveCandidate(candidate);
            const sourceUrl = activeCandidate.source_url || activeCandidate.source_key;
            const issues = candidate.quality_issues ?? [];
            const duplicateIssues = getCandidateDuplicateIssues(activeCandidate);
            const disabled = updatingId === candidate.id;
            const isEditing = editingId === candidate.id && editDraft;
            const isConverted = candidate.candidate_status === "converted";
            const imageInputId = `notice-candidate-image-${candidate.id}`;
            const preflightChecks = getCandidatePreflightChecks(activeCandidate);
            const preflightProblems = preflightChecks.filter((check) => check.status !== "pass");
            const hasPreflightBlocker = preflightProblems.some((check) => check.status === "block");

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
                      {duplicateIssues.length > 0 && (
                        <span
                          title={duplicateIssues.map((issue) => `${getDuplicateIssueLabel(issue)}\n${getDuplicateIssueDetail(issue)}`).join("\n\n")}
                          className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"
                        >
                          <AlertTriangle size={13} />
                          중복 의심 {duplicateIssues.length}
                        </span>
                      )}
                      {preflightProblems.length > 0 && (
                        <span
                          title={preflightProblems.map((check) => `${check.label}: ${check.detail}`).join("\n")}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${
                            hasPreflightBlocker
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
                          }`}
                        >
                          <AlertTriangle size={13} />
                          전환 체크 {preflightProblems.length}
                        </span>
                      )}
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
                    <input
                      id={imageInputId}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void convertCandidateWithImage(candidate, file, getActiveCandidateOverrides(candidate));
                      }}
                    />
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
                      disabled={disabled || isConverted}
                      onClick={() => document.getElementById(imageInputId)?.click()}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-3 text-xs font-black text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-slate-200"
                    >
                      {disabled ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                      이미지 업로드
                    </button>
                    <button
                      type="button"
                      disabled={disabled || isConverted}
                      onClick={() => openPosterMaker(candidate)}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Wand2 size={15} />
                      간단 제작
                    </button>
                    {candidate.generated_poster_id && (
                      <a
                        href={buildAdminPosterReviewHref(candidate.generated_poster_id)}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                      >
                        <CheckCircle2 size={15} />
                        포스터 검수
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => updateStatus(candidate, "drafting")}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 text-xs font-black text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200"
                    >
                      {disabled ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                      제작중
                    </button>
                    {isConverted && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => updateStatus(candidate, "converted")}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 size={15} />
                        완료
                      </button>
                    )}
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

                {preflightProblems.length > 0 && (
                  <details className="mt-4 rounded-lg border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <summary className="cursor-pointer text-xs font-black text-amber-800 dark:text-amber-100">
                      전환 전 체크리스트 보기
                    </summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {preflightChecks.map((check) => (
                        <div
                          key={check.key}
                          className={`rounded-lg border px-3 py-2 ${getCandidatePreflightToneClass(check.status)}`}
                        >
                          <p className="text-xs font-black">{check.label}</p>
                          <p className="mt-1 text-[11px] font-bold leading-4 opacity-80">{check.detail}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {(candidate.summary_long || issues.length > 0 || duplicateIssues.length > 0 || candidate.admin_note) && (
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
                    {duplicateIssues.length > 0 && (
                      <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50/70 p-3 dark:border-rose-500/20 dark:bg-rose-500/10">
                        <p className="flex items-center gap-1.5 text-xs font-black text-rose-700 dark:text-rose-100">
                          <AlertTriangle size={13} />
                          중복 의심 근거
                        </p>
                        <div className="mt-3 space-y-2">
                          {duplicateIssues.slice(0, 5).map((issue, index) => (
                            <div key={`${issue.code ?? "duplicate"}-${issue.duplicatePosterId ?? index}`} className="rounded-lg bg-white/80 p-3 text-xs font-bold leading-5 text-rose-900 dark:bg-slate-950/40 dark:text-rose-100">
                              <p className="font-black">{getDuplicateIssueLabel(issue)}</p>
                              <p className="mt-1 opacity-80">{getDuplicateIssueDetail(issue)}</p>
                              {issue.duplicatePosterId && (
                                <a
                                  href={`/admin/posters?posterId=${issue.duplicatePosterId}`}
                                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-rose-700 underline-offset-2 hover:underline dark:text-rose-200"
                                >
                                  <ExternalLink size={12} />
                                  기존 포스터 열기
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
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

      {makerCandidate && makerDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 dark:border-slate-800">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-500">Template Poster</p>
                <h2 className="mt-2 text-2xl font-black text-gray-950 dark:text-white">간단 포스터 제작</h2>
              </div>
              <button
                type="button"
                onClick={closePosterMaker}
                disabled={makerDisabled}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                title="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-6 p-5 lg:grid-cols-[380px_1fr]">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="mx-auto aspect-[4/5] w-full max-w-[320px] overflow-hidden rounded-lg bg-white shadow-sm">
                  <div className="flex h-[31%] flex-col justify-between p-5 text-white" style={{ backgroundColor: activeMakerPalette.accent }}>
                    <span className="w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-black">{makerDraft.category_name || "공고"}</span>
                    <div>
                      <h3 className="line-clamp-4 text-2xl font-black leading-tight">{makerDraft.title || "공고 제목"}</h3>
                      <p className="mt-2 text-xs font-black text-white/80">{makerDraft.source_org_name || "기관명"}</p>
                    </div>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="rounded-lg p-4" style={{ backgroundColor: activeMakerPalette.soft }}>
                      <p className="text-xs font-black" style={{ color: activeMakerPalette.dark }}>신청 기간</p>
                      <p className="mt-2 line-clamp-2 text-base font-black text-gray-950">{makerDraft.period_text || "원문 공고 확인"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black text-gray-400">주요 내용</p>
                      <p className="mt-2 line-clamp-6 text-sm font-black leading-6 text-gray-700">{makerDraft.summary || "자세한 내용은 원문 공고를 확인하세요."}</p>
                    </div>
                    <div className="border-t border-gray-100 pt-4">
                      <p className="text-sm font-black text-gray-950">자세한 내용은 원문 공고를 확인하세요</p>
                      <p className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black text-white" style={{ backgroundColor: activeMakerPalette.accent }}>PosterLink</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                    제목
                    <textarea
                      value={makerDraft.title}
                      onChange={(event) => updateMakerDraft("title", event.target.value)}
                      rows={3}
                      className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold leading-6 text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                  <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                    기관명
                    <input
                      value={makerDraft.source_org_name}
                      onChange={(event) => updateMakerDraft("source_org_name", event.target.value)}
                      className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                  <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                    분류
                    <input
                      value={makerDraft.category_name}
                      onChange={(event) => updateMakerDraft("category_name", event.target.value)}
                      className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                  <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                    기간
                    <input
                      value={makerDraft.period_text}
                      onChange={(event) => updateMakerDraft("period_text", event.target.value)}
                      className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                </div>

                <label className="block text-xs font-black text-gray-500 dark:text-slate-300">
                  주요 내용
                  <textarea
                    value={makerDraft.summary}
                    onChange={(event) => updateMakerDraft("summary", event.target.value)}
                    rows={5}
                    className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold leading-6 text-gray-950 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  />
                </label>

                <div>
                  <p className="text-xs font-black text-gray-500 dark:text-slate-300">색상</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {POSTER_PALETTES.map((palette) => (
                      <button
                        key={palette.accent}
                        type="button"
                        onClick={() => updateMakerDraft("accent", palette.accent)}
                        className={`h-9 w-9 rounded-full border-4 transition-transform hover:scale-105 ${
                          makerDraft.accent === palette.accent ? "border-gray-950 dark:border-white" : "border-white dark:border-slate-700"
                        }`}
                        style={{ backgroundColor: palette.accent }}
                        aria-label={`${palette.name} 색상`}
                        title={`${palette.name} 색상`}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                  원문과 기간을 확인한 뒤 전환하세요. 생성된 이미지는 검수 화면에서 한 번 더 승인해야 공개됩니다.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 p-5 dark:border-slate-800">
              <button
                type="button"
                onClick={downloadTemplatePoster}
                disabled={makerDisabled}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-xs font-black text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {makerBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                PNG 저장
              </button>
              <button
                type="button"
                onClick={submitTemplatePoster}
                disabled={makerDisabled}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-4 text-xs font-black text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-slate-200"
              >
                {makerBusy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                검수 포스터로 전환
              </button>
            </div>
          </div>
        </div>
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
