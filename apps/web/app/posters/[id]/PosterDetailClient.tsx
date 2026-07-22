"use client";
import toast from "react-hot-toast";

import { useState, useEffect } from "react";
import { Header } from "../../components/Header";
import { BottomNav } from "../../components/BottomNav";
import { CommentSection } from "../../components/CommentSection";
import { PosterImageCarousel } from "../../components/PosterImageCarousel";
import { supabase } from "../../lib/supabase";
import { fetchPosterMetricCounts, logPosterView } from "../../lib/posterMetrics";
import { resolvePosterImageGallery } from "../../../lib/posterImage";
import { Footer } from "../../components/Footer";
import { ChevronLeft, ChevronRight, Eye, Heart, Link2, Share2, X } from "lucide-react";

export type PosterDetailPoster = {
  id: string;
  title: string;
  source_org_name: string | null;
  summary_short: string | null;
  summary_long: string | null;
  poster_status: string | null;
  application_start_at?: string | null;
  application_end_at: string | null;
  thumbnail_url: string | null;
  source_key: string | null;
  field_verification?: Record<string, any> | null;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  categoryId?: string | null;
  regionId?: string | null;
  categoryIds?: string[];
  regionIds?: string[];
  categoryName?: string | null;
  regionName?: string | null;
  images?: string[];
};

export type PosterDetailLink = {
  id: string;
  poster_id: string;
  link_type: string | null;
  title: string | null;
  url: string;
  is_primary: boolean | null;
};

function isKakaoLink(link: PosterDetailLink) {
  return /kakao|카카오/i.test(`${link.title ?? ""} ${link.url}`);
}

function getLinkActionLabel(link: PosterDetailLink, context: "primary" | "reference" = "primary") {
  if (/^mailto:/i.test(link.url)) return "이메일 신청방법 확인";
  if (/^tel:/i.test(link.url)) return "전화로 신청";
  if (isKakaoLink(link)) return "카카오톡으로 문의";

  switch (link.link_type) {
    case "official_apply":
      return "신청 페이지로 이동";
    case "official_notice":
      return context === "reference" ? "공식 공고 원문 보기" : "공식 공고 확인";
    case "official_homepage":
      return "공식 홈페이지 보기";
    case "reference_blog":
      return link.title || "참고 블로그 보기";
    case "reference_news":
      return link.title || "관련 기사 보기";
    case "reference_video":
      return link.title || "관련 영상 보기";
    default:
      return link.title || "관련 링크 보기";
  }
}

function getPrimaryActionLink(links: PosterDetailLink[]) {
  return (
    links.find((link) => link.link_type === "official_apply" && link.is_primary) ||
    links.find((link) => link.link_type === "official_apply") ||
    links.find((link) => link.is_primary) ||
    links.find((link) => link.link_type === "official_notice") ||
    links[0] ||
    null
  );
}

function parseDateTime(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function formatKoreanDate(value?: string | null) {
  const time = parseDateTime(value);
  if (time === null) return null;
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function formatKoreanDateTime(value?: string | null) {
  const time = parseDateTime(value);
  if (time === null) return "확인 필요";
  const date = new Date(time);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${formatKoreanDate(value)} ${hours}:${minutes}`;
}

function formatApplicationPeriod(startAt?: string | null, endAt?: string | null) {
  const startLabel = formatKoreanDate(startAt);
  const endLabel = formatKoreanDate(endAt);
  const hasInvalidDate = Boolean(startAt && !startLabel) || Boolean(endAt && !endLabel);

  if (hasInvalidDate) return "기관 공고 확인";
  if (startLabel && endLabel) return `${startLabel} ~ ${endLabel}까지`;
  if (endLabel) return `${endLabel}까지`;
  if (startLabel) return `${startLabel}부터 상시 모집`;
  return "상시 모집";
}

function formatHostName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeOrgDisplayValue(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getOrganizationVerification(poster: PosterDetailPoster) {
  const organization = poster.field_verification?.organization;
  if (!organization || typeof organization !== "object") return null;

  const sourceOrgName = normalizeOrgDisplayValue(organization.sourceOrgName);
  const displayOrgName = normalizeOrgDisplayValue(organization.displayOrgName);
  const organizerName = normalizeOrgDisplayValue(organization.organizerName);
  const operatorName = normalizeOrgDisplayValue(organization.operatorName);
  const boardName = normalizeOrgDisplayValue(organization.boardName);

  if (!sourceOrgName && !displayOrgName && !organizerName && !operatorName && !boardName) return null;

  return {
    sourceOrgName,
    displayOrgName,
    organizerName,
    operatorName,
    boardName,
    sourceDiffersFromOrganizer: Boolean(organization.sourceDiffersFromOrganizer),
  };
}

function getPosterOrgDisplayName(poster: PosterDetailPoster) {
  return getOrganizationVerification(poster)?.displayOrgName || poster.source_org_name || null;
}

type SummaryLine = {
  label?: string;
  text: string;
};

const CIRCLED_SECTION_LABELS: Record<string, string> = {
  "①": "목적",
  "②": "신청대상",
  "③": "신청기간",
  "④": "진행일정",
  "⑤": "진행내용",
  "⑥": "진행장소",
  "⑦": "참여혜택",
  "⑧": "문의",
  "⑨": "기타",
  "⑩": "기타",
};

const SUMMARY_LABELS = [
  "대상",
  "내용",
  "주요내용",
  "지원내용",
  "교육내용",
  "교육 내용",
  "교육일시",
  "교육 일시",
  "교육장소",
  "교육 장소",
  "교육대상",
  "교육 대상",
  "사업내용",
  "프로그램",
  "참여인원",
  "모집인원",
  "참가비용",
  "인원",
  "기간",
  "신청기간",
  "신청 기간",
  "일시",
  "장소",
  "문의",
  "문의처",
  "신청",
  "신청방법",
  "비용",
  "혜택",
  "신청대상",
  "진행일정",
  "진행내용",
  "진행장소",
  "참가비",
  "신청문의",
];

const SUMMARY_LABEL_PATTERN = SUMMARY_LABELS
  .sort((a, b) => b.length - a.length)
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

function normalizeNumberedLabel(value: string): string {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/연락처/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeSummaryLabel(value: string | undefined): string | undefined {
  const label = value?.replace(/\s+/g, "").trim();
  return label || undefined;
}

function normalizeSummaryText(value: string): string {
  return value
    .replace(/\s*첨부파일\s+.*$/g, "")
    .replace(/\s*찾아가기\s+.*$/g, "")
    .replace(/[📌🎁☕🚀]/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/([0-9])\uFE0F?\u20E3/g, "$1.")
    .replace(/\s+\*\s+/g, "\n* ")
    .replace(/([.!?])(?=[가-힣])/g, "$1 ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function splitDisplayParagraphs(value: string): string[] {
  return value
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?。]|[다요함됨음임])\s+(?=[가-힣A-Za-z0-9])/))
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitNumberedItems(value: string): Array<{ number: string; body: string; instructor?: string }> {
  const matches = [...value.matchAll(/(?:^|\s)(\d{1,2})[.)]\s+/g)];
  if (matches.length < 2) return [];

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? value.length;
    const itemText = value.slice(start, end).trim();
    const [body, instructor] = itemText.split(/\s+강사:\s+/, 2);

    return {
      number: match[1],
      body: body.trim(),
      instructor: instructor?.trim(),
    };
  }).filter((item) => item.body);
}

function splitDashItems(value: string): string[] {
  const items = value
    .split(/\s+-\s+(?=\d{1,2}[/.월]|\d{4}|[가-힣A-Za-z])/)
    .map((item) => item.replace(/^\-\s*/, "").trim())
    .filter(Boolean);

  return items.length > 1 ? items : [];
}

function removeDanglingDuplicateLines(lines: SummaryLine[]): SummaryLine[] {
  return lines.filter((line, index) => {
    const current = line.text.replace(/\s+/g, " ").trim();
    const next = lines[index + 1]?.text.replace(/\s+/g, " ").trim();
    if (!next) return true;

    const dangling = current.replace(/[(:（]\s*$/, "").trim();
    const danglingWithoutHeading = dangling.replace(/^교육\s*내용\s+/, "").trim();
    return !(current !== dangling && (next.startsWith(dangling) || next.startsWith(danglingWithoutHeading)));
  });
}

function splitNumberedSections(value: string, fallbackLabel?: string): SummaryLine[] {
  const sectionPattern = /([①②③④⑤⑥⑦⑧⑨⑩])\s*([^①②③④⑤⑥⑦⑧⑨⑩]+)/g;
  const firstSectionIndex = value.search(/[①②③④⑤⑥⑦⑧⑨⑩]/);
  if (firstSectionIndex < 0) return [{ label: fallbackLabel, text: value }];

  const lines: SummaryLine[] = [];
  const intro = value.slice(0, firstSectionIndex).trim();
  if (intro) lines.push({ label: fallbackLabel, text: intro });

  for (const match of value.matchAll(sectionPattern)) {
    const marker = match[1];
    const section = match[2].replace(/\s+/g, " ").trim();
    if (!section) continue;

    const titleMatch = section.match(/^(목적(?:\([^)]*\))?|신청대상|신청기간|진행일정|진행내용|진행장소|참여혜택|문의\s*연락처|문의처|문의|대상|내용|기간|일시|장소)\s*(.*)$/);
    const rawLabel = titleMatch?.[1]?.trim() ?? CIRCLED_SECTION_LABELS[marker] ?? marker;
    const label = normalizeNumberedLabel(rawLabel) || CIRCLED_SECTION_LABELS[marker] || marker;
    const text = normalizeSummaryText(titleMatch?.[2] || section);

    lines.push({
      label,
      text: text || section,
    });
  }

  return lines;
}

function formatSummaryLines(value: string | null | undefined): SummaryLine[] {
  const text = String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/^상세정보\s+/, "")
    .replace(/\s+(교육\s*개요|신청\s*안내)\s+/g, "\n")
    .replace(/\s*[🎵]\s*/g, "\n")
    .replace(/\s*[·•]\s*/g, "\n")
    .replace(/\s+(?=교육\s*내용\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|\d\uFE0F?\u20E3|\d[.)]))/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!text) return [];
  if (/[①②③④⑤⑥⑦⑧⑨⑩]/.test(text) && !new RegExp(`^(${SUMMARY_LABEL_PATTERN})\\s*:`).test(text)) {
    return removeDanglingDuplicateLines(splitNumberedSections(text));
  }

  const normalized = text
    .replace(new RegExp(`\\s+(?=(${SUMMARY_LABEL_PATTERN})\\s*[:：-])`, "g"), "\n")
    .replace(new RegExp(`^(${SUMMARY_LABEL_PATTERN})\\s*[:：-]`, "g"), "$1:");

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines.map((line) => {
    const match = line.match(new RegExp(`^(${SUMMARY_LABEL_PATTERN})\\s*[:：-]\\s*(.+)$`));
    if (!match) {
      const looseMatch = line.match(/^(교육\s*내용)\s+(.+)$/);
      if (looseMatch) {
        return { label: normalizeSummaryLabel(looseMatch[1]), text: normalizeSummaryText(looseMatch[2]) };
      }
      return { text: normalizeSummaryText(line) };
    }
    return { label: normalizeSummaryLabel(match[1]), text: normalizeSummaryText(match[2]) };
  }).flatMap((line) => splitNumberedSections(line.text, line.label));

  if (parsed.length > 1 || parsed.some((line) => line.label)) {
    return removeDanglingDuplicateLines(parsed);
  }

  return text
    .split(/(?<=[.!?。]|[다요함됨음임])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ text: line }));
}

function renderSummaryContent(line: SummaryLine) {
  const numberedItems = splitNumberedItems(line.text);

  if (numberedItems.length > 0) {
    return (
      <div className="min-w-0 space-y-3">
        {numberedItems.map((item) => (
          <div key={`${item.number}-${item.body}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[10px] font-black text-white">
              {item.number}
            </span>
            <div className="min-w-0 space-y-1 break-keep [overflow-wrap:anywhere]">
              <p>{item.body}</p>
              {item.instructor && (
                <p className="text-xs font-bold text-gray-500">
                  강사: {item.instructor}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const dashItems = splitDashItems(line.text);
  if (dashItems.length > 0) {
    return (
      <div className="min-w-0 space-y-2">
        {dashItems.map((item, index) => (
          <div key={`${item}-${index}`} className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gray-400" />
            <p className="min-w-0 break-keep [overflow-wrap:anywhere]">{item}</p>
          </div>
        ))}
      </div>
    );
  }

  const paragraphs = splitDisplayParagraphs(line.text);
  return (
    <div className="min-w-0 space-y-1.5 break-keep [overflow-wrap:anywhere]">
      {paragraphs.map((paragraph, index) => (
        <p key={`${paragraph}-${index}`}>{paragraph}</p>
      ))}
    </div>
  );
}

export function PosterDetailClient({
  poster,
  links,
  initialViewCount = 0,
  initialFavoriteCount = 0,
}: {
  poster: PosterDetailPoster;
  links: PosterDetailLink[];
  initialViewCount?: number;
  initialFavoriteCount?: number;
}) {
  const [isFavorited, setIsFavorited] = useState(false);
  const [viewCount, setViewCount] = useState(initialViewCount);
  const [favoriteCount, setFavoriteCount] = useState(initialFavoriteCount);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [expandedImageIndex, setExpandedImageIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void fetchPosterMetricCounts([poster.id]).then((metricCounts) => {
      if (cancelled) return;
      setViewCount(metricCounts.viewCounts[poster.id] ?? initialViewCount);
      setFavoriteCount(metricCounts.favoriteCounts[poster.id] ?? initialFavoriteCount);
    }).finally(() => {
      void logPosterView(poster.id).then((logged) => {
        if (!cancelled && logged) {
          setViewCount((count) => count + 1);
        }
      });
    });

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (cancelled || !user) return;
      const { data: favData } = await supabase
        .from("favorites")
        .select("poster_id")
        .eq("user_id", user.id)
        .eq("poster_id", poster.id)
        .maybeSingle();
      if (!cancelled) setIsFavorited(!!favData);
    });

    return () => {
      cancelled = true;
    };
  }, [initialFavoriteCount, initialViewCount, poster.id]);

  const toggleFavorite = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("로그인이 필요합니다.");
      return;
    }

    if (isFavorited) {
      const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("poster_id", poster.id);
      if (!error) {
        setIsFavorited(false);
        setFavoriteCount((count) => Math.max(0, count - 1));
      }
    } else {
      const { error } = await supabase.from("favorites").insert({ user_id: user.id, poster_id: poster.id });
      if (!error) {
        setIsFavorited(true);
        setFavoriteCount((count) => count + 1);
      }
    }
  };

  const logOfficialLinkClick = (link: any) => {
    if (!link?.url || link.url === "#") return;

    const body = JSON.stringify({
      poster_id: poster.id,
      link_id: link.id ?? null,
      link_type: link.link_type ?? null,
      link_url: link.url,
      referrer_path: window.location.pathname,
    });

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        const queued = navigator.sendBeacon("/api/poster-link-clicks", blob);
        if (queued) return;
      }

      void fetch("/api/poster-link-clicks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    } catch (error) {
      console.warn("Failed to queue poster link click log:", error);
    }
  };

  const deadlineTime = parseDateTime(poster.application_end_at);
  const hasInvalidDeadline = Boolean(poster.application_end_at && deadlineTime === null);
  const daysLeft = deadlineTime === null
    ? null
    : Math.ceil((deadlineTime - new Date().getTime()) / (1000 * 60 * 60 * 24));

  const imageUrls = resolvePosterImageGallery(poster.images ?? [], poster.thumbnail_url, poster.source_key);
  const primaryLink = getPrimaryActionLink(links);
  const sourceLink = links.find((link) => link.link_type === "official_notice") || primaryLink;
  const primaryActionLabel = primaryLink ? getLinkActionLabel(primaryLink) : "공식 공고 확인";
  const referenceLinks = links.filter((link) => link.id !== primaryLink?.id);
  const summaryLines = formatSummaryLines(poster.summary_long || poster.summary_short);
  const applicationPeriodLabel = formatApplicationPeriod(poster.application_start_at, poster.application_end_at);
  const lastCheckedLabel = formatKoreanDateTime(poster.updated_at || poster.created_at || poster.published_at);
  const sourceHostLabel = sourceLink ? formatHostName(sourceLink.url) : null;
  const organizationInfo = getOrganizationVerification(poster);
  const displayOrgName = getPosterOrgDisplayName(poster);
  const showViewCount = viewCount >= 100;
  const showFavoriteCount = favoriteCount >= 10;
  const statusLabel = hasInvalidDeadline ? "기관 확인 필요" : daysLeft === null ? "상시 모집" : daysLeft < 0 ? "마감됨" : daysLeft === 0 ? "오늘 마감" : "신청 가능";
  const statusClass = hasInvalidDeadline
    ? "bg-amber-50 text-amber-700 border-amber-100"
    : daysLeft === null
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
    : daysLeft < 0
      ? "bg-slate-100 text-slate-500 border-slate-200"
      : daysLeft <= 3
        ? "bg-rose-50 text-rose-600 border-rose-100"
        : "bg-emerald-50 text-emerald-700 border-emerald-100";
  const moveExpandedImage = (offset: number) => {
    setExpandedImageIndex((index) => (index + offset + imageUrls.length) % imageUrls.length);
  };

  return (
    <div className="min-h-screen bg-white pb-24 md:pb-10">
      <Header />
      <main className="container mx-auto max-w-2xl px-4 py-6">
        <div
          className="aspect-[3/4] w-full rounded-2xl overflow-hidden border shadow-lg mb-6 bg-gray-100 flex items-center justify-center relative"
          aria-label="포스터 이미지 크게 보기"
        >
          <PosterImageCarousel
            images={imageUrls}
            title={poster.title}
            org={displayOrgName}
            fallbackClassName="p-8"
            imgClassName="h-full w-full object-contain bg-gray-50"
            showControls
            iconSize={34}
            onImageClick={(_, index) => {
              setExpandedImageIndex(index);
              setImageExpanded(true);
            }}
          />
        </div>

        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass}`}>
              {statusLabel}
            </span>
            {daysLeft !== null && daysLeft >= 0 && (
              <span className={`rounded-full px-3 py-1 text-xs font-black text-white ${daysLeft <= 3 ? "bg-rose-500" : "bg-blue-600"}`}>
                {daysLeft === 0 ? "D-Day" : `D-${daysLeft}`}
              </span>
            )}
            <span className="text-sm text-gray-500 font-bold">{displayOrgName}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-4">{poster.title}</h1>
          <div className="flex flex-wrap gap-2">
            {poster.categoryName && (
              <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-black rounded-full">
                #{poster.categoryName}
              </span>
            )}
            {poster.regionName && (
              <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-black rounded-full">
                #{poster.regionName}
              </span>
            )}
          </div>
          {organizationInfo?.sourceDiffersFromOrganizer && organizationInfo.sourceOrgName && (
            <p className="mt-3 text-xs font-bold text-gray-400">
              수집 출처: {organizationInfo.sourceOrgName}
              {organizationInfo.boardName ? ` · ${organizationInfo.boardName}` : ""}
            </p>
          )}
          {(showViewCount || showFavoriteCount) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {showViewCount && (
                <span className="inline-flex items-center gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-600">
                  <Eye size={14} />
                  조회 {viewCount.toLocaleString()}
                </span>
              )}
              {showFavoriteCount && (
                <span className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600">
                  <Heart size={14} fill="currentColor" />
                  찜 {favoriteCount.toLocaleString()}
                </span>
              )}
            </div>
          )}

          <a
            href={primaryLink?.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              if (!primaryLink) {
                event.preventDefault();
                toast.error("등록된 공식 링크가 없습니다.");
                return;
              }
              void logOfficialLinkClick(primaryLink);
            }}
            className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-lg shadow-blue-100 transition-colors hover:bg-blue-700"
          >
            {primaryActionLabel}
          </a>
        </div>

        <section className="p-6 bg-gray-50 rounded-3xl mb-8 border border-gray-100">
          <h2 className="text-sm font-black text-blue-600 mb-5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full" /> 핵심 모집 요약
          </h2>
          <ul className="space-y-4 text-sm text-gray-700 font-medium">
            <li className="flex gap-4">
              <span className="text-gray-400 w-16 flex-shrink-0">신청기간</span>
              <span className="text-gray-900 font-bold">
                {applicationPeriodLabel}
              </span>
            </li>
            <li className="flex gap-4">
              <span className="text-gray-400 w-16 flex-shrink-0">대상지역</span>
              <span className="text-gray-900 font-bold">{poster.regionName || "전국"}</span>
            </li>
            {summaryLines.map((line, index) => (
              <li key={`${line.label ?? "line"}-${index}`} className="flex gap-4">
                <span className="text-gray-400 w-16 flex-shrink-0">
                  {index === 0 ? "주요내용" : ""}
                </span>
                <div className="grid min-w-0 flex-1 grid-cols-[4rem_minmax(0,1fr)] gap-2 text-gray-900 font-bold leading-relaxed sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                  {line.label && (
                    <span className="mt-0.5 inline-flex h-6 w-fit items-center rounded-md bg-blue-50 px-2 text-[11px] font-black text-blue-600 ring-1 ring-blue-100">
                      {line.label}
                    </span>
                  )}
                  {!line.label && <span aria-hidden="true" />}
                  {renderSummaryContent(line)}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl mb-10">
          <p className="text-[11px] text-blue-600 font-bold text-center leading-relaxed">
            정확한 신청 자격 및 절차는 아래 버튼을 눌러<br />공식 공고문을 반드시 확인해 주세요.
          </p>
        </div>

        <section className="mb-10 rounded-2xl border border-gray-100 bg-white p-5">
          <dl className="grid gap-4 text-xs sm:grid-cols-4">
            {displayOrgName && (
              <div>
                <dt className="mb-1 font-black text-gray-400">주최/주관</dt>
                <dd className="font-bold text-gray-900">{displayOrgName}</dd>
              </div>
            )}
            <div>
              <dt className="mb-1 font-black text-gray-400">원문 출처</dt>
              <dd className="font-bold text-gray-900">
                {sourceLink ? (
                  <a
                    href={sourceLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void logOfficialLinkClick(sourceLink)}
                    className="text-blue-600 underline-offset-4 hover:underline"
                  >
                    {organizationInfo?.sourceOrgName || sourceHostLabel || "공식 원문"}
                  </a>
                ) : (
                  "공식 링크 확인 필요"
                )}
              </dd>
            </div>
            <div>
              <dt className="mb-1 font-black text-gray-400">최종 확인</dt>
              <dd className="font-bold text-gray-900">{lastCheckedLabel}</dd>
            </div>
            <div>
              <dt className="mb-1 font-black text-gray-400">공고 상태</dt>
              <dd className="font-bold text-gray-900">{statusLabel}</dd>
            </div>
          </dl>
        </section>

        {referenceLinks.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-bold mb-4">관련 링크</h2>
            <div className="space-y-2">
              {referenceLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void logOfficialLinkClick(link)}
                  className="block p-4 border rounded-2xl hover:bg-gray-50 transition-colors text-sm font-bold text-gray-700 flex items-center justify-between"
                >
                  {getLinkActionLabel(link, "reference")}
                  <span className="text-gray-300">→</span>
                </a>
              ))}
            </div>
          </section>
        )}

        <CommentSection posterId={poster.id} />

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t md:relative md:bg-transparent md:border-none md:p-0">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button
              onClick={toggleFavorite}
              className={`w-14 h-14 flex items-center justify-center border rounded-2xl transition-all shadow-sm ${
                isFavorited ? "bg-rose-50 border-rose-200" : "bg-white border-gray-100"
              }`}
            >
              <Heart size={20} className={isFavorited ? "text-rose-500" : "text-gray-500"} fill={isFavorited ? "currentColor" : "none"} />
            </button>

            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success("링크가 복사되었습니다.");
              }}
              className="w-14 h-14 flex items-center justify-center border border-gray-100 bg-white rounded-2xl transition-all shadow-sm hover:bg-gray-50"
              title="링크 복사"
            >
              <Link2 size={20} className="text-gray-500" />
            </button>

            <button
              onClick={async () => {
                if (navigator.share) {
                  await navigator.share({ title: poster.title, text: poster.summary_short ?? "", url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("링크가 복사되었습니다.");
                }
              }}
              className="w-14 h-14 flex items-center justify-center border border-gray-100 bg-white rounded-2xl transition-all shadow-sm hover:bg-gray-50"
              title="공유"
            >
              <Share2 size={20} className="text-gray-500" />
            </button>

            <a
              href={primaryLink?.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                if (!primaryLink) {
                  event.preventDefault();
                  toast.error("등록된 공식 링크가 없습니다.");
                  return;
                }

                void logOfficialLinkClick(primaryLink);
              }}
              className="flex-1 h-14 flex items-center justify-center bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-200"
            >
              {primaryActionLabel}
            </a>
          </div>
        </div>
      </main>
      {imageExpanded && imageUrls.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="포스터 이미지 크게 보기"
          onClick={() => setImageExpanded(false)}
        >
          <button
            type="button"
            onClick={() => setImageExpanded(false)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
            aria-label="닫기"
          >
            <X size={22} />
          </button>
          {imageUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  moveExpandedImage(-1);
                }}
                className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                aria-label="이전 이미지"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  moveExpandedImage(1);
                }}
                className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                aria-label="다음 이미지"
              >
                <ChevronRight size={24} />
              </button>
              <div className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white backdrop-blur">
                {expandedImageIndex + 1}/{imageUrls.length}
              </div>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrls[expandedImageIndex] ?? imageUrls[0]}
            alt={poster.title}
            className="max-h-[88vh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
          {imageUrls.length > 1 && (
            <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-white/10 px-3 py-2 backdrop-blur">
              {imageUrls.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedImageIndex(index);
                  }}
                  className={`h-2 rounded-full transition-all ${index === expandedImageIndex ? "w-6 bg-white" : "w-2 bg-white/40"}`}
                  aria-label={`${index + 1}번째 이미지 보기`}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <Footer />
      <BottomNav />
    </div>
  );
}
