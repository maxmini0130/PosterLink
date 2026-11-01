"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { BottomNav } from "./components/BottomNav";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { GuideCard } from "./components/pl/GuideCard";
import {
  PosterListCard,
  PosterMiniCard,
  PosterMiniRail,
  PosterTileCard,
  type PlPosterCardData,
} from "./components/pl/PosterListCard";
import { ReportFab } from "./components/pl/ReportFab";
import { SectionHeader } from "./components/pl/SectionHeader";
import { guestLocal, guestTab } from "./lib/guestSession";
import { loadHomeData, type HomeData, type HomeInterest } from "./lib/homeData";
import { recordVisitActivity } from "./lib/visitClock";
import {
  buildHomeSections,
  OPEN_INTEREST_SHOWN,
  visitDateLabel,
  type HomeEntry,
} from "../lib/homeSections";
import {
  readEntry,
  readGuestInterest,
  shouldOfferInterestPicker,
  wasInterestOffered,
} from "../lib/guestInterest";
import type { TopDiscoveryCombination } from "../lib/publicDiscovery";

type Entry = HomeEntry<PlPosterCardData>;

type State =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; data: HomeData; baselineAt: number | null };

const FRESH_FIRST = 3;

/** "마포구 · 관심 분야 3" for the button; the full list on PC. */
function interestSummary(interest: HomeInterest) {
  const parts = [
    interest.region?.name,
    interest.categories.length
      ? `관심 분야 ${interest.categories.length}`
      : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function interestFull(interest: HomeInterest) {
  return [
    interest.region?.name,
    ...interest.categories.map((category) => category.name),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Search path for "모두 보기": region and the first interest category. */
function interestSearchPath(interest: HomeInterest) {
  const params = new URLSearchParams();
  if (interest.region) params.set("region", interest.region.id);
  if (interest.categories.length === 1)
    params.set("category", interest.categories[0].id);
  const query = params.toString();
  return query ? `/posters?${query}` : "/posters";
}

/** Condition line under a section title: "마포구 · 문화/행사 외 2 · 접수 중". */
function conditionLine(interest: HomeInterest, status = "접수 중") {
  const [first, ...rest] = interest.categories;
  return [
    interest.region ? interest.region.name : null,
    first ? `${first.name}${rest.length ? ` 외 ${rest.length}` : ""}` : null,
    status,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function Home({
  topCombinations,
}: {
  topCombinations: TopDiscoveryCombination[];
}) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [showAllFresh, setShowAllFresh] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    Promise.all([loadHomeData(), recordVisitActivity()])
      .then(([data, visit]) => {
        if (!active) return;
        // Opening the service for the first time: choose conditions first
        // (UI plan ⑤). Shared links and searches never get here by themselves.
        if (
          shouldOfferInterestPicker({
            signedIn: data.signedIn,
            interest: readGuestInterest(guestLocal),
            offered: wasInterestOffered(guestLocal),
            firstVisit: visit.baselineAt === null,
            entry: readEntry(guestTab),
          })
        ) {
          router.replace("/interests");
          return;
        }
        setState({ phase: "ready", data, baselineAt: visit.baselineAt });
      })
      .catch(() => {
        if (active) setState({ phase: "error" });
      });
    return () => {
      active = false;
    };
  }, [router]);

  const sections = useMemo(
    () =>
      state.phase === "ready"
        ? buildHomeSections({
            interest: state.data.interestItems,
            latest: state.data.latestItems,
            favorites: state.data.favoriteItems,
            followed: state.data.followedItems,
            followedInstitutionIds: state.data.institutions.map(
              (institution) => institution.id,
            ),
            baselineAt: state.baselineAt,
            now: new Date(),
          })
        : null,
    [state],
  );

  const interest =
    state.phase === "ready"
      ? state.data.interest
      : { region: null, categories: [] };
  const hasInterest = Boolean(interest.region || interest.categories.length);
  const summary = interestSummary(interest);
  const signedIn = state.phase === "ready" && state.data.signedIn;
  // An empty side column would leave a third of the PC screen blank.
  const hasAside = Boolean(
    sections &&
    (sections.closingSoon.length > 0 ||
      sections.followedNews.length > 0 ||
      sections.startedFavorites.length > 0 ||
      sections.followGuide),
  );

  // Members edit the account's conditions; guests those kept in this browser.
  const interestButton =
    state.phase === "ready" ? (
      <Link
        href={signedIn ? "/mypage/edit" : "/interests"}
        className="inline-flex min-h-[44px] max-w-full items-center gap-1.5 rounded-lg border border-pl-line bg-pl-card px-3 text-[13px] font-medium text-pl-ink"
      >
        <SlidersHorizontal size={15} aria-hidden="true" />
        <span className="truncate">
          <span className="xl:hidden">{summary ?? "관심 조건 정하기"}</span>
          <span className="hidden xl:inline">
            {hasInterest ? interestFull(interest) : "관심 조건 정하기"}
          </span>
        </span>
        {hasInterest && <span className="sr-only">(관심 조건 바꾸기)</span>}
      </Link>
    ) : null;

  return (
    <div className="pl-home min-h-screen bg-pl-paper pb-[calc(var(--mobile-nav-height)+32px)] font-pl-sans text-pl-ink md:pb-12">
      <div className="hidden md:block">
        <Header />
      </div>
      <header className="flex items-center justify-between gap-3 px-5 pt-4 md:hidden">
        <p className="font-pl-serif text-xl font-bold">PosterLink</p>
        {interestButton}
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-5 py-5 xl:px-10 xl:py-8">
        <h1 className="sr-only">PosterLink 홈</h1>
        {state.phase === "loading" && (
          <p className="text-sm text-pl-sub" role="status">
            불러오는 중이에요…
          </p>
        )}
        {state.phase === "error" && (
          <GuideCard
            title="공고를 불러오지 못했어요"
            action={{ href: "/posters", label: "공고 찾기로 가기" }}
          >
            잠시 후 다시 열어 주세요.
          </GuideCard>
        )}
        {state.phase === "ready" && sections && (
          <div className="flex flex-wrap gap-x-10 gap-y-7">
            <div className="min-w-0 flex-[1_1_560px] space-y-7">
              <TopLine
                state={sections.state}
                baselineAt={state.baselineAt}
                freshCount={sections.fresh.length}
                hasInterest={hasInterest}
                interestButton={interestButton}
              />

              {!signedIn && !hasInterest && (
                <GuideCard
                  title="관심 지역·분야를 골라 보세요"
                  action={{ href: "/interests", label: "관심 조건 고르기" }}
                >
                  고른 조건에 맞는 공고를 홈에 먼저 보여드려요. 가입 없이 이
                  기기에 저장돼요.
                </GuideCard>
              )}

              {sections.state === "first" && (
                <>
                  <EntryList
                    title={
                      hasInterest
                        ? "지금 접수 중인 관심 공고"
                        : "지금 접수 중인 공고"
                    }
                    condition={
                      hasInterest ? conditionLine(interest) : undefined
                    }
                    entries={sections.openInterest.slice(
                      0,
                      OPEN_INTEREST_SHOWN,
                    )}
                    action={{
                      href: interestSearchPath(interest),
                      label: hasInterest ? "관심 공고 모두 보기" : "모두 보기",
                    }}
                  />
                  <GuideCard title="찜해 두면 다음에 모아 보여드려요">
                    마음에 드는 공고를 찜해 두면, 다음에 오셨을 때 새 공고와
                    함께 모아 보여드려요.
                  </GuideCard>
                </>
              )}

              {sections.fresh.length > 0 && (
                <section aria-labelledby="home-fresh">
                  <h2 id="home-fresh" className="sr-only">
                    새로 올라온 {hasInterest ? "관심 " : ""}공고
                  </h2>
                  <EntryGrid
                    entries={
                      showAllFresh
                        ? sections.fresh
                        : sections.fresh.slice(0, FRESH_FIRST)
                    }
                  />
                  {!showAllFresh && sections.fresh.length > FRESH_FIRST && (
                    <button
                      type="button"
                      onClick={() => setShowAllFresh(true)}
                      className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-pl-line bg-pl-card text-sm font-medium xl:w-auto xl:px-5"
                    >
                      새 공고 {sections.fresh.length - FRESH_FIRST}건 더 보기
                    </button>
                  )}
                </section>
              )}

              {sections.openInterest.length > 0 &&
                sections.state !== "first" && (
                  <EntryList
                    title={
                      hasInterest ? "접수 중인 관심 공고" : "접수 중인 공고"
                    }
                    condition={
                      hasInterest ? conditionLine(interest) : undefined
                    }
                    entries={sections.openInterest.slice(
                      0,
                      OPEN_INTEREST_SHOWN,
                    )}
                    action={{
                      href: interestSearchPath(interest),
                      label: "모두 보기",
                    }}
                  />
                )}

              {sections.latest.length > 0 && (
                <section aria-labelledby="home-latest">
                  <SectionHeader id="home-latest" title="최근 올라온 공고" />
                  <EntryGrid entries={sections.latest} />
                  <Link
                    href="/posters"
                    className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-pl-sub underline underline-offset-2"
                  >
                    전체 공고 보기
                  </Link>
                </section>
              )}
            </div>

            {hasAside && (
              <aside
                aria-label="마감과 구독 소식"
                className="w-full min-w-0 space-y-7 xl:w-[340px] xl:flex-none"
              >
                {sections.closingSoon.length > 0 && (
                  <ClosingSoon
                    entries={sections.closingSoon}
                    quiet={sections.state === "quiet"}
                    hasInterest={hasInterest}
                    moreHref={interestSearchPath(interest)}
                  />
                )}
                {sections.followedNews.length > 0 && (
                  <section aria-labelledby="home-follows">
                    <SectionHeader id="home-follows" title="구독 기관 소식" />
                    <ul className="divide-y divide-pl-divider rounded-xl border border-pl-line bg-pl-card">
                      {sections.followedNews.map((group) => {
                        const institution = state.data.institutions.find(
                          (item) => item.id === group.institutionId,
                        );
                        const [latest] = group.items;
                        return (
                          <li key={group.institutionId} className="p-3">
                            <p className="flex items-center justify-between gap-2 text-xs text-pl-meta">
                              <Link
                                href={`/institutions/${institution?.slug ?? ""}`}
                                className="truncate font-bold text-pl-ink underline-offset-2 hover:underline"
                              >
                                {institution?.name}
                              </Link>
                              <span className="shrink-0">
                                새 공고 {group.items.length}
                              </span>
                            </p>
                            <Link
                              href={`/posters/${latest.id}`}
                              data-poster-source="home"
                              className="mt-1 line-clamp-2 min-h-[24px] text-sm font-medium leading-snug text-pl-ink underline-offset-2 hover:underline"
                            >
                              {latest.data.title}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                {sections.startedFavorites.length > 0 && (
                  <EntryList
                    title="접수를 시작한 찜 공고"
                    entries={sections.startedFavorites}
                  />
                )}
                {sections.followGuide && (
                  <GuideCard
                    title="자주 보는 기관을 구독해 보세요"
                    action={{ href: "/institutions", label: "기관 둘러보기" }}
                  >
                    구독한 기관에 새 공고가 올라오면 홈에 먼저 보여드려요.
                  </GuideCard>
                )}
              </aside>
            )}
          </div>
        )}

        {topCombinations.length > 0 && (
          <nav aria-labelledby="home-browse" className="mt-12">
            <h2 id="home-browse" className="mb-3 text-base font-bold">
              지역별로 찾아보기
            </h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 xl:grid-cols-4">
              {topCombinations.slice(0, 12).map((combination) => (
                <li
                  key={`${combination.regionSlug}:${combination.categorySlug}`}
                >
                  <a
                    href={`/regions/${combination.regionSlug}/${combination.categorySlug}`}
                    className="inline-flex min-h-[36px] items-center text-sm text-pl-sub underline-offset-2 hover:underline"
                  >
                    {combination.regionName} {combination.categoryName} 공고{" "}
                    {combination.count.toLocaleString()}건
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
      <ReportFab />
      <Footer />
      <BottomNav />
    </div>
  );
}

function TopLine({
  state,
  baselineAt,
  freshCount,
  hasInterest,
  interestButton,
}: {
  state: "first" | "new" | "quiet";
  baselineAt: number | null;
  freshCount: number;
  hasInterest: boolean;
  interestButton: ReactNode;
}) {
  const kind = hasInterest ? "관심 공고" : "공고";
  if (state === "first" || baselineAt === null)
    return interestButton ? (
      <div className="hidden justify-end xl:flex">{interestButton}</div>
    ) : null;
  const since = `${visitDateLabel(baselineAt)} 방문 이후`;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      {state === "new" ? (
        <div>
          <p className="text-xs text-pl-meta">{since}</p>
          <p className="font-pl-serif text-[22px] font-bold leading-snug xl:text-[28px]">
            새로 올라온 {kind}{" "}
            <span className="text-pl-accent">{freshCount}건</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-pl-sub">
          {since} 새 {kind}는 아직 없어요
        </p>
      )}
      {interestButton && (
        <div className="hidden xl:block">{interestButton}</div>
      )}
    </div>
  );
}

function EntryList({
  title,
  condition,
  entries,
  action,
}: {
  title: string;
  condition?: string;
  entries: Entry[];
  action?: { href: string; label: string };
}) {
  if (entries.length === 0) return null;
  return (
    <section aria-label={title}>
      <SectionHeader title={title} condition={condition} />
      <ul className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
        {entries.map((entry) => (
          <li key={entry.id}>
            <PosterListCard
              poster={entry.data}
              source="home"
              badge={entry.favorite ? "찜" : undefined}
            />
          </li>
        ))}
      </ul>
      {action && (
        <Link
          href={action.href}
          className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-pl-sub underline underline-offset-2"
        >
          {action.label}
        </Link>
      )}
    </section>
  );
}

/** List cards on mobile, poster tiles on PC. */
function EntryGrid({ entries }: { entries: Entry[] }) {
  return (
    <>
      <ul className="grid gap-2.5 xl:hidden">
        {entries.map((entry) => (
          <li key={entry.id}>
            <PosterListCard
              poster={entry.data}
              source="home"
              badge={entry.favorite ? "찜" : undefined}
            />
          </li>
        ))}
      </ul>
      <ul className="hidden gap-4 xl:grid xl:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {entries.map((entry) => (
          <li key={entry.id}>
            <PosterTileCard
              poster={entry.data}
              source="home"
              badge={entry.favorite ? "찜" : undefined}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function ClosingSoon({
  entries,
  quiet,
  hasInterest,
  moreHref,
}: {
  entries: Entry[];
  quiet: boolean;
  hasInterest: boolean;
  moreHref: string;
}) {
  const title = quiet
    ? `7일 안에 마감되는 ${hasInterest ? "관심 " : ""}공고`
    : "7일 안에 마감";
  return (
    <section aria-labelledby="home-closing">
      <SectionHeader id="home-closing" title={title} />
      {quiet ? (
        <ul className="grid gap-2.5">
          {entries.map((entry) => (
            <li key={entry.id}>
              <PosterListCard
                poster={entry.data}
                source="home"
                badge={entry.favorite ? "찜" : undefined}
              />
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className="xl:hidden">
            <PosterMiniRail label={title}>
              {entries.map((entry) => (
                <PosterMiniCard
                  key={entry.id}
                  poster={entry.data}
                  source="home"
                  badge={entry.favorite ? "찜" : undefined}
                />
              ))}
            </PosterMiniRail>
          </div>
          <ul className="hidden gap-2.5 xl:grid">
            {entries.map((entry) => (
              <li key={entry.id}>
                <PosterListCard
                  poster={entry.data}
                  source="home"
                  badge={entry.favorite ? "찜" : undefined}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {quiet && (
        <Link
          href={moreHref}
          className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-pl-sub underline underline-offset-2"
        >
          접수 중인 {hasInterest ? "관심 " : ""}공고 모두 보기
        </Link>
      )}
    </section>
  );
}
