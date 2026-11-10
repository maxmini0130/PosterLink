"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Check, ChevronRight, Maximize2 } from "lucide-react";
import type { DeadlinePresentation } from "../../../lib/deadlinePresentation";
import { StatusTag } from "../../components/pl/DeadlineParts";
import { DefaultPoster } from "../../components/pl/DefaultPoster";
import { PlBadge, PlButton } from "../../components/pl/PlControls";
import type { RegionCondition } from "../../../lib/browseRegion";

/** "✓ 신청한 공고예요 · 되돌리기 / 마감 알림을 껐어요 · 선정 안내 … 예정" (SPEC 5). */
export function AppliedBand({
  onUndo,
  busy,
  selectionNotice,
}: {
  onUndo: () => void;
  busy?: boolean;
  /** Confirmed 선정 안내 time ("11.12(목) 오후 3시"), else null. */
  selectionNotice: string | null;
}) {
  return (
    <div
      role="status"
      data-applied-band
      className="rounded-xl border border-pl-ok/30 bg-pl-ok-bg px-3.5 py-2.5 text-pl-ok"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 flex items-center gap-1.5 text-[14px] font-bold">
          <Check size={16} strokeWidth={3} aria-hidden="true" />
          신청한 공고예요
        </p>
        <button
          type="button"
          onClick={onUndo}
          disabled={busy}
          className="min-h-8 shrink-0 text-[13px] font-medium text-pl-ink-soft underline underline-offset-2 disabled:opacity-60"
        >
          되돌리기
        </button>
      </div>
      <p className="m-0 mt-0.5 text-[12.5px] text-pl-ok">
        마감 알림을 껐어요
        {selectionNotice && ` · 선정 안내 ${selectionNotice} 예정`}
      </p>
    </div>
  );
}

/**
 * "신청을 마치셨나요?" after coming back from the application page (SPEC 5).
 * Fixed above the bar on phones; a small box near the buttons on PC.
 */
export function ApplyReturnPrompt({
  onApplied,
  onNotYet,
  busy,
}: {
  onApplied: () => void;
  onNotYet: () => void;
  busy?: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-labelledby="apply-return-title"
      data-apply-prompt
      className="fixed inset-x-3 bottom-[calc(var(--mobile-nav-height)+var(--pl-bottom-extra,72px)+12px)] z-50 rounded-2xl border border-pl-line bg-pl-card p-4 shadow-lg xl:static xl:inset-auto xl:z-auto xl:shadow-none"
    >
      <p
        id="apply-return-title"
        className="m-0 text-[15px] font-bold text-pl-ink"
      >
        신청을 마치셨나요?
      </p>
      <p className="m-0 mt-1 text-[13px] leading-[1.5] text-pl-meta">
        신청했다고 표시하면 이 공고의 마감 알림이 꺼져요.
      </p>
      <div className="mt-3 flex gap-2">
        <PlButton
          variant="primary"
          className="flex-1"
          onClick={onApplied}
          disabled={busy}
        >
          신청했어요
        </PlButton>
        <PlButton className="flex-1" onClick={onNotYet}>
          아직이에요
        </PlButton>
      </div>
    </div>
  );
}

/**
 * v6.1 detail pieces (docs/design/v6.1/SPEC.md 7.2, 7.3). Values that are not
 * confirmed read "공고문에서 확인" (muted); nothing is guessed.
 */

const UNKNOWN = "공고문에서 확인";

/** Poster preview: at most 40% of the screen height (36%, so the summary fits), cut from the top. */
export function DetailPosterPreview({
  src,
  title,
  org,
  category,
  imageWidth,
  imageHeight,
  onOpen,
  className = "",
}: {
  src: string | null;
  title: string;
  org?: string | null;
  category?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  onOpen: () => void;
  className?: string;
}) {
  // A poster taller than about 1:1 is cut; the fade shows there is more.
  const cut = !imageWidth || !imageHeight || imageHeight / imageWidth > 0.9;
  return (
    <figure
      className={`relative m-0 overflow-hidden bg-pl-poster ${className}`}
      data-detail-poster
    >
      {src ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label="포스터 크게 보기"
          className="block w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-pl-ink"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`${title} 포스터`}
            className="block max-h-[36vh] w-full object-cover object-top xl:max-h-none"
          />
        </button>
      ) : (
        <div className="h-[200px]">
          <DefaultPoster
            title={title}
            category={category ?? undefined}
            organization={org ?? undefined}
          />
        </div>
      )}
      {src && cut && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-pl-paper to-transparent xl:hidden"
        />
      )}
      {src && (
        <button
          type="button"
          onClick={onOpen}
          className="absolute bottom-2.5 right-2.5 inline-flex h-9 items-center gap-1.5 rounded-full border border-pl-line-strong bg-white px-3.5 text-[13px] font-semibold text-pl-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-pl-ink"
        >
          <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />
          크게 보기
        </button>
      )}
    </figure>
  );
}

/** 유형 / 지역 / 접수 상태. */
export function DetailTags({
  category,
  region,
  presentation,
}: {
  category?: string | null;
  region?: string | null;
  presentation: DeadlinePresentation;
}) {
  return (
    <p className="m-0 flex flex-wrap items-center gap-1.5">
      {category && (
        <span className="inline-flex items-center whitespace-nowrap rounded-[7px] border border-pl-ink bg-pl-ink px-[9px] py-[3px] text-xs text-white">
          {category.replace("/", "·")}
        </span>
      )}
      {region && (
        <span className="inline-flex items-center whitespace-nowrap rounded-[7px] border border-pl-line-strong bg-white px-[9px] py-[3px] text-xs text-pl-ink">
          {region}
        </span>
      )}
      <StatusTag presentation={presentation} />
    </p>
  );
}

function Cell({
  label,
  aside,
  children,
  className = "",
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 px-3.5 py-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-pl-meta">{label}</span>
        {aside && (
          <span className="shrink-0 text-[12.5px] text-pl-meta">{aside}</span>
        )}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Value({
  value,
  tone = "default",
  clamp = false,
}: {
  value: string | null | undefined;
  tone?: "default" | "ok";
  /** Two lines at most; the full text stays in 공고 원문 전체 보기. */
  clamp?: boolean;
}) {
  if (!value?.trim())
    return (
      <p className="m-0 text-[14.5px] font-medium text-pl-meta">{UNKNOWN}</p>
    );
  return (
    <p
      title={clamp ? value : undefined}
      className={`m-0 break-keep text-[14.5px] font-bold leading-[1.4] ${
        clamp ? "line-clamp-2" : ""
      } ${tone === "ok" ? "text-pl-ok" : "text-pl-ink"}`}
    >
      {value}
    </p>
  );
}

/**
 * 대상 (+ 모집 인원) / 신청 마감 | 비용 / 진행 (SPEC 7.2 ⑤). The deadline
 * wording, its D-day and captions all come from getDeadlinePresentation.
 */
export function DetailSummaryCard({
  eligibility,
  condition = null,
  recruitment,
  presentation,
  fee,
  eventPeriod,
  location,
  eventNote,
}: {
  eligibility: string | null;
  /** "○○구 주민만 신청 가능" (필수) / "○○구 거주·생활권" (우대), SPEC 7.2. */
  condition?: RegionCondition | null;
  recruitment: string | null;
  presentation: DeadlinePresentation;
  fee: string | null;
  eventPeriod: string | null;
  location: string | null;
  eventNote?: string | null;
}) {
  const free = Boolean(fee && /^\s*무료/.test(fee));
  const deadlineMuted = presentation.tone === "muted";
  const progress = [eventPeriod, location].filter(Boolean).join(" · ") || null;
  return (
    <section
      aria-label="신청 요약"
      data-detail-summary
      className="overflow-hidden rounded-xl border border-pl-line bg-pl-card"
    >
      <Cell label="대상" aside={recruitment || undefined}>
        {condition && (
          <p
            data-region-condition={condition.kind}
            className="m-0 mb-1 break-keep text-[13px] font-semibold leading-[1.5] text-pl-ink"
          >
            <PlBadge must={condition.kind === "only"}>
              {condition.kind === "only" ? "필수" : "우대"}
            </PlBadge>
            {condition.text}
          </p>
        )}
        <Value value={eligibility} clamp />
      </Cell>
      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] border-t border-pl-line">
        <Cell
          label="신청 마감"
          aside={presentation.detailAside || undefined}
          className="border-r border-pl-line"
        >
          <p
            className={`m-0 break-keep text-[14.5px] leading-[1.4] ${
              deadlineMuted
                ? "font-medium text-pl-meta"
                : "font-bold text-pl-ink"
            }`}
          >
            {presentation.detail}
          </p>
          {presentation.detailCaption && (
            <p className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-pl-meta">
              {presentation.detailCaption}
            </p>
          )}
          {presentation.detailNote && (
            <p className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-pl-meta">
              {presentation.detailNote}
            </p>
          )}
        </Cell>
        <Cell label="비용">
          <Value value={fee} tone={free ? "ok" : "default"} clamp />
        </Cell>
      </div>
      <Cell label="진행" className="border-t border-pl-line">
        <Value value={progress} clamp />
        {eventNote && (
          <p className="m-0 mt-0.5 text-[12.5px] text-pl-meta">{eventNote}</p>
        )}
      </Cell>
    </section>
  );
}

/** "출처 ○○ · 공식 공고문 보기 ›" */
export function DetailSourceLine({
  sourceLabel,
  noticeUrl,
  onNoticeClick,
}: {
  sourceLabel: string | null;
  noticeUrl: string | null;
  onNoticeClick?: () => void;
}) {
  if (!sourceLabel && !noticeUrl) return null;
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-1.5 text-[13px] text-pl-meta">
      {sourceLabel && <span>출처 {sourceLabel}</span>}
      {sourceLabel && noticeUrl && <span aria-hidden="true">·</span>}
      {noticeUrl && (
        <a
          href={noticeUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNoticeClick}
          className="inline-flex min-h-11 items-center font-semibold text-pl-ink underline-offset-2 hover:underline"
        >
          공식 공고문 보기
          <ChevronRight size={15} aria-hidden="true" />
          <span className="sr-only"> (새 창)</span>
        </a>
      )}
    </p>
  );
}

/**
 * 비슷한 접수 중 공고 (SPEC 8, 12장 B). Posters have no topic yet, so no
 * recommendation is made up: the section links to the field's open posters.
 */
export function DetailSimilar({
  closed,
  categoryName,
  categoryHref,
}: {
  closed: boolean;
  categoryName: string | null;
  categoryHref: string;
}) {
  const field = categoryName ? categoryName.replace("/", "·") : null;
  return (
    <section aria-labelledby="similar-posters" data-detail-similar>
      <h2
        id="similar-posters"
        className="m-0 font-pl-serif text-[20px] font-bold text-pl-ink xl:text-[22px]"
      >
        {closed ? "지금 접수 중인 비슷한 공고" : "비슷한 접수 중 공고"}
      </h2>
      {closed && (
        <p className="m-0 mt-1 text-[13px] text-pl-meta">
          이 공고에는 아직 주제가 정리되지 않아 같은 분야의 접수 중 공고로
          안내해요
        </p>
      )}
      <Link
        href={categoryHref}
        className="mt-3 flex min-h-[52px] items-center justify-between gap-2 rounded-xl border border-pl-line bg-pl-card px-4 text-[14.5px] font-bold text-pl-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pl-ink"
      >
        {field
          ? `접수 중인 ${field} 공고 모두 보기`
          : "접수 중인 공고 모두 보기"}
        <ChevronRight size={18} aria-hidden="true" className="text-pl-meta" />
      </Link>
    </section>
  );
}

/** "이 공고는 8월 17일에 접수가 끝났어요" */
export function ClosedBanner({ text }: { text: string }) {
  return (
    <p
      role="status"
      className="m-0 rounded-xl bg-pl-ink px-4 py-3.5 text-[15px] font-bold text-white"
    >
      {text}
    </p>
  );
}
