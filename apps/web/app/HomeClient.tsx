"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { BottomNav } from "./components/BottomNav";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { GuideCard } from "./components/pl/GuideCard";
import {
  PosterListCard,
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
  HOME_PAGE_SIZE,
  visitDateLabel,
  type HomeEntry,
  type HomeItem,
} from "../lib/homeSections";
import {
  readEntry,
  readGuestInterest,
  shouldOfferInterestPicker,
  wasInterestOffered,
} from "../lib/guestInterest";
import type { TopDiscoveryCombination } from "../lib/publicDiscovery";
import type { WiderScope } from "../lib/searchGroups";

type Entry = HomeEntry<PlPosterCardData>;

type State =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; data: HomeData; baselineAt: number | null };

/** "마포구 · 교육/취업 · 문화/행사" (PC) or "마포구 · 관심 분야 2" (phone). */
function conditionSummary(interest: HomeInterest, compact: boolean) {
  const categories = compact
    ? interest.categories.length
      ? [`관심 분야 ${interest.categories.length}`]
      : []
    : interest.categories.map((category) => category.name);
  return [interest.region?.name, ...categories].filter(Boolean).join(" · ");
}

/** Search path for "모두 보기": region and the only interest category. */
function interestSearchPath(interest: HomeInterest) {
  const params = new URLSearchParams();
  if (interest.region) params.set("region", interest.region.id);
  if (interest.categories.length === 1)
    params.set("category", interest.categories[0].id);
  const query = params.toString();
  return query ? `/posters?${query}` : "/posters";
}

/** "서울 전체·전국 대상 공고" from the scopes present. */
function widerTitle(scopes: WiderScope[]) {
  const labels = Array.from(new Set(scopes.map((scope) => scope.label)));
  return `${labels.join("·")} 대상 공고`;
}

export default function Home({
  topCombinations,
}: {
  topCombinations: TopDiscoveryCombination[];
}) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [pages, setPages] = useState(1);
  const [chip, setChip] = useState<string | null>(null);
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

  const sections = useMemo(() => {
    if (state.phase !== "ready") return null;
    const { data } = state;
    // A category chip narrows the interest lists to that category's scope.
    const scope = chip ? new Set(data.categoryScopes[chip] ?? [chip]) : null;
    const inChip = (item: HomeItem<PlPosterCardData>) =>
      !scope || (item.categoryIds ?? []).some((id) => scope.has(id));
    return buildHomeSections({
      interest: data.interestItems.filter(inChip),
      nearby: data.nearbyItems.filter(inChip),
      latest: data.latestItems,
      favorites: data.favoriteItems,
      followed: data.followedItems,
      followedInstitutionIds: data.institutions.map(
        (institution) => institution.id,
      ),
      region: {
        selectedId: data.interest.region?.id ?? null,
        regions: data.regions,
      },
      hasInterest: Boolean(
        data.interest.region || data.interest.categories.length,
      ),
      baselineAt: state.baselineAt,
      now: new Date(),
    });
  }, [state, chip]);

  const interest =
    state.phase === "ready"
      ? state.data.interest
      : { region: null, categories: [] };
  const hasInterest = Boolean(interest.region || interest.categories.length);
  const signedIn = state.phase === "ready" && state.data.signedIn;
  // Members edit the account's conditions; guests those kept in this browser.
  const conditionHref = signedIn ? "/mypage/edit" : "/interests";
  const kind = hasInterest ? "관심 공고" : "공고";

  return (
    <div className="pl-home min-h-screen bg-pl-paper pb-[calc(var(--mobile-nav-height)+32px)] font-pl-sans text-pl-ink md:pb-12">
      <div className="hidden md:block">
        <Header />
      </div>
      <header className="px-4 pt-4 md:hidden">
        <p className="font-pl-serif text-xl font-bold">PosterLink</p>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 py-4 md:px-6 md:py-6 min-[1200px]:px-10">
        {state.phase === "loading" && (
          <p className="text-sm text-pl-sub" role="status">
            불러오는 중이에요…
          </p>
        )}
        {state.phase === "error" && (
          <>
            <h1 className="sr-only">PosterLink 홈</h1>
            <GuideCard
              title="공고를 불러오지 못했어요"
              action={{ href: "/posters", label: "공고 찾기로 가기" }}
            >
              잠시 후 다시 열어 주세요.
            </GuideCard>
          </>
        )}
        {state.phase === "ready" && sections && (
          <>
            <section aria-labelledby="home-title" className="mb-6">
              {state.baselineAt !== null && (
                <p className="text-xs text-pl-meta">
                  {visitDateLabel(state.baselineAt)} 방문 이후
                  {sections.state === "quiet" && ` 새 ${kind}는 아직 없어요`}
                </p>
              )}
              <h1
                id="home-title"
                className="font-pl-serif text-[22px] font-bold leading-snug md:text-[26px]"
              >
                {sections.state === "new" ? (
                  <>
                    지난 방문 이후 새 {kind}{" "}
                    <span className="text-pl-accent">
                      {sections.primary.length}건
                    </span>
                  </>
                ) : interest.region ? (
                  `${interest.region.name}의 새로운 기회`
                ) : (
                  `지금 접수 중인 ${kind}`
                )}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-pl-sub">
                {hasInterest ? (
                  <>
                    <span className="md:hidden">
                      {conditionSummary(interest, true)}
                    </span>
                    <span className="hidden md:inline">
                      {conditionSummary(interest, false)}
                    </span>
                    <span aria-hidden="true">|</span>
                    <Link
                      href={conditionHref}
                      className="inline-flex min-h-[44px] items-center font-medium text-pl-ink underline underline-offset-2"
                    >
                      조건 변경
                    </Link>
                  </>
                ) : (
                  <>
                    <span>
                      관심 지역·분야를 고르면 맞는 공고를 먼저 보여드려요.
                    </span>
                    <Link
                      href={conditionHref}
                      className="inline-flex min-h-[44px] items-center font-medium text-pl-ink underline underline-offset-2"
                    >
                      조건 고르기
                    </Link>
                  </>
                )}
              </p>
              <form action="/posters" role="search" className="mt-2">
                <label htmlFor="home-search" className="sr-only">
                  공고·기관·주제 검색
                </label>
                <div className="relative">
                  <Search
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pl-meta"
                  />
                  <input
                    id="home-search"
                    name="q"
                    type="search"
                    enterKeyHint="search"
                    placeholder="공고·기관·주제 검색"
                    className="h-12 w-full rounded-xl border border-pl-line bg-pl-card pl-10 pr-3 text-base text-pl-ink placeholder:text-pl-meta"
                  />
                </div>
              </form>
              {interest.categories.length > 1 && (
                <div
                  role="group"
                  aria-label="관심 분야로 좁히기"
                  className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
                >
                  {[{ id: null, name: "전체" }, ...interest.categories].map(
                    (category) => (
                      <button
                        key={category.id ?? "all"}
                        type="button"
                        aria-pressed={chip === category.id}
                        onClick={() => {
                          setChip(category.id);
                          setPages(1);
                        }}
                        className="inline-flex min-h-[40px] shrink-0 items-center rounded-full border border-pl-line px-3.5 text-sm font-medium aria-pressed:border-pl-ink aria-pressed:bg-pl-ink aria-pressed:text-white"
                      >
                        {category.name}
                      </button>
                    ),
                  )}
                </div>
              )}
            </section>

            <div className="grid gap-x-8 gap-y-10 min-[1200px]:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-10">
                {sections.primary.length > 0 ? (
                  <section aria-labelledby="home-primary">
                    <h2 id="home-primary" className="sr-only">
                      {sections.primaryKind === "fresh"
                        ? `새로 올라온 ${kind}`
                        : interest.region
                          ? `${interest.region.name} 접수 중 ${kind}`
                          : `접수 중인 ${kind}`}
                    </h2>
                    <CardGrid
                      entries={sections.primary.slice(
                        0,
                        pages * HOME_PAGE_SIZE,
                      )}
                    />
                    {sections.primary.length > pages * HOME_PAGE_SIZE ? (
                      <button
                        type="button"
                        onClick={() => setPages((value) => value + 1)}
                        className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-pl-line bg-pl-card text-sm font-medium md:w-auto md:px-5"
                      >
                        {interest.region ? "내 지역 공고" : kind} 더 보기 (
                        {sections.primary.length - pages * HOME_PAGE_SIZE}건)
                      </button>
                    ) : (
                      <Link
                        href={interestSearchPath(interest)}
                        className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-pl-sub underline underline-offset-2"
                      >
                        {kind} 모두 보기
                      </Link>
                    )}
                  </section>
                ) : (
                  hasInterest && (
                    <RelaxConditions interest={interest} href={conditionHref} />
                  )
                )}

                {sections.wider.length > 0 && (
                  <section aria-labelledby="home-wider">
                    <SectionHeader
                      id="home-wider"
                      title={widerTitle(
                        sections.wider.map(({ scope }) => scope),
                      )}
                      condition="내 지역 밖에서도 열려 있을 수 있어요. 신청 대상은 원문에서 확인해 주세요."
                    />
                    <CardGrid
                      entries={sections.wider.map(({ entry }) => entry)}
                      scopes={sections.wider.map(({ scope }) => scope)}
                    />
                  </section>
                )}

                {sections.nearby.length > 0 && interest.region && (
                  <section aria-labelledby="home-nearby">
                    <SectionHeader
                      id="home-nearby"
                      title="같은 시·도의 다른 지역 공고"
                      condition={`${interest.region.name} 주민도 신청할 수 있는지는 원문에서 확인해 주세요.`}
                    />
                    <CardGrid entries={sections.nearby} nearby />
                  </section>
                )}

                {sections.startedFavorites.length > 0 && (
                  <section aria-labelledby="home-started">
                    <SectionHeader
                      id="home-started"
                      title="접수를 시작한 찜 공고"
                    />
                    <ul className="grid gap-2.5 md:grid-cols-2">
                      {sections.startedFavorites.map((entry) => (
                        <li key={entry.id}>
                          <PosterListCard
                            poster={entry.data}
                            source="home"
                            badge="찜"
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {sections.latest.length > 0 && (
                  <section aria-labelledby="home-latest">
                    <SectionHeader
                      id="home-latest"
                      title="최근 올라온 공고"
                      action={{ href: "/posters", label: "전체 공고 보기" }}
                    />
                    <CardGrid entries={sections.latest} />
                  </section>
                )}
              </div>

              <aside
                aria-label="마감과 구독 소식"
                className="min-w-0 space-y-6"
              >
                {sections.closingSoon.length > 0 && (
                  <section
                    aria-labelledby="home-closing"
                    className="rounded-xl border border-pl-line bg-pl-card p-4"
                  >
                    <h2 id="home-closing" className="text-base font-bold">
                      7일 이내 마감
                    </h2>
                    <ul className="mt-2 divide-y divide-pl-divider">
                      {sections.closingSoon.map((entry) => (
                        <li key={entry.id}>
                          <Link
                            href={`/posters/${entry.id}`}
                            data-poster-source="home"
                            className="flex min-h-[44px] items-start gap-2 py-2 text-sm underline-offset-2 hover:underline"
                          >
                            <span className="w-[4.5rem] shrink-0 whitespace-nowrap font-bold text-pl-accent">
                              {entry.display.text}
                            </span>
                            <span className="line-clamp-2 text-pl-ink">
                              {entry.data.title}
                            </span>
                            {entry.favorite && (
                              <span className="ml-auto shrink-0 text-xs text-pl-meta">
                                찜
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section
                  aria-labelledby="home-follows"
                  className="rounded-xl border border-pl-line bg-pl-card p-4"
                >
                  <h2 id="home-follows" className="text-base font-bold">
                    구독 기관 소식
                  </h2>
                  {sections.followedNews.length > 0 ? (
                    <ul className="mt-2 divide-y divide-pl-divider">
                      {sections.followedNews.map((group) => {
                        const institution = state.data.institutions.find(
                          (item) => item.id === group.institutionId,
                        );
                        const [latest] = group.items;
                        return (
                          <li key={group.institutionId} className="py-2">
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
                  ) : (
                    <p className="mt-1 text-sm text-pl-sub">
                      {state.data.institutions.length > 0
                        ? "구독한 기관의 새 공고가 아직 없어요."
                        : "관심 기관을 구독하면 새 공고를 여기에 모아 보여드려요."}{" "}
                      <Link
                        href="/institutions"
                        className="inline-flex min-h-[44px] items-center font-medium text-pl-ink underline underline-offset-2"
                      >
                        기관 둘러보기
                      </Link>
                    </p>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}

        {topCombinations.length > 0 && (
          <nav aria-labelledby="home-browse" className="mt-14">
            <h2 id="home-browse" className="mb-2 text-sm font-bold text-pl-sub">
              지역·분야별 공고 모음
            </h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-0">
              {topCombinations.slice(0, 12).map((combination) => (
                <li
                  key={`${combination.regionSlug}:${combination.categorySlug}`}
                >
                  <a
                    href={`/regions/${combination.regionSlug}/${combination.categorySlug}`}
                    className="inline-flex min-h-[36px] items-center text-xs text-pl-meta underline-offset-2 hover:underline"
                  >
                    {combination.regionName} {combination.categoryName}{" "}
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

/**
 * Two columns on phones, three from 768px (screen plan v1.0, 02). With fewer
 * posters the columns shrink instead of leaving a wide empty row.
 */
function CardGrid({
  entries,
  scopes,
  nearby = false,
}: {
  entries: Entry[];
  scopes?: WiderScope[];
  nearby?: boolean;
}) {
  const columns =
    entries.length >= 3
      ? "grid-cols-2 md:grid-cols-3"
      : "grid-cols-2 md:max-w-[720px]";
  return (
    <ul className={`grid gap-2.5 md:gap-4 ${columns}`}>
      {entries.map((entry, index) => {
        const scope = scopes?.[index];
        return (
          <li key={entry.id} className="min-w-0">
            <PosterTileCard
              poster={entry.data}
              source="home"
              badge={entry.favorite ? "찜" : undefined}
              region={
                scope
                  ? scope.nation
                    ? "nation"
                    : "seoul"
                  : nearby
                    ? "nearby"
                    : undefined
              }
              regionLabel={scope && !scope.nation ? scope.label : undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** No open posters for the conditions: suggest a wider search (03·04). */
function RelaxConditions({
  interest,
  href,
}: {
  interest: HomeInterest;
  href: string;
}) {
  const regionOnly = interest.region
    ? `/posters?region=${encodeURIComponent(interest.region.id)}`
    : "/posters";
  return (
    <section
      aria-labelledby="home-relax"
      className="rounded-xl border border-dashed border-pl-line bg-pl-card p-4"
    >
      <h2 id="home-relax" className="text-base font-bold">
        조건에 맞는 접수 중 공고가 지금은 없어요
      </h2>
      <p className="mt-1 text-sm text-pl-sub">
        조건을 넓혀 보거나, 아래의 다른 지역 공고를 확인해 보세요.
      </p>
      <p className="mt-2 flex flex-wrap gap-x-4">
        {interest.categories.length > 0 && (
          <Link
            href={regionOnly}
            className="inline-flex min-h-[44px] items-center text-sm font-medium underline underline-offset-2"
          >
            분야 조건 없이 보기
          </Link>
        )}
        <Link
          href={href}
          className="inline-flex min-h-[44px] items-center text-sm font-medium underline underline-offset-2"
        >
          조건 바꾸기
        </Link>
      </p>
    </section>
  );
}
