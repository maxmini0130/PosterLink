"use client";
import { useState } from "react";
import {
  getDeadlinePresentation,
  type DeadlineInput,
} from "../../../lib/deadlinePresentation";
import { PlPosterCard } from "../../components/pl/PlPosterCard";
import {
  PosterListCard,
  type PlPosterCardData,
} from "../../components/pl/PosterListCard";
import { PlBadge, PlButton, PlChip } from "../../components/pl/PlControls";
import { StatusTag } from "../../components/pl/DeadlineParts";

/** The day the v6.1 card sheets were drawn (screens/cards-deadline-*.png). */
const SHEET_NOW = new Date("2026-11-09T03:00:00Z");

type Case = {
  caption: string;
  poster: PlPosterCardData;
  input: Omit<DeadlineInput, "now">;
};

const CASES: Case[] = [
  {
    caption: "원문에 23:59가 있는 공고",
    poster: {
      id: "56a42e3b-b0b6-43d9-98d6-dfb4a0310859",
      title: "또오리랑 가죽공방 모집",
      eligibility: "서울 생활권 만 19~39세 청년",
      org: "서울청년센터 양천",
    },
    input: {
      deadlineType: "fixed",
      applicationEndAt: "2026-11-11T23:59:00+09:00",
      deadlineStatus: "verified",
      deadlineTimeVerified: true,
      receptionVerified: true,
    },
  },
  {
    caption: "신혼부부 매입임대",
    poster: {
      id: "86d33f6a-bd33-47e9-a56b-3a81e636be7e",
      title: "신혼부부 매입임대주택 입주자 모집",
      eligibility: "서울 거주 무주택 신혼부부",
      org: "강북구청",
    },
    input: {
      deadlineType: "fixed",
      applicationEndAt: "2026-11-12T18:00:00+09:00",
      deadlineStatus: "verified",
      deadlineTimeVerified: true,
      receptionVerified: true,
    },
  },
  {
    caption: "날짜만 수집한 공고",
    poster: {
      id: "29b0ca07-2272-42bc-9eff-d5a8b54d7d81",
      title: "일하는 청년을 위한 포인트 노동법",
      eligibility: "일하는 청년",
      org: "서울청년센터 은평",
    },
    input: {
      deadlineType: "fixed",
      applicationEndAt: "2026-11-15T23:59:59+09:00",
      deadlineStatus: "verified",
      receptionVerified: true,
    },
  },
  {
    caption: "마감 당일",
    poster: {
      id: "ae76f5b3-a35a-4918-8beb-a0cf93db3a67",
      title: "싱글데이: 싱글말고 위글",
      eligibility: "서초구 거주 · 생활권 1인가구",
      org: "서초1인가구지원센터",
    },
    input: {
      deadlineType: "fixed",
      applicationEndAt: "2026-11-09T23:59:59+09:00",
      deadlineStatus: "verified",
      receptionVerified: true,
    },
  },
  {
    caption: "송파 잡톡 · 확인됨",
    poster: {
      id: "80a5419d-059e-4c58-8f99-7323931339ca",
      title: "현직자 멘토링 송파 잡톡 참여자 모집",
      eligibility: "39세 이하 청년 누구나",
      org: "송파구청",
    },
    input: {
      deadlineType: "per_session",
      sessionRuleText: "각 클래스 전날까지 접수",
      sessionRuleVerified: true,
      lastSessionDeadlineDate: "2026-12-13",
      receptionVerified: true,
    },
  },
  {
    caption: "집 보는 수업 · 확인 전",
    poster: {
      id: "309c3c02-ee56-4ff5-ab50-f15623510f5a",
      title: "집 보는 수업 < 보여줘! 강북홈즈 >",
      eligibility: "만 19~39세 청년",
      org: "서울청년센터 강북",
    },
    input: {
      deadlineType: "per_session",
      sessionRuleVerified: false,
      lastSessionDeadlineDate: "2026-11-19",
      receptionVerified: true,
    },
  },
  {
    caption: "접수 여부도 확인 전",
    poster: {
      id: "0d8bc7f3-6d9e-4ddd-a957-44d10dd2bfc6",
      title: "길에서 만나는 노동의 역사 탐방",
      eligibility: "서울에서 일하거나 거주하는 노동자",
      org: "서울노동권익센터",
    },
    input: {
      deadlineType: "unknown",
      receptionVerified: false,
      deadlineStatus: "unverified",
    },
  },
  {
    caption: "강사단 교육 · 확인 전",
    poster: {
      id: "daae5af9-8046-4718-ac32-beb2997634ff",
      title: "청소년 자원봉사교육 강사단 양성교육",
      eligibility: "마포구 거주 · 활동자",
      org: "마포구청",
    },
    input: {
      deadlineType: "fixed",
      applicationEndAt: "2026-12-03T23:59:59+09:00",
      deadlineStatus: "unverified",
      receptionVerified: true,
    },
  },
  {
    caption: "같은 공고 · 확인 후",
    poster: {
      id: "daae5af9-8046-4718-ac32-beb2997634ff",
      title: "청소년 자원봉사교육 강사단 양성교육",
      eligibility: "마포구 거주 · 활동자",
      org: "마포구청",
    },
    input: {
      deadlineType: "fixed",
      applicationEndAt: "2026-11-20T18:00:00+09:00",
      deadlineStatus: "verified",
      deadlineTimeVerified: true,
      receptionVerified: true,
    },
  },
];

/**
 * v6.1 stage 3 check sheet: the card states of screens/cards-deadline-1.png and
 * -2.png, drawn by the shared components at the sheet's date.
 */
export function V61CardStates() {
  const [favorites, setFavorites] = useState<Set<number>>(new Set([2]));
  const [applied, setApplied] = useState(false);
  const toggle = (index: number) =>
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  return (
    <section aria-labelledby="v61-cards" className="space-y-4">
      <h2
        id="v61-cards"
        className="font-pl-serif text-lg font-bold text-pl-ink"
      >
        v6.1 카드 상태 (기준 11.9 정오)
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4">
        {CASES.map((item, index) => {
          const presentation = getDeadlinePresentation({
            ...item.input,
            applied: index === 1 && applied,
            now: SHEET_NOW,
          });
          return (
            <figure key={`${item.poster.id}-${index}`} className="m-0 min-w-0">
              <PlPosterCard
                poster={item.poster}
                presentation={presentation}
                favorite={favorites.has(index)}
                onFavorite={() => toggle(index)}
              />
              <figcaption className="mt-2 flex flex-wrap items-center gap-1 text-xs font-bold text-pl-ink">
                {item.caption}
                <StatusTag presentation={presentation} />
              </figcaption>
            </figure>
          );
        })}
      </div>
      <div className="space-y-2">
        <PosterListCard
          poster={{
            ...CASES[1].poster,
            deadline: "2026-11-12T18:00:00+09:00",
            deadlineType: "fixed",
            deadlineVerification: {
              deadlineStatus: "verified",
              deadlineTimeVerified: true,
              receptionVerified: true,
            },
          }}
        />
        <PosterListCard
          poster={{
            ...CASES[5].poster,
            deadlineType: "per_session",
            deadlineVerification: { receptionVerified: true },
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PlButton variant="primary">신청 페이지로 이동</PlButton>
        <PlButton
          variant={applied ? "applied" : "default"}
          aria-pressed={applied}
          onClick={() => setApplied((value) => !value)}
        >
          {applied ? "✓ 신청했어요" : "신청했어요"}
        </PlButton>
        <PlButton variant="outline">원문 보기</PlButton>
        <PlChip selected>전체</PlChip>
        <PlChip>교육·강좌</PlChip>
        <p className="text-[12.5px] text-pl-ink">
          <PlBadge>우대</PlBadge>강북구민
          <PlBadge must>필수</PlBadge>노트북 지참
        </p>
      </div>
    </section>
  );
}
