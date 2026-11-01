"use client";

import { useState } from "react";
import { getDeadlineDisplay } from "../../../lib/deadlineDisplay";
import {
  ActionBar,
  FavoriteButton,
  PrimaryActionLink,
} from "../../components/pl/ActionBar";
import { ApplyMark } from "../../components/pl/ApplyMark";
import { BottomSheet } from "../../components/pl/BottomSheet";
import { DdayStamp } from "../../components/pl/DdayStamp";
import {
  DeadlineLabel,
  ReceptionChip,
} from "../../components/pl/DeadlineLabel";
import { GuideCard } from "../../components/pl/GuideCard";
import {
  PosterListCard,
  PosterMiniCard,
  PosterMiniRail,
  type PlPosterCardData,
} from "../../components/pl/PosterListCard";
import { RegionLabel } from "../../components/pl/RegionLabel";
import { ReportFab } from "../../components/pl/ReportFab";
import { SectionHeader } from "../../components/pl/SectionHeader";
import { showActionToast } from "../../components/pl/actionToast";
import { BottomNav } from "../../components/BottomNav";

// Review-only samples relative to now, so every reception state is visible.
const day = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * day).toISOString();
const SAMPLE_STATES: {
  name: string;
  input: Parameters<typeof getDeadlineDisplay>[0];
}[] = [
  {
    name: "마감 5일 전",
    input: { applicationEndAt: at(5), deadlineType: "fixed" },
  },
  {
    name: "오늘 마감",
    input: { applicationEndAt: at(0.01), deadlineType: "fixed" },
  },
  {
    name: "접수 예정",
    input: {
      applicationStartAt: at(3),
      applicationEndAt: at(20),
      deadlineType: "fixed",
    },
  },
  { name: "상시 모집", input: { deadlineType: "ongoing" } },
  { name: "소진 시 마감", input: { deadlineType: "until_exhausted" } },
  {
    name: "마감일 확인 필요",
    input: { applicationEndAt: at(5), deadlineType: "unknown" },
  },
  {
    name: "접수 종료",
    input: { applicationEndAt: at(-2), deadlineType: "fixed" },
  },
];

const SAMPLE_POSTERS: PlPosterCardData[] = [
  {
    id: "sample-1",
    title:
      "[샘플] 청년 문화예술 교육 수강생 모집 — 두 줄까지 보이는 긴 제목 예시입니다",
    org: "샘플 문화재단",
    tags: ["교육/취업"],
    deadline: at(5),
    deadlineType: "fixed",
  },
  {
    id: "sample-2",
    title: "[샘플] 소상공인 경영 지원금 신청 안내",
    org: "샘플 구청",
    tags: ["소상공인"],
    deadlineType: "until_exhausted",
  },
  {
    id: "sample-3",
    title: "[샘플] 가족 주말 체험 프로그램",
    org: "샘플 센터",
    tags: ["육아/가족"],
    deadline: at(0.01),
    deadlineType: "fixed",
  },
  {
    id: "sample-4",
    title: "[샘플] 접수가 끝난 공고",
    org: "샘플 기관",
    tags: ["문화/행사"],
    deadline: at(-3),
    deadlineType: "fixed",
  },
];

const TOKENS = [
  ["ink", "bg-pl-ink"],
  ["paper", "bg-pl-paper"],
  ["card", "bg-pl-card"],
  ["line", "bg-pl-line"],
  ["divider", "bg-pl-divider"],
  ["sub", "bg-pl-sub"],
  ["meta", "bg-pl-meta"],
  ["accent", "bg-pl-accent"],
  ["poster", "bg-pl-poster"],
];

export function UiShowcase() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [edgeSheetOpen, setEdgeSheetOpen] = useState(false);
  const [lateDisabled, setLateDisabled] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [marked, setMarked] = useState(false);
  const open = getDeadlineDisplay(SAMPLE_STATES[0].input);

  return (
    <div className="min-h-screen bg-pl-paper pb-48 font-pl-sans text-pl-ink">
      <main className="mx-auto max-w-[1200px] space-y-8 px-5 py-6 md:px-10">
        <h1 className="font-pl-serif text-2xl font-bold">
          UI 컴포넌트 확인 (개발용)
        </h1>

        <section aria-labelledby="tokens">
          <SectionHeader
            id="tokens"
            title="색"
            condition="docs/UI_REDESIGN_PLAN 1-1"
          />
          <ul className="flex flex-wrap gap-2">
            {TOKENS.map(([name, cls]) => (
              <li
                key={name}
                className="flex items-center gap-2 rounded-lg border border-pl-line bg-pl-card px-2 py-1 text-xs"
              >
                <span
                  className={`h-6 w-6 rounded border border-pl-line ${cls}`}
                  aria-hidden="true"
                />
                {name}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="deadline">
          <SectionHeader id="deadline" title="마감 표시 · 접수 상태 칩" />
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SAMPLE_STATES.map(({ name, input }) => {
              const value = getDeadlineDisplay(input);
              return (
                <li
                  key={name}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pl-line bg-pl-card px-3 py-2"
                >
                  <span className="text-xs text-pl-meta">{name}</span>
                  <span className="flex items-center gap-2">
                    <ReceptionChip display={value} />
                    <DeadlineLabel display={value} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section
          aria-labelledby="stamp"
          className="flex items-start gap-4 rounded-xl border border-pl-line bg-pl-card p-5"
        >
          <div className="min-w-0 flex-1">
            <p className="flex gap-1.5">
              <ReceptionChip display={open} />
              <RegionLabel scope="seoul" />
            </p>
            <h2
              id="stamp"
              className="mt-2 font-pl-serif text-[22px] font-bold leading-[1.38]"
            >
              D-day 도장 (날짜 신뢰 공고만)
            </h2>
            <p className="mt-1 text-[13px] text-pl-meta">샘플 기관</p>
          </div>
          <DdayStamp display={open} />
          <DdayStamp display={getDeadlineDisplay(SAMPLE_STATES[1].input)} />
          <DdayStamp display={getDeadlineDisplay(SAMPLE_STATES[5].input)} />
        </section>

        <section aria-labelledby="cards">
          <SectionHeader
            id="cards"
            title="공고 카드"
            condition="마포구 대상 · 문화/행사 · 접수 중"
            action={{ href: "#cards", label: "모두 보기" }}
          />
          <div className="grid gap-2.5 md:grid-cols-2">
            <PosterListCard poster={SAMPLE_POSTERS[0]} />
            <PosterListCard poster={SAMPLE_POSTERS[1]} region="nearby" />
            <PosterListCard
              poster={SAMPLE_POSTERS[2]}
              region="nation"
              badge="이 기기에 저장됨"
            />
            <PosterListCard
              poster={SAMPLE_POSTERS[3]}
              footer={
                <ApplyMark
                  marked={marked}
                  onMark={() => setMarked(true)}
                  onUnmark={() => setMarked(false)}
                  alertOn
                  onTurnOffAlert={() => undefined}
                />
              }
            />
          </div>
        </section>

        <section aria-labelledby="rail">
          <SectionHeader id="rail" title="7일 안에 마감" />
          <PosterMiniRail label="7일 안에 마감되는 공고">
            {SAMPLE_POSTERS.slice(0, 3).map((poster, index) => (
              <PosterMiniCard
                key={poster.id}
                poster={poster}
                badge={index === 0 ? "찜" : undefined}
              />
            ))}
          </PosterMiniRail>
        </section>

        <GuideCard
          title="자주 보는 기관을 구독해 보세요"
          action={{ href: "/institutions", label: "기관 둘러보기" }}
        >
          구독한 기관에 새 공고가 올라오면 홈에서 모아 보여드려요.
        </GuideCard>

        <section aria-labelledby="actions" className="space-y-3">
          <SectionHeader id="actions" title="버튼 · 토스트 · 바텀시트" />
          <div className="flex flex-wrap gap-2">
            <FavoriteButton
              favorited={favorited}
              onToggle={() => setFavorited((value) => !value)}
            />
            <button
              type="button"
              className="min-h-[44px] rounded-lg border border-pl-ink px-4 text-sm font-bold"
              onClick={() =>
                showActionToast("이 기기에 저장됐어요", {
                  label: "계정에 보관하기",
                  onClick: () => setSheetOpen(true),
                })
              }
            >
              토스트 보기
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded-lg border border-pl-ink px-4 text-sm font-bold"
              onClick={() => setSheetOpen(true)}
            >
              바텀시트 열기
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded-lg border border-pl-ink px-4 text-sm font-bold"
              onClick={() => {
                setLateDisabled(false);
                setEdgeSheetOpen(true);
              }}
            >
              예외 시트 열기
            </button>
          </div>
        </section>
      </main>

      {/* Focus edge cases: hidden first control, removed from tab order, disabled later, long content. */}
      <BottomSheet
        open={edgeSheetOpen}
        onClose={() => setEdgeSheetOpen(false)}
        title="예외 상태 확인용 시트"
        primary={
          <button
            type="button"
            disabled={lateDisabled}
            className="min-h-[48px] rounded-lg bg-pl-ink font-bold text-white disabled:opacity-50"
          >
            나중에 비활성화되는 버튼
          </button>
        }
      >
        <fieldset disabled>
          <legend className="text-xs">비활성 묶음</legend>
          <input aria-label="비활성 묶음 안 입력" className="border" />
        </fieldset>
        <button type="button" hidden>
          숨겨진 첫 버튼
        </button>
        <button type="button" tabIndex={-1} className="sr-only">
          탭 순서에서 빠진 버튼
        </button>
        <button
          type="button"
          onClick={() => setLateDisabled(true)}
          className="min-h-[44px] rounded-lg border border-pl-line px-3 text-sm"
        >
          아래 버튼 비활성화
        </button>
        {Array.from({ length: 8 }, (_, index) => (
          <p key={index} className="mt-2">
            긴 내용 {index + 1}: 짧은 화면과 큰 글자에서도 제목과 버튼까지
            스크롤로 모두 읽을 수 있어야 합니다.
          </p>
        ))}
      </BottomSheet>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="찜한 공고를 계정에 보관할까요?"
        primary={
          <button
            type="button"
            className="min-h-[48px] rounded-lg bg-kakao font-bold text-kakao-text"
          >
            카카오로 계속하기
          </button>
        }
        footnote="이 기기에 찜한 공고는 계정으로 그대로 옮겨져요"
      >
        <ul className="list-disc space-y-1 pl-5">
          <li>다른 기기에서도 찜한 공고를 이어서 볼 수 있어요</li>
          <li>관심 지역과 기관의 새 공고를 모아 볼 수 있어요</li>
        </ul>
      </BottomSheet>

      <ReportFab />
      <ActionBar
        favorited={favorited}
        onToggleFavorite={() => setFavorited((value) => !value)}
        primary={
          <PrimaryActionLink href="https://example.org">
            공식 공고 확인하기
          </PrimaryActionLink>
        }
      />
      <BottomNav />
    </div>
  );
}
