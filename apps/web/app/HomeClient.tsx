"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { Footer } from "./components/Footer";
import { BottomSheet } from "./components/pl/BottomSheet";
import {
  OrgSuggestions,
  type CardHandlers,
} from "./components/pl/HomeSections";
import {
  FavoriteDeadlineBanner,
  HomeBundleRow,
  HomeChipBar,
  HomeGrid,
  HomeRegionBar,
  HomeSectionHead,
  HomeSubtitle,
  SinceLastVisitButton,
} from "./components/pl/HomeV61";
import { loadPosterCards } from "./lib/posterCards";
import { useAppliedPosters } from "./lib/appliedClient";
import { getDeadlinePresentation } from "../lib/deadlinePresentation";
import { cardDeadlineInput } from "../lib/posterDeadlineFields";
import {
  favoriteDeadlineLine,
  type FavoriteDeadlineLine,
} from "../lib/favoriteDeadlineLine";
import { visibleHomeChips, type HomeChipId } from "../lib/homeChips";
import {
  FollowPrompt,
  useFollowPromptOffer,
} from "./components/pl/FollowPrompt";
import {
  saveGuestFavorite,
  forgetGuestFavorite,
  rememberActionForLogin,
  PENDING_NOT_STORED_MESSAGE,
} from "./lib/guestSession";
import { loadHomeConditions, type HomeConditions } from "./lib/homeData";
import { recordVisitActivity } from "./lib/visitClock";
import { supabase } from "./lib/supabase";
import { trackProductEvent } from "../lib/productEvents";
import type { HomeBlock, HomeCard, HomeSectionId } from "../lib/homeFeed";
import type { HomeFeedResult } from "../lib/homeFeedServer";
import type { TopDiscoveryCombination } from "../lib/publicDiscovery";

const RESTORE_KEY = "pl.home_restore.v1";

type Restore = { key: string; pages: number; y: number; at: number };

// The app router's back button is a client-side history move: the document's
// navigation type stays "navigate", so the last popstate is remembered here.
let lastHistoryMoveAt = 0;
if (typeof window !== "undefined")
  window.addEventListener("popstate", () => {
    lastHistoryMoveAt = Date.now();
  });

function cameBackByHistory() {
  const entry = performance.getEntriesByType?.("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return (
    entry?.type === "back_forward" || Date.now() - lastHistoryMoveAt < 5000
  );
}

function conditionQuery(
  conditions: HomeConditions | null,
  baseline: number | null,
  view: { chip: HomeChipId | null; fresh: boolean } = {
    chip: null,
    fresh: false,
  },
) {
  const params = new URLSearchParams();
  if (conditions?.interest.region)
    params.set("region", conditions.interest.region.id);
  if (conditions?.interest.categories.length)
    params.set(
      "categories",
      conditions.interest.categories.map((c) => c.id).join(","),
    );
  if (conditions?.institutions.length)
    params.set("follows", conditions.institutions.map((i) => i.id).join(","));
  // v6.1: "지난 방문 이후" for every returning visitor (null on a first visit).
  if (baseline !== null) params.set("since", String(baseline));
  if (view.chip) params.set("chip", view.chip);
  if (view.fresh && baseline !== null) params.set("fresh", "1");
  return params;
}

function readRestore(): Restore | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(RESTORE_KEY) || "null");
    if (
      value &&
      typeof value.key === "string" &&
      Number.isInteger(value.pages) &&
      typeof value.y === "number" &&
      Date.now() - value.at < 30 * 60000
    )
      return value as Restore;
  } catch {
    /* storage blocked */
  }
  return null;
}

/** Fires feed_card_impression once per card when ≥50% is visible for 1s. */
function useCardImpressions(
  root: React.RefObject<HTMLElement>,
  active: boolean,
) {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const container = root.current;
    if (!active || !container || typeof IntersectionObserver === "undefined")
      return;
    const timers = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            if (timers.has(el)) continue;
            timers.set(
              el,
              window.setTimeout(() => {
                timers.delete(el);
                const id = el.dataset.feedCard;
                const section = el.dataset.section;
                if (!id || !section || seen.current.has(`${section}:${id}`))
                  return;
                seen.current.add(`${section}:${id}`);
                trackProductEvent("feed_card_impression", {
                  posterId: id,
                  metadata: {
                    screen: "home",
                    section_id: section,
                    position: Number(el.dataset.position) || null,
                    image_kind: el.querySelector("[data-default-poster]")
                      ? "default"
                      : "original",
                  },
                });
              }, 1000),
            );
          } else {
            window.clearTimeout(timers.get(el));
            timers.delete(el);
          }
        }
      },
      { threshold: 0.5 },
    );
    const observeAll = () =>
      container
        .querySelectorAll("[data-feed-card][data-section]")
        .forEach((el) => observer.observe(el));
    observeAll();
    const mutations = new MutationObserver(observeAll);
    mutations.observe(container, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [root, active]);
}

export default function Home({
  initial,
  initialPages = 1,
  topCombinations,
  summary = null,
}: {
  /** Server-rendered default home (서울 전체, no conditions). */
  initial: HomeFeedResult | null;
  initialPages?: number;
  topCombinations: TopDiscoveryCombination[];
  summary?: { activePosters: number | null; dueThisWeek: number | null } | null;
}) {
  const router = useRouter();
  const [feed, setFeed] = useState<HomeFeedResult | null>(initial);
  const [pages, setPages] = useState<HomeBlock[][]>(
    initial?.layout.pages ?? [],
  );
  const [hasMore, setHasMore] = useState(initial?.layout.hasMore ?? false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(!initial);
  const [conditions, setConditions] = useState<HomeConditions | null>(null);
  const [favorites, setFavorites] = useState(new Set<string>());
  const [busy, setBusy] = useState(new Set<string>());
  const [baseline, setBaseline] = useState<number | null>(null);
  const [chip, setChip] = useState<HomeChipId | null>(null);
  const [freshOnly, setFreshOnly] = useState(false);
  const [favoriteLine, setFavoriteLine] = useState<FavoriteDeadlineLine | null>(
    null,
  );
  const [sheet, setSheet] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const sequence = useRef(0);
  /** The condition query the pages on screen were built for ("" = server's). */
  const shownKey = useRef("");
  const main = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const followedIds = useMemo(
    () => new Set(conditions?.institutions.map((i) => i.id) ?? []),
    [conditions],
  );
  const prompt = useFollowPromptOffer(followedIds);

  const view = useMemo(() => ({ chip, fresh: freshOnly }), [chip, freshOnly]);
  const queryKey = conditionQuery(conditions, baseline, view).toString();
  const fetchPages = useCallback(
    async (count: number, from: number) => {
      const params = conditionQuery(conditions, baseline, view);
      params.set("pages", String(count));
      params.set("from", String(from));
      const response = await fetch(`/api/home?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("home");
      return (await response.json()) as HomeFeedResult & { from: number };
    },
    [conditions, baseline, view],
  );

  // 찜 마감 줄 (SPEC 4.6): the favourites, wherever they are, judged the same
  // way; posters marked as applied are left out (SPEC 5).
  const appliedMarks = useAppliedPosters();
  const favoriteKey = [...favorites].sort().join(",");
  const appliedKey = [...appliedMarks.applied].sort().join(",");
  useEffect(() => {
    const appliedIds = new Set(appliedKey ? appliedKey.split(",") : []);
    let active = true;
    const ids = favoriteKey ? favoriteKey.split(",").slice(0, 200) : [];
    if (!ids.length) {
      setFavoriteLine(null);
      return;
    }
    loadPosterCards(ids)
      .then((cards) => {
        if (!active || !cards) return;
        const now = new Date();
        setFavoriteLine(
          favoriteDeadlineLine(
            cards.map((card) => ({
              id: card.id,
              presentation: getDeadlinePresentation(
                cardDeadlineInput(
                  { ...card, applied: appliedIds.has(card.id) },
                  now,
                ),
              ),
            })),
            now,
          ),
        );
      })
      .catch(() => active && setFavoriteLine(null));
    return () => {
      active = false;
    };
  }, [favoriteKey, appliedKey]);

  // Who is looking, with which conditions; then the matching sections.
  useEffect(() => {
    let active = true;
    void recordVisitActivity()
      .then((visit) => active && setBaseline(visit.baselineAt))
      .catch(() => {});
    loadHomeConditions()
      .then((next) => {
        if (!active) return;
        setConditions(next);
        setFavorites(new Set(next.favoriteIds));
      })
      .catch(() => {
        if (active)
          setConditions({
            signedIn: false,
            interest: { region: null, categories: [] },
            favoriteIds: [],
            institutions: [],
          });
      });
    return () => {
      active = false;
    };
  }, []);

  // Conditions or a restored scroll position need a fresh server layout.
  useEffect(() => {
    if (!conditions) return;
    const restore = readRestore();
    const back = restore?.key === queryKey && cameBackByHistory();
    const personal = queryKey.length > 0;
    const previousKey = shownKey.current;
    shownKey.current = queryKey;
    if (!personal && !back && initial) {
      // Back to no conditions after a chip or "지난 방문 이후" view: show the
      // server's layout again. On mount (or a preserved back navigation) the
      // pages already on screen are kept.
      if (previousKey) {
        sequence.current += 1;
        setFeed(initial);
        setPages(initial.layout.pages);
        setHasMore(initial.layout.hasMore);
        setError(false);
      }
      return;
    }
    const count = back
      ? Math.max(restore!.pages, 1)
      : Math.max(initialPages, 1);
    const seq = ++sequence.current;
    fetchPages(count, 1)
      .then((next) => {
        if (seq !== sequence.current) return;
        setFeed(next);
        setPages(next.layout.pages);
        setHasMore(next.layout.hasMore);
        setError(false);
        if (back) requestAnimationFrame(() => window.scrollTo(0, restore!.y));
      })
      .catch(() => {
        if (seq === sequence.current && !initial) setError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditions, queryKey]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const seq = sequence.current;
    try {
      const next = await fetchPages(pages.length + 1, pages.length + 1);
      if (seq !== sequence.current) return;
      setPages((current) => [...current, ...next.layout.pages]);
      setHasMore(next.layout.hasMore);
    } catch {
      toast.error("공고를 더 불러오지 못했어요");
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPages, hasMore, loadingMore, pages.length]);

  // Next 12 when the end of the page is 600px away. The large top margin
  // also counts a sentinel already scrolled past (a jump to the bottom).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && void loadMore(),
      { rootMargin: "100000px 0px 600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Remember how far the visitor got, for the back button.
  useEffect(() => {
    const save = () => {
      try {
        sessionStorage.setItem(
          RESTORE_KEY,
          JSON.stringify({
            key: queryKey,
            pages: pages.length,
            y: window.scrollY,
            at: Date.now(),
          }),
        );
      } catch {
        /* storage blocked */
      }
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("click", save, true);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("click", save, true);
    };
  }, [pages.length, queryKey]);

  useCardImpressions(main, Boolean(feed));

  const signedIn = Boolean(conditions?.signedIn);
  const interest = conditions?.interest;
  const changeHref = signedIn ? "/mypage/edit" : "/interests";

  async function toggle(card: HomeCard, sectionId: HomeSectionId) {
    const id = card.id;
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setBusy(new Set(inFlight.current));
    const saved = favorites.has(id);
    try {
      if (!signedIn) {
        const ok = saved ? forgetGuestFavorite(id) : saveGuestFavorite(id);
        if (!ok) {
          toast.error("이 기기에 저장하지 못했어요");
          return;
        }
      } else {
        const user = (await supabase.auth.getSession()).data.session?.user;
        if (!user) throw Error("signed out");
        const result = saved
          ? await supabase
              .from("favorites")
              .delete()
              .eq("user_id", user.id)
              .eq("poster_id", id)
          : await supabase
              .from("favorites")
              .upsert(
                { user_id: user.id, poster_id: id },
                { onConflict: "user_id,poster_id" },
              );
        if (result.error) throw result.error;
      }
      setFavorites((current) => {
        const next = new Set(current);
        if (saved) next.delete(id);
        else next.add(id);
        return next;
      });
      trackProductEvent(saved ? "favorite_remove" : "favorite_add", {
        posterId: id,
        metadata: {
          screen: "home",
          section_id: sectionId,
          logged_in: signedIn,
        },
      });
      if (!saved) {
        // The organiser follow prompt wins; otherwise guests get the save sheet.
        const offered = prompt.offer(
          card.card.organizerId && card.card.org
            ? { id: card.card.organizerId, name: card.card.org }
            : null,
          "favorite",
        );
        if (!offered && !signedIn) {
          toast.success("이 기기에 저장됐어요");
          setSheet(id);
        } else if (!offered) toast.success("찜했어요");
      }
    } catch {
      toast.error("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      inFlight.current.delete(id);
      setBusy(new Set(inFlight.current));
    }
  }

  const handlers: CardHandlers = {
    favorites,
    busy,
    applied: appliedMarks.applied,
    onFavorite: (card, sectionId) => void toggle(card, sectionId),
    onOpen: (card, sectionId, position) =>
      trackProductEvent("feed_card_click", {
        posterId: card.id,
        metadata: { screen: "home", section_id: sectionId, position },
      }),
  };

  const layout = feed?.layout;
  // "접수 중 N건": the chosen region's open posters (SPEC 7.1).
  const intro = layout?.openTotal ?? summary?.activePosters ?? null;
  let position = 1;
  const freshSince = baseline !== null ? (layout?.freshSince ?? 0) : 0;
  const scopeLabel = interest?.region?.name || feed?.scopeLabel || "서울 전체";
  const chips = layout ? visibleHomeChips(layout.chipCounts ?? {}) : [];
  // A chip hidden after the region changed falls back to 전체.
  const shownChip =
    chip && chips.some((item) => item.id === chip) ? chip : null;

  return (
    <div className="min-h-screen bg-pl-paper pb-[calc(var(--mobile-nav-height)+24px)] font-pl-sans text-pl-ink md:pb-8">
      <div className="hidden md:block">
        <Header />
      </div>
      <main
        ref={main}
        className="mx-auto max-w-[1200px] px-4 md:px-6 md:pt-8 min-[1248px]:px-0"
      >
        <h1 className="sr-only">공공기관 포스터 모아 보기</h1>
        <div className="md:flex md:items-start md:justify-between md:gap-6">
          <div className="min-w-0">
            <HomeRegionBar scopeLabel={scopeLabel} changeHref={changeHref} />
            <HomeSubtitle openTotal={intro} />
          </div>
          {favoriteLine && (
            <div className="mt-3 md:mt-0">
              <FavoriteDeadlineBanner line={favoriteLine} />
            </div>
          )}
        </div>
        <div className="mt-3 md:mt-5">
          <HomeChipBar chips={chips} selected={shownChip} onSelect={setChip} />
        </div>

        {error && !layout ? (
          <div role="alert" className="py-10 text-center">
            <p>공고를 불러오지 못했어요.</p>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-3 min-h-11 underline"
            >
              다시 불러오기
            </button>
          </div>
        ) : !layout ? null : (
          <>
            {/* v6.1 (SPEC 7.1): the posters come first; the v5 rows above the
                feed (눈여겨볼 공고, 7일 안에 마감, 팔로우 기관 소식) are left out. */}
            {pages.length > 0 && (
              <section
                aria-labelledby="home-new"
                data-home-section="new"
                className="mt-4 md:mt-8"
              >
                <HomeSectionHead
                  id="home-new"
                  title="새로 올라온 공고"
                  action={
                    freshSince > 0 || freshOnly ? (
                      <SinceLastVisitButton
                        count={freshSince}
                        active={freshOnly}
                        onToggle={() => setFreshOnly((value) => !value)}
                      />
                    ) : null
                  }
                />
                {pages.map((blocks, pageIndex) =>
                  blocks.map((block) => {
                    if (block.kind === "new") {
                      const start = position;
                      position += block.items.length;
                      return (
                        <HomeGrid
                          key={`new-${pageIndex}`}
                          items={block.items}
                          handlers={handlers}
                          startPosition={start}
                          priorityCount={pageIndex === 0 ? 2 : 0}
                        />
                      );
                    }
                    if (block.kind === "bundle")
                      return (
                        <HomeBundleRow
                          key={block.id}
                          sectionId={block.id}
                          title={block.title}
                          href={block.href}
                          items={block.items}
                          handlers={handlers}
                        />
                      );
                    return (
                      <OrgSuggestions
                        key="orgs"
                        items={block.items}
                        returnPath="/"
                      />
                    );
                  }),
                )}
              </section>
            )}
            <div ref={sentinel} aria-hidden="true" />
            {loadingMore && (
              <div
                role="status"
                className="flex h-14 items-center justify-center gap-2 text-[13.5px] text-pl-meta"
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-pl-line border-t-pl-ink"
                />
                공고를 더 불러오는 중
              </div>
            )}
            {hasMore && !loadingMore && (
              <a
                href={`/?page=${pages.length + 1}`}
                onClick={(event) => {
                  event.preventDefault();
                  void loadMore();
                }}
                className="my-6 flex min-h-12 w-full items-center justify-center rounded-lg border border-pl-line bg-pl-card font-bold"
              >
                더 보기
              </a>
            )}
            {!pages.length && (
              <p className="py-8 text-sm text-pl-meta">
                {freshOnly
                  ? "지난 방문 이후 올라온 공고가 없어요."
                  : "지금 접수 중인 공고가 없어요."}{" "}
                {freshOnly ? (
                  <button
                    type="button"
                    onClick={() => setFreshOnly(false)}
                    className="min-h-11 underline"
                  >
                    전체 보기
                  </button>
                ) : (
                  <Link href="/posters" className="underline">
                    다른 지역·분야 공고 찾기
                  </Link>
                )}
              </p>
            )}
          </>
        )}
        <nav
          aria-label="지역별 공고"
          className="mt-12 border-t border-pl-line pt-6"
        >
          <p className="mb-3 text-sm font-bold">지역별 공고 모아보기</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-pl-meta">
            {topCombinations.map((c) => (
              <Link
                key={`${c.regionSlug}:${c.categorySlug}`}
                href={`/regions/${c.regionSlug}/${c.categorySlug}`}
                className="min-h-8 underline"
              >
                {c.regionName} {c.categoryName}
              </Link>
            ))}
          </div>
        </nav>
      </main>
      <Footer />
      <BottomNav />
      {prompt.request && (
        <FollowPrompt
          request={prompt.request}
          screen="home"
          signedIn={signedIn}
          returnTo="/"
          headline={
            signedIn
              ? "찜했어요 · 내 공고에 담겼어요"
              : "이 기기에 찜했어요 · 내 공고에 담겼어요"
          }
          onClose={prompt.close}
          onFollowed={(institutionId) =>
            setConditions((current) =>
              current
                ? {
                    ...current,
                    institutions: [
                      ...current.institutions,
                      {
                        id: institutionId,
                        name: prompt.request?.institution.name ?? "",
                        slug: "",
                      },
                    ],
                  }
                : current,
            )
          }
        />
      )}
      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title="찜한 공고를 계정에 보관할까요?"
        primary={
          <button
            type="button"
            className="min-h-12 rounded-lg bg-pl-ink text-white"
            onClick={() => {
              if (!sheet) return;
              if (
                !rememberActionForLogin({
                  type: "favorite",
                  targetId: sheet,
                  returnTo: "/",
                })
              ) {
                toast.error(PENDING_NOT_STORED_MESSAGE);
                return;
              }
              router.push("/login");
            }}
          >
            로그인하고 계정에 보관하기
          </button>
        }
        footnote="지금은 이 기기에 저장돼 있어요. 로그인하지 않아도 내 공고에서 볼 수 있어요."
      >
        <p>
          이 기기에 저장됐어요. 다른 기기에서도 이어서 보려면 계정에 보관해
          주세요.
        </p>
        <Link
          href="/interests"
          className="mt-3 inline-flex min-h-11 items-center underline"
        >
          관심 분야만 먼저 고르기
        </Link>
      </BottomSheet>
    </div>
  );
}
