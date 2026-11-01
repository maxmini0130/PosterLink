"use client";
import toast from "react-hot-toast";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Share2, X } from "lucide-react";

import { Header } from "../../components/Header";
import { BottomNav } from "../../components/BottomNav";
import { CommentSection } from "../../components/CommentSection";
import { Footer } from "../../components/Footer";
import { PosterImageCarousel } from "../../components/PosterImageCarousel";
import { ActionBar, FavoriteButton, PrimaryActionLink } from "../../components/pl/ActionBar";
import { ApplyMark } from "../../components/pl/ApplyMark";
import { BottomSheet } from "../../components/pl/BottomSheet";
import { DdayStamp } from "../../components/pl/DdayStamp";
import { DeadlineLabel, ReceptionChip } from "../../components/pl/DeadlineLabel";
import { PosterListCard, type PlPosterCardData } from "../../components/pl/PosterListCard";
import { PosterThumb } from "../../components/pl/PosterThumb";
import { SectionHeader } from "../../components/pl/SectionHeader";
import { showActionToast } from "../../components/pl/actionToast";
import { InstitutionFollowButton } from "../../institutions/InstitutionFollowButton";
import { supabase } from "../../lib/supabase";
import { logPosterView } from "../../lib/posterMetrics";
import {
  PENDING_ACTION_DONE_EVENT,
  PENDING_NOT_STORED_MESSAGE,
  continueWithKakao,
  forgetGuestFavorite,
  guestLocal,
  isGuestFavorite,
  rememberActionForLogin,
  saveGuestFavorite,
  type PendingActionDoneDetail,
} from "../../lib/guestSession";
import { getDeadlineDisplay, receptionEndedOn } from "../../../lib/deadlineDisplay";
import { readGuestInterest } from "../../../lib/guestInterest";
import type { UserStatus } from "../../../lib/myPosters";
import {
  formatApplicationPeriod,
  formatPosterDate,
  formatPosterDateTime,
} from "../../../lib/posterApplication";
import { buildVerifiedPosterCalendar } from "../../../lib/posterCalendar";
import { getVerifiedPosterCalendarSource } from "../../../lib/posterStructuredTrust";
import { resolvePosterImageGallery } from "../../../lib/posterImage";
import {
  derivePosterSummaryFallbackFacts,
  extractTargetAgeRange,
} from "../../../lib/posterSummaryFacts";
import { usePosterClock } from "../../../lib/usePosterClock";
import { FieldReportButton } from "./FieldReportButton";
import { ClosedPosterAlertCta, type AlertDefaults } from "./ClosedPosterAlertCta";
import { trackAlertEvent } from "../../../lib/alertAnalytics";

import { trackAnalytics, setAnalyticsLoginStatus } from "../../../lib/analytics";
import { consumePosterViewSource, promptSignup, trackProductEvent } from "../../../lib/productEvents";
import { shareUrl } from "../../../lib/productEventsCore";

export type PosterDetailPoster = {
  id: string;
  title: string;
  source_org_name: string | null;
  summary_short: string | null;
  summary_long: string | null;
  poster_status: string | null;
  application_start_at?: string | null;
  application_end_at: string | null;
  organizer_name?: string | null;
  application_organization_name?: string | null;
  deadline_type?: string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  eligibility_summary?: string | null;
  target_age_min?: number | null;
  target_age_max?: number | null;
  participation_fee?: string | null;
  benefits_summary?: string | null;
  recruitment_count?: string | null;
  application_method?: string | null;
  required_documents?: string | null;
  contact_info?: string | null;
  event_location?: string | null;
  verified_at?: string | null;
  verification_status?: string | null;
  data_confidence?: number | null;
  thumbnail_url: string | null;
  source_key: string | null;
  organizer_id?: string | null;
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

function formatHostName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeOrgDisplayValue(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
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
    sourceDiffersFromOrganizer: Boolean(organization.sourceDiffersFromOrganizer)
  };
}

function getPosterOrgDisplayName(poster: PosterDetailPoster) {
  return poster.organizer_name || getOrganizationVerification(poster)?.displayOrgName || poster.source_org_name || null;
}

function formatTargetAge(min?: number | null, max?: number | null) {
  if (min != null && max != null) return `만 ${min}세 ~ ${max}세`;
  if (min != null) return `만 ${min}세 이상`;
  if (max != null) return `만 ${max}세 이하`;
  return "연령 조건 확인 필요";
}

function publicInformationCheckLabel(poster: PosterDetailPoster) {
  const checkedAt = formatPosterDateTime(poster.verified_at);
  if (poster.verification_status === "verified" && checkedAt) return checkedAt;
  return "공식 공고 확인 권장";
}

function downloadPosterCalendar(poster: PosterDetailPoster, link?: string | null) {
  const calendar = buildVerifiedPosterCalendar(poster, link);
  if (!calendar) return false;

  const url = URL.createObjectURL(new Blob([calendar.content], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = calendar.filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
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
  "⑩": "기타"
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
  "참여비용",
  "참여 비용",
  "참여선정안내",
  "참여 선정 안내",
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
  "주의",
  "참고"
];

const SUMMARY_LABEL_PATTERN = SUMMARY_LABELS.sort((a, b) => b.length - a.length)
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

  return matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[index + 1]?.index ?? value.length;
      const itemText = value.slice(start, end).trim();
      const [body, instructor] = itemText.split(/\s+강사:\s+/, 2);

      return {
        number: match[1],
        body: body.trim(),
        instructor: instructor?.trim()
      };
    })
    .filter((item) => item.body);
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

    const titleMatch = section.match(
      /^(목적(?:\([^)]*\))?|신청대상|신청기간|진행일정|진행내용|진행장소|참여혜택|문의\s*연락처|문의처|문의|대상|내용|기간|일시|장소)\s*(.*)$/
    );
    const rawLabel = titleMatch?.[1]?.trim() ?? CIRCLED_SECTION_LABELS[marker] ?? marker;
    const label = normalizeNumberedLabel(rawLabel) || CIRCLED_SECTION_LABELS[marker] || marker;
    const text = normalizeSummaryText(titleMatch?.[2] || section);

    lines.push({
      label,
      text: text || section
    });
  }

  return lines;
}

function formatSummaryLines(value: string | null | undefined): SummaryLine[] {
  const text = String(value ?? "")
    .replace(
      /<\/?(?:a|b|blockquote|div|em|h[1-6]|i|img|li|ol|p|span|strong|table|tbody|td|th|thead|tr|ul)\b[^>]*>/gi,
      " "
    )
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

  const parsed = lines
    .map((line) => {
      const match = line.match(new RegExp(`^(${SUMMARY_LABEL_PATTERN})\\s*[:：-]\\s*(.+)$`));
      if (!match) {
        const looseMatch = line.match(/^(교육\s*내용)\s+(.+)$/);
        if (looseMatch) {
          return {
            label: normalizeSummaryLabel(looseMatch[1]),
            text: normalizeSummaryText(looseMatch[2])
          };
        }
        return { text: normalizeSummaryText(line) };
      }
      return {
        label: normalizeSummaryLabel(match[1]),
        text: normalizeSummaryText(match[2])
      };
    })
    .flatMap((line) => splitNumberedSections(line.text, line.label));

  if (parsed.length > 1 || parsed.some((line) => line.label)) {
    return removeDanglingDuplicateLines(parsed);
  }

  return normalizeSummaryText(text)
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
              <p suppressHydrationWarning>{item.body}</p>
              {item.instructor && <p suppressHydrationWarning className="text-xs font-bold text-gray-500">강사: {item.instructor}</p>}
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
            <p suppressHydrationWarning className="min-w-0 break-keep [overflow-wrap:anywhere]">{item}</p>
          </div>
        ))}
      </div>
    );
  }

  const paragraphs = splitDisplayParagraphs(line.text);
  return (
    <div className="min-w-0 space-y-1.5 break-keep [overflow-wrap:anywhere]">
      {paragraphs.map((paragraph, index) => (
        <p key={`${paragraph}-${index}`} suppressHydrationWarning>{paragraph}</p>
      ))}
    </div>
  );
}

function formatEventPeriod(start?: string | null, end?: string | null) {
  const from = formatPosterDate(start);
  const to = formatPosterDate(end);
  if (from && to) return from === to ? from : `${from} ~ ${to}`;
  return from || to || null;
}

type Fact = { fieldKey: string; label: string; value: string | null };

/** Value, or a pointer to the original notice when the value is missing. */
function FactValue({
  value,
  noticeLink,
  onNoticeClick,
}: {
  value: string | null;
  noticeLink: PosterDetailLink | null;
  onNoticeClick: () => void;
}) {
  if (value) return <span className="min-w-0 break-words">{value}</span>;
  return (
    <span className="text-pl-sub">
      원문에서 확인해 주세요
      {noticeLink && (
        <>
          {" · "}
          <a
            href={noticeLink.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onNoticeClick}
            className="font-medium text-pl-ink underline underline-offset-2"
          >
            원문 보기<span className="sr-only"> (새 창)</span>
          </a>
        </>
      )}
    </span>
  );
}

function FactsList({
  facts,
  posterId,
  noticeLink,
  onNoticeClick,
  columns = false,
}: {
  facts: Fact[];
  posterId: string;
  noticeLink: PosterDetailLink | null;
  onNoticeClick: () => void;
  columns?: boolean;
}) {
  return (
    <dl className={columns ? "grid gap-x-8 xl:grid-cols-2" : ""}>
      {facts.map((fact) => (
        <div
          key={fact.fieldKey}
          className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-t border-pl-divider py-2.5 first:border-t-0 xl:[&:nth-child(2)]:border-t-0"
        >
          <dt className="text-[13px] text-pl-sub">{fact.label}</dt>
          <dd className="flex min-w-0 items-start justify-between gap-2 text-sm font-medium leading-6 text-pl-ink">
            <FactValue
              value={fact.value}
              noticeLink={noticeLink}
              onNoticeClick={onNoticeClick}
            />
            <FieldReportButton
              posterId={posterId}
              fieldKey={fact.fieldKey}
              label={fact.label}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PosterDetailClient({
  poster,
  links,
  alertDefaults,
  institution = null,
  relatedPosters = [],
}: {
  poster: PosterDetailPoster;
  links: PosterDetailLink[];
  alertDefaults: AlertDefaults;
  institution?: { id: string; slug: string; name: string } | null;
  relatedPosters?: PlPosterCardData[];
}) {
  const router = useRouter();
  const pathname = usePathname() ?? `/posters/${poster.id}`;
  const [isFavorited, setIsFavoritedState] = useState(false);
  // Bumped by every local change (click, completion after sign-in), so a slower
  // initial lookup cannot overwrite a newer state.
  const favoriteVersion = useRef(0);
  const setIsFavorited = (value: boolean) => {
    favoriteVersion.current += 1;
    setIsFavoritedState(value);
  };
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  // Signed-in person's own mark (retention plan 3-1); applySupported stays false
  // until favorites.user_status exists (migration 20261101010000).
  const [member, setMember] = useState<{ id: string; applySupported: boolean; status: UserStatus | null } | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Guests without interest conditions are offered to choose them (UI plan ⑤).
  const [suggestInterest, setSuggestInterest] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [expandedImageIndex, setExpandedImageIndex] = useState(0);
  const clock = usePosterClock();

  useEffect(() => {
    let cancelled = false;
    const viewSource = consumePosterViewSource(poster.id);
    void logPosterView(poster.id, viewSource);

    const startedAt = favoriteVersion.current;
    const stillCurrent = () => !cancelled && favoriteVersion.current === startedAt;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!stillCurrent()) return;
      if (!user) {
        // Signed out: the favorite lives in this browser.
        setIsFavoritedState(isGuestFavorite(poster.id));
        return;
      }
      const lookup = (columns: string) =>
        supabase.from("favorites").select(columns).eq("user_id", user.id).eq("poster_id", poster.id).maybeSingle();
      let applySupported = true;
      let result = await lookup("poster_id, user_status");
      if (result.error && (result.error.code === "42703" || result.error.code === "PGRST204" || /user_status/.test(result.error.message))) {
        applySupported = false;
        result = await lookup("poster_id");
      }
      const row = result.data as { user_status?: string | null } | null;
      if (cancelled) return;
      setMember({
        id: user.id,
        applySupported,
        status: row ? (row.user_status === "applied" ? "applied" : "interested") : null
      });
      if (stillCurrent()) setIsFavoritedState(!!row);
    });

    // A favorite started before sign-in, completed by PendingActionRunner.
    const onDone = (event: Event) => {
      const detail = (event as CustomEvent<PendingActionDoneDetail>).detail;
      if (detail?.type === "favorite" && detail.targetId === poster.id) setIsFavorited(true);
    };
    window.addEventListener(PENDING_ACTION_DONE_EVENT, onDone);

    return () => {
      cancelled = true;
      window.removeEventListener(PENDING_ACTION_DONE_EVENT, onDone);
    };
  }, [poster.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("notification_open") !== "1") return;
    const notificationType = params.get("notification_type");
    trackAlertEvent("notification_open", {
      poster_id: poster.id,
      poster_status: poster.poster_status || "published",
      region: poster.regionName || "지역 전체",
      category: poster.categoryName || "분야 전체",
      cta_variant: notificationType === "favorite_deadline" ? "favorite_deadline_v1" : "closed_poster_v1"
    });
    params.delete("notification_open");
    params.delete("notification_type");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [poster.categoryName, poster.id, poster.poster_status, poster.regionName]);

  const toggleFavorite = async () => {
    if (favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      // Local session, so the button reacts without a network round trip;
      // row-level security still checks the account on every write.
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        if (isFavorited) {
          forgetGuestFavorite(poster.id);
          setIsFavorited(false);
          trackProductEvent("favorite_remove", { posterId: poster.id, metadata: { screen: "detail", logged_in: false } });
          return;
        }
        if (!saveGuestFavorite(poster.id)) {
          toast.error("이 브라우저에는 저장할 수 없어요. 사이트 데이터 저장을 허용해 주세요.");
          return;
        }
        setIsFavorited(true);
        trackProductEvent("favorite_add", { posterId: poster.id, metadata: { screen: "detail", logged_in: false } });
        promptSignup("detail", "favorite", { posterId: poster.id });
        showActionToast(
          "이 기기에 저장됐어요",
          {
            label: "계정에 보관하기",
            onClick: () => {
              // Nothing may sit on top of the sheet.
              toast.dismiss();
              setSuggestInterest(!readGuestInterest(guestLocal));
              setSheetOpen(true);
            }
          },
          // One toast at a time, however often the button is pressed.
          { id: "guest-favorite-saved" }
        );
        return;
      }

      if (isFavorited) {
        const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("poster_id", poster.id);
        if (!error) {
          setIsFavorited(false);
          setAnalyticsLoginStatus(true);
          trackAnalytics("unsave_poster", {poster_id:poster.id,poster_category:poster.categoryId,poster_region:poster.regionId});
          trackProductEvent("favorite_remove", { posterId: poster.id, metadata: { screen: "detail", logged_in: true } });
        }
      } else {
        const { error } = await supabase
          .from("favorites")
          .upsert({ user_id: user.id, poster_id: poster.id }, { onConflict: "user_id,poster_id", ignoreDuplicates: true });
        if (!error) {
          setIsFavorited(true);
          setAnalyticsLoginStatus(true);
          trackAnalytics("save_poster", {poster_id:poster.id,poster_category:poster.categoryId,poster_region:poster.regionId});
          trackProductEvent("favorite_add", { posterId: poster.id, metadata: { screen: "detail", logged_in: true } });
          toast.success("찜했어요");
        } else {
          toast.error("찜하지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
      }
    } finally {
      setFavoriteBusy(false);
    }
  };

  // 신청했어요: marking a poster not yet favorited saves it as a favorite too.
  const setApplyStatus = async (status: UserStatus) => {
    if (!member || applyBusy) return;
    setApplyBusy(true);
    const values = { user_status: status, user_status_updated_at: new Date().toISOString() };
    const { error } =
      status === "applied"
        ? await supabase
            .from("favorites")
            .upsert({ user_id: member.id, poster_id: poster.id, ...values }, { onConflict: "user_id,poster_id" })
        : await supabase.from("favorites").update(values).eq("user_id", member.id).eq("poster_id", poster.id);
    setApplyBusy(false);
    if (error) {
      toast.error("표시를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setMember({ ...member, status });
    if (status === "applied") setIsFavorited(true);
    trackProductEvent("apply_status_set", { posterId: poster.id, metadata: { screen: "detail", status, logged_in: true } });
  };

  const keepInAccount = async () => {
    const result = await continueWithKakao({ type: "favorite", targetId: poster.id, returnTo: pathname });
    if (result === "not_stored") toast.error(PENDING_NOT_STORED_MESSAGE);
    else if (result === "failed") toast.error("카카오 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
  };

  const share = async () => {
    const url = shareUrl(window.location.href);
    try {
      if (navigator.share) {
        await navigator.share({ title: poster.title, text: poster.summary_short ?? "", url });
        trackProductEvent("share_click", { posterId: poster.id, metadata: { channel: "native_share" } });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("링크가 복사되었습니다.");
        trackProductEvent("share_click", { posterId: poster.id, metadata: { channel: "link_copy" } });
      }
    } catch (error) {
      // Closing the share sheet is not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error("공유하지 못했습니다. 주소창의 링크를 복사해 주세요.");
      }
    }
  };

  const logOfficialLinkClick = (link: any) => {
    if (!link?.url || link.url === "#") return;

    if (link.link_type === "official_apply" && /^https?:\/\//i.test(link.url)) {
      trackAnalytics("click_application", {poster_id:poster.id,poster_category:poster.categoryId,poster_region:poster.regionId,application_channel:"official_apply"});
    }
    const body = JSON.stringify({
      poster_id: poster.id,
      link_id: link.id ?? null,
      link_type: link.link_type ?? null,
      link_url: link.url,
      referrer_path: window.location.pathname
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
        keepalive: true
      });
    } catch (error) {
      console.warn("Failed to queue poster link click log:", error);
    }
  };

  const display = getDeadlineDisplay({
    applicationStartAt: poster.application_start_at,
    applicationEndAt: poster.application_end_at,
    deadlineType: poster.deadline_type,
    posterStatus: poster.poster_status,
    now: clock
  });
  const closed = display.reception === "closed";

  const imageUrls = resolvePosterImageGallery(poster.images ?? [], poster.thumbnail_url, poster.source_key);
  // Plan 3-2: only an official_apply link is a sign-up page; otherwise the
  // primary action is the official notice. A homepage never becomes either.
  const applyLink =
    links.find((link) => link.link_type === "official_apply" && link.is_primary) ||
    links.find((link) => link.link_type === "official_apply") ||
    null;
  const noticeLink =
    links.find((link) => link.link_type === "official_notice" && link.is_primary) ||
    links.find((link) => link.link_type === "official_notice") ||
    null;
  const primaryAction = applyLink
    ? { link: applyLink, label: getLinkActionLabel(applyLink) }
    : noticeLink
      ? { link: noticeLink, label: "공식 공고 확인하기" }
      : null;
  const referenceLinks = links.filter((link) => link.id !== applyLink?.id && link.id !== noticeLink?.id);
  const canSaveCalendar = getVerifiedPosterCalendarSource(poster) !== null;
  const summaryLines = formatSummaryLines(poster.summary_long || poster.summary_short).filter(
    (line, index, lines) => lines.findIndex((item) => item.label === line.label && item.text === line.text) === index
  );
  const summaryFallbackFacts = derivePosterSummaryFallbackFacts(summaryLines);
  const structuredEligibilityAgeRange = extractTargetAgeRange(poster.eligibility_summary);
  const targetAgeMin =
    poster.target_age_min ??
    structuredEligibilityAgeRange.targetAgeMin ??
    (poster.eligibility_summary ? null : summaryFallbackFacts.targetAgeMin);
  const targetAgeMax =
    poster.target_age_max ??
    structuredEligibilityAgeRange.targetAgeMax ??
    (poster.eligibility_summary ? null : summaryFallbackFacts.targetAgeMax);
  const periodLabel = formatApplicationPeriod({
    applicationStartAt: poster.application_start_at,
    applicationEndAt: poster.application_end_at,
    deadlineType: poster.deadline_type
  });
  const period = periodLabel === "일정 확인 필요" ? null : periodLabel;
  const eligibility = poster.eligibility_summary || summaryFallbackFacts.eligibilitySummary || null;
  const method = poster.application_method || summaryFallbackFacts.applicationMethod || null;
  const organizationInfo = getOrganizationVerification(poster);
  const organizerName = poster.organizer_name || organizationInfo?.organizerName || null;
  const displayOrgName = getPosterOrgDisplayName(poster);
  const sourceOrgName = organizationInfo?.sourceOrgName || poster.source_org_name || null;
  const sourceLabel = sourceOrgName || (noticeLink ? formatHostName(noticeLink.url) : null);
  const eventPeriod = formatEventPeriod(poster.event_start_at, poster.event_end_at);
  // An operator can close a poster before its scheduled deadline; only a
  // deadline that has already passed is the day reception actually ended.
  const closedOn = receptionEndedOn(poster.application_end_at, clock);
  const deadlinePassed = closedOn !== null;
  const logNotice = () => void logOfficialLinkClick(noticeLink);

  // Plan ①-3 and ④-4: the facts a person needs to decide and apply.
  const coreFacts: Fact[] = closed
    ? [
        { fieldKey: "deadline_date", label: "접수 기간", value: period ? (deadlinePassed ? `${period} (종료)` : period) : null },
        { fieldKey: "target_desc", label: "신청 대상", value: eligibility },
        { fieldKey: "recruitment_count", label: "모집 인원", value: poster.recruitment_count || null },
        ...(eventPeriod ? [{ fieldKey: "event_period", label: "교육/운영 기간", value: eventPeriod }] : []),
        ...(poster.event_location ? [{ fieldKey: "event_location", label: "장소", value: poster.event_location }] : [])
      ]
    : [
        { fieldKey: "deadline_date", label: "접수 기간", value: period },
        { fieldKey: "region", label: "대상 지역", value: poster.regionName || null },
        { fieldKey: "recruitment_count", label: "모집 인원", value: poster.recruitment_count || null },
        { fieldKey: "target_desc", label: "신청 대상", value: eligibility },
        { fieldKey: "apply_method", label: "신청 방법", value: method }
      ];
  // Everything else stays inside "공고 원문 전체 보기".
  const moreFacts = [
    { label: "연령", value: targetAgeMin != null || targetAgeMax != null ? formatTargetAge(targetAgeMin, targetAgeMax) : null },
    { label: "비용", value: poster.participation_fee || summaryFallbackFacts.participationFee || null },
    { label: "혜택", value: poster.benefits_summary || summaryFallbackFacts.benefitsSummary || null },
    { label: "준비 서류", value: poster.required_documents || null },
    { label: "문의", value: poster.contact_info || null },
    ...(closed ? [] : [{ label: "교육/운영 기간", value: eventPeriod }, { label: "장소", value: poster.event_location || null }]),
    { label: "주최/주관", value: organizerName },
    { label: "신청 접수기관", value: poster.application_organization_name || null },
    { label: "정보 확인", value: publicInformationCheckLabel(poster) }
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));

  const moveExpandedImage = (offset: number) => {
    setExpandedImageIndex((index) => (index + offset + imageUrls.length) % imageUrls.length);
  };
  const openImage = (index: number) => {
    setExpandedImageIndex(index);
    setImageExpanded(true);
  };

  const primaryButton = primaryAction ? (
    <PrimaryActionLink href={primaryAction.link.url} onClick={() => void logOfficialLinkClick(primaryAction.link)}>
      {primaryAction.label}
    </PrimaryActionLink>
  ) : (
    <span className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-pl-line px-4 text-sm text-pl-sub">
      공식 링크 확인 중
    </span>
  );

  const chips = (
    <p className="flex flex-wrap items-center gap-1.5">
      {poster.categoryName && (
        <span className="inline-flex min-h-6 items-center rounded-md bg-pl-ink px-2 text-xs font-bold text-white">
          {poster.categoryName}
        </span>
      )}
      {poster.regionName && (
        <span className="inline-flex min-h-6 items-center rounded-md border border-pl-line bg-pl-card px-2 text-xs font-medium text-pl-ink">
          {poster.regionName}
        </span>
      )}
      <ReceptionChip display={display} />
    </p>
  );

  const posterFigure = (className: string) => (
    <figure className={`relative overflow-hidden rounded-xl bg-pl-poster ${className}`}>
      <PosterImageCarousel
        images={imageUrls}
        title={poster.title}
        org={displayOrgName}
        fallbackClassName="p-8"
        imgClassName="h-full w-full object-contain"
        showControls
        iconSize={34}
        onImageClick={(_, index) => openImage(index)}
      />
      {imageUrls.length > 0 && (
        <button
          type="button"
          onClick={() => openImage(0)}
          className="absolute bottom-3 right-3 inline-flex min-h-[36px] items-center rounded-full bg-pl-ink/90 px-3 text-xs font-bold text-white"
        >
          크게 보기
        </button>
      )}
    </figure>
  );

  const originalSection = (
    <details className="group rounded-xl border border-pl-line bg-pl-card">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-pl-ink [&::-webkit-details-marker]:hidden">
        {closed ? "원문 보기" : "공고 원문 전체 보기"}
        <ChevronDown size={18} aria-hidden="true" className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-pl-divider px-4 py-4 text-sm leading-relaxed text-pl-ink">
        {moreFacts.length > 0 && (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {moreFacts.map((fact) => (
              <div key={fact.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
                <dt className="text-[13px] text-pl-sub">{fact.label}</dt>
                <dd className="min-w-0 break-words font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {summaryLines.map((line, index) => (
          <div key={`${line.label ?? "line"}-${index}`} className="min-w-0">
            {line.label && <h3 className="mb-1 text-xs font-bold text-pl-sub">{line.label}</h3>}
            {renderSummaryContent(line)}
          </div>
        ))}
        {(noticeLink || referenceLinks.length > 0 || canSaveCalendar) && (
          <ul className="space-y-1.5">
            {noticeLink && (
              <li>
                <a href={noticeLink.url} target="_blank" rel="noopener noreferrer" onClick={logNotice} className="font-medium underline underline-offset-2">
                  공식 공고 원문 보기<span className="sr-only"> (새 창)</span>
                </a>
              </li>
            )}
            {referenceLinks.map((link) => (
              <li key={link.id}>
                <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => void logOfficialLinkClick(link)} className="underline underline-offset-2">
                  {getLinkActionLabel(link, "reference")}<span className="sr-only"> (새 창)</span>
                </a>
              </li>
            ))}
            {canSaveCalendar && !closed && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    const saved = downloadPosterCalendar(poster, primaryAction?.link.url);
                    if (saved) toast.success("캘린더 파일을 만들었습니다.");
                    else toast.error("검증된 일정 정보를 다시 확인해 주세요.");
                  }}
                  className="inline-flex min-h-[44px] items-center underline underline-offset-2"
                >
                  확인된 일정을 캘린더에 저장
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </details>
  );

  const institutionCard = institution && (
    <section aria-label="기관" className="flex items-center gap-3 rounded-xl border border-pl-line bg-pl-card p-4">
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pl-ink font-pl-serif text-lg font-bold text-white">
        {institution.name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <Link href={`/institutions/${institution.slug}`} className="block truncate text-[15px] font-bold text-pl-ink underline-offset-2 hover:underline">
          {institution.name}
        </Link>
        <p className="text-[13px] leading-5 text-pl-sub">구독하면 이 기관의 새 공고를 모아 보여드려요</p>
      </div>
      <InstitutionFollowButton institutionId={institution.id} returnPath={pathname} variant="pl" />
    </section>
  );

  const relatedSection = institution && relatedPosters.length > 0 && (
    <section aria-labelledby="related-posters">
      <SectionHeader
        id="related-posters"
        title={closed ? `${institution.name}에서 지금 접수 중인 공고` : `${institution.name}의 다른 접수 중 공고`}
        action={{ href: `/institutions/${institution.slug}`, label: "더 보기" }}
      />
      <div className="grid gap-2.5 xl:grid-cols-3">
        {relatedPosters.map((related) => (
          <PosterListCard key={related.id} poster={related} source="related" />
        ))}
      </div>
    </section>
  );

  const sourceNote = (
    <p className="text-xs leading-5 text-pl-meta">
      공고 정보는 기관의 공식 자료를 정리한 것입니다. 신청 전 원문을 꼭 확인해 주세요.
      {sourceLabel && (
        <>
          {" "}원문 출처:{" "}
          {noticeLink ? (
            <a href={noticeLink.url} target="_blank" rel="noopener noreferrer" onClick={logNotice} className="underline underline-offset-2">
              {sourceLabel}<span className="sr-only"> (새 창)</span>
            </a>
          ) : (
            sourceLabel
          )}
        </>
      )}
    </p>
  );

  const titleBlock = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        {chips}
        <h1
          data-analytics-poster-id={poster.id}
          data-analytics-category={poster.categoryId || undefined}
          data-analytics-region={poster.regionId || undefined}
          className={`mt-2.5 font-pl-serif text-[23px] font-bold leading-[1.38] xl:text-[32px] ${closed ? "text-pl-sub" : "text-pl-ink"}`}
        >
          {poster.title}
        </h1>
        {displayOrgName && <p className="mt-1.5 text-[13px] text-pl-meta">{displayOrgName}</p>}
      </div>
      {closed ? (
        imageUrls[0] && (
          <PosterThumb src={imageUrls[0]} className="h-[72px] w-14" />
        )
      ) : (
        <DdayStamp display={display} />
      )}
    </div>
  );

  // ④ banner: when it ended, then accepting alternatives (most relevant first).
  const closedBanner = closed && (
    <section className="rounded-xl bg-pl-ink p-4 text-white">
      <p className="text-[15px] font-bold">
        {closedOn ? `이 공고는 ${closedOn}에 접수가 끝났어요` : "이 공고는 접수가 끝났어요"}
      </p>
      {institution && relatedPosters.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] text-white/80">{institution.name}에서 지금 접수 중인 공고</p>
          {relatedPosters.map((related) => (
            <PosterListCard key={related.id} poster={related} source="related" />
          ))}
        </div>
      )}
    </section>
  );

  const alertCta = closed && (
    <ClosedPosterAlertCta
      posterId={poster.id}
      posterStatus="closed"
      defaults={alertDefaults}
      className=""
      renderTrigger={(open, disabled) => (
        <div className="space-y-2">
          <p className="text-xs leading-5 text-pl-sub">
            비슷한 공고 받기: <strong className="font-bold text-pl-ink">{alertDefaults.categoryName} · {alertDefaults.regionName}</strong> 조건으로 저장돼요 ·{" "}
            <button type="button" onClick={open} disabled={disabled} className="underline underline-offset-2">
              조건 바꾸기
            </button>
          </p>
          <div className="flex gap-2">
            {noticeLink && (
              <a
                href={noticeLink.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={logNotice}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-pl-ink px-3 text-sm font-bold text-pl-ink"
              >
                공식 공고 확인하기<span className="sr-only"> (새 창)</span>
              </a>
            )}
            <button
              type="button"
              onClick={open}
              disabled={disabled}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-pl-accent px-3 text-sm font-bold text-white disabled:opacity-60"
            >
              비슷한 공고 받기
            </button>
          </div>
        </div>
      )}
    />
  );

  return (
    <div className={`min-h-screen bg-pl-paper font-pl-sans text-pl-ink ${closed ? "pb-[calc(var(--mobile-nav-height)+24px)] md:pb-12" : "pl-has-action-bar"}`}>
      <div className="hidden md:block">
        <Header />
      </div>
      {/* Mobile top bar: back, title, share. */}
      <div className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-pl-line bg-pl-paper/95 px-2 backdrop-blur md:hidden">
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/posters"))}
          className="flex h-11 w-11 items-center justify-center rounded-lg"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <p className="text-[15px] font-bold">공고 상세</p>
        <button type="button" aria-label="공유하기" onClick={share} className="flex h-11 w-11 items-center justify-center rounded-lg">
          <Share2 size={19} aria-hidden="true" />
        </button>
      </div>

      <main className="mx-auto w-full max-w-[1200px] px-5 py-5 xl:px-10 xl:py-8">
        <nav aria-label="위치" className="mb-5 hidden text-[13px] text-pl-meta xl:block">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:underline">홈</Link></li>
            {poster.categoryName && poster.categoryId && (
              <li><span aria-hidden="true">› </span><Link href={`/posters?category=${poster.categoryId}`} className="hover:underline">{poster.categoryName}</Link></li>
            )}
            {poster.regionName && poster.regionId && (
              <li><span aria-hidden="true">› </span><Link href={`/posters?region=${poster.regionId}`} className="hover:underline">{poster.regionName}</Link></li>
            )}
          </ol>
        </nav>

        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-10">
          <div className="min-w-0 space-y-6">
            {titleBlock}
            {closedBanner}
            {/* ④ 내 기록: only for a member who marked it; the poster closing never changes it. */}
            {closed && member?.applySupported && member.status === "applied" && (
              <section aria-labelledby="my-record" className="rounded-xl border border-pl-line bg-pl-card px-4 py-3">
                <h2 id="my-record" className="pb-2 text-[15px] font-bold">내 기록</h2>
                <ApplyMark
                  marked
                  busy={applyBusy}
                  onMark={() => void setApplyStatus("applied")}
                  onUnmark={() => void setApplyStatus("interested")}
                />
                <p className="mt-2 text-[13px] leading-5 text-pl-sub">내가 직접 표시한 기록이에요. 공고가 끝나도 그대로 남아요.</p>
              </section>
            )}

            <section aria-labelledby="core-facts" className="rounded-xl border border-pl-line bg-pl-card px-4 py-3">
              <h2 id="core-facts" className="pb-1.5 pt-1 text-[15px] font-bold">
                {closed ? "공고 정보" : "신청 핵심 정보"}
              </h2>
              <FactsList facts={coreFacts} posterId={poster.id} noticeLink={noticeLink} onNoticeClick={logNotice} columns={!closed} />
              {!closed && member?.applySupported && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-pl-line pt-3">
                  <p className="text-[13px] leading-5 text-pl-sub">
                    신청을 마쳤다면 직접 표시해 두세요.
                    <br />
                    내 공고에서 따로 모아 볼 수 있어요.
                  </p>
                  <ApplyMark
                    marked={member.status === "applied"}
                    busy={applyBusy}
                    onMark={() => void setApplyStatus("applied")}
                    onUnmark={() => void setApplyStatus("interested")}
                  />
                </div>
              )}
            </section>


            {!closed && posterFigure("h-[240px] xl:hidden")}
            {originalSection}
            {!closed && institutionCard}
            {!closed && relatedSection}
            {closed && institutionCard}
            {sourceNote}
            {alertCta}
            <CommentSection posterId={poster.id} />
          </div>

          {/* PC right column: poster and actions, kept in view while scrolling. */}
          <aside aria-label="공고 행동" className="hidden xl:sticky xl:top-6 xl:block">
            {posterFigure("aspect-[3/4] w-full")}
            <div className="mt-4 space-y-3 rounded-xl border border-pl-line bg-pl-card p-4">
              {closed ? (
                noticeLink && (
                  <a
                    href={noticeLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={logNotice}
                    className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-pl-ink px-4 text-sm font-bold text-pl-ink"
                  >
                    공식 공고 확인하기<span className="sr-only"> (새 창)</span>
                  </a>
                )
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-pl-sub">마감</span>
                    <DeadlineLabel display={display} />
                  </div>
                  {primaryButton}
                  <div className="flex gap-2">
                    <FavoriteButton favorited={isFavorited} onToggle={toggleFavorite} busy={favoriteBusy} className="flex-1" />
                    <button type="button" onClick={share} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-pl-line text-sm font-bold text-pl-ink">
                      <Share2 size={16} aria-hidden="true" />
                      공유
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </main>

      {!closed && (
        <ActionBar favorited={isFavorited} onToggleFavorite={toggleFavorite} favoriteBusy={favoriteBusy} primary={primaryButton} />
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="찜한 공고를 계정에 보관할까요?"
        primary={
          <>
            <button type="button" onClick={keepInAccount} className="min-h-[48px] rounded-lg bg-kakao font-bold text-kakao-text">
              카카오로 계속하기
            </button>
            <button
              type="button"
              onClick={() => {
                if (!rememberActionForLogin({ type: "favorite", targetId: poster.id, returnTo: pathname })) {
                  toast.error(PENDING_NOT_STORED_MESSAGE);
                  return;
                }
                router.push("/login");
              }}
              className="min-h-[44px] rounded-lg text-sm font-medium text-pl-ink underline underline-offset-2"
            >
              다른 방법으로 로그인
            </button>
          </>
        }
        footnote="이 기기에 찜한 공고는 계정으로 그대로 옮겨져요. 지금은 이 브라우저에 저장돼 있어 기록을 지우면 사라질 수 있어요."
      >
        <ul className="list-disc space-y-1 pl-5">
          <li>다른 기기에서도 찜한 공고를 이어서 볼 수 있어요</li>
          <li>관심 지역과 기관의 새 공고를 모아 볼 수 있어요</li>
        </ul>
        {suggestInterest && (
          <Link
            href={`/interests?next=${encodeURIComponent(pathname)}`}
            className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-pl-ink underline underline-offset-2"
          >
            가입 전에 관심 지역·분야만 먼저 고르기
          </Link>
        )}
      </BottomSheet>

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
        </div>
      )}
      <Footer />
      <BottomNav />
    </div>
  );
}
