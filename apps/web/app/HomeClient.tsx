"use client";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Search, X, MapPin } from "lucide-react";
import toast from "react-hot-toast";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { Footer } from "./components/Footer";
import { FeedCard } from "./components/pl/FeedCard";
import { BottomSheet } from "./components/pl/BottomSheet";
import {
  guestLocal,
  saveGuestFavorite,
  forgetGuestFavorite,
  rememberActionForLogin,
  PENDING_NOT_STORED_MESSAGE,
} from "./lib/guestSession";
import { loadHomeData, type HomeData } from "./lib/homeData";
import { recordVisitActivity } from "./lib/visitClock";
import { supabase } from "./lib/supabase";
import {
  buildPosterFeed,
  FEED_DISMISS_KEY,
  interestPromptVisible,
} from "../lib/posterFeed";
import { saveGuestInterest } from "../lib/guestInterest";
import { visitDateLabel } from "../lib/homeSections";
import { trackProductEvent } from "../lib/productEvents";
import type { TopDiscoveryCombination } from "../lib/publicDiscovery";

type Tab = "fresh" | "closing" | "all";
export default function Home({
  topCombinations,
}: {
  topCombinations: TopDiscoveryCombination[];
}) {
  const router = useRouter(),
    sequence = useRef(0),
    inFlight = useRef(new Set<string>());
  const [data, setData] = useState<HomeData | null>(null),
    [error, setError] = useState(false),
    [baseline, setBaseline] = useState<number | null>(null);
  const [favorites, setFavorites] = useState(new Set<string>()),
    [busy, setBusy] = useState(new Set<string>());
  const [tab, setTab] = useState<Tab | null>(null),
    [page, setPage] = useState(1),
    [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState(false),
    [sheet, setSheet] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const seq = ++sequence.current;
    setError(false);
    try {
      const next = await loadHomeData();
      if (seq !== sequence.current) return;
      setData(next);
      setFavorites(new Set(next.favoriteItems.map((i) => i.id)));
      setPage(1);
    } catch {
      if (seq === sequence.current) setError(true);
    }
  }, []);
  const invalidate = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    void reload();
    void recordVisitActivity()
      .then((v) => setBaseline(v.baselineAt))
      .catch(() => {});
    setPrompt(interestPromptVisible(guestLocal, Date.now()));
    return invalidate;
  }, [reload, invalidate]);
  const hasInterest = Boolean(
      data?.interest.region || data?.interest.categories.length,
    ),
    memberInterest = Boolean(data?.signedIn && hasInterest);
  const feed = useMemo(
    () =>
      data
        ? buildPosterFeed({
            items: data.interestItems,
            favoriteIds: favorites,
            regionId: data.interest.region?.id ?? null,
            regions: data.regions,
            baselineAt: baseline,
            memberInterest,
            now: new Date(),
          })
        : null,
    [data, favorites, baseline, memberInterest],
  );
  const selected: Tab =
    tab === "fresh" && !feed?.fresh.length
      ? "closing"
      : (tab ??
        (memberInterest ? (feed?.fresh.length ? "fresh" : "closing") : "all"));
  const fresh = feed?.fresh ?? [],
    closing = feed?.closing ?? [],
    own = feed?.own ?? [];
  const first =
    selected === "fresh" ? fresh : selected === "closing" ? closing : own;
  const appendOpen =
    memberInterest &&
    (selected === "fresh" || (selected === "closing" && fresh.length === 0));
  const rest = appendOpen
    ? own.filter((i) => !first.some((h) => h.id === i.id))
    : [];
  const combined = [...first, ...rest],
    shown = combined.slice(0, page * 8);
  const changeHref = data?.signedIn ? "/mypage/edit" : "/interests";
  async function toggle(id: string) {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setBusy(new Set(inFlight.current));
    const saved = favorites.has(id);
    try {
      if (!data?.signedIn) {
        const ok = saved ? forgetGuestFavorite(id) : saveGuestFavorite(id);
        if (!ok) {
          toast.error("이 기기에 저장하지 못했어요");
          return;
        }
        if (!saved) {
          toast.success("이 기기에 저장됐어요");
          setSheet(id);
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
        metadata: { screen: "home" },
      });
    } catch {
      toast.error("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      inFlight.current.delete(id);
      setBusy(new Set(inFlight.current));
    }
  }
  async function choose(categoryId: string) {
    if (
      !saveGuestInterest(
        guestLocal,
        {
          regionId: data?.interest.region?.id ?? null,
          categoryIds: [categoryId],
        },
        Date.now(),
      )
    ) {
      toast.error("조건을 저장하지 못했어요");
      return;
    }
    setTab(null);
    await reload();
  }
  const showPrompt = prompt && !data?.signedIn && !hasInterest;
  const promptCard = (
    <li
      className="col-span-full rounded-xl border border-pl-line bg-pl-card p-4"
      data-interest-prompt
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold">
          관심 분야를 고르면 맞춰서 보여드려요
        </p>
        <button
          type="button"
          aria-label="관심 분야 안내 닫기"
          className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center"
          onClick={() => {
            try {
              guestLocal.setItem(FEED_DISMISS_KEY, String(Date.now()));
              setPrompt(false);
            } catch {
              toast.error("닫기 설정을 저장하지 못했어요");
            }
          }}
        >
          <X size={18} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {data?.availableCategories?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => void choose(c.id)}
            className="min-h-11 rounded-full border border-pl-line bg-pl-paper px-3 text-[13px]"
          >
            {c.name}
          </button>
        ))}
      </div>
    </li>
  );
  const tabs: Array<[Tab, string]> = memberInterest
    ? [
        ...(fresh.length
          ? [["fresh", `새 공고 ${fresh.length}`] as [Tab, string]]
          : []),
        ["closing", `7일 안에 마감 ${closing.length}`],
        ["all", "전체"],
      ]
    : [
        ["all", "지금 접수 중"],
        ["closing", "7일 안에 마감"],
      ];
  return (
    <div className="min-h-screen bg-pl-paper pb-[calc(var(--mobile-nav-height)+24px)] font-pl-sans text-pl-ink md:pb-8">
      <div className="hidden md:block">
        <Header />
      </div>
      <header className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 pt-4 md:hidden">
        <Link href="/" className="font-pl-serif text-xl font-bold">
          PosterLink
        </Link>
        <Link
          href={changeHref}
          className="flex min-h-11 max-w-[65%] items-center gap-1 rounded-full border border-pl-line px-3 text-sm"
        >
          <MapPin size={15} />
          <span className="truncate">
            {data?.interest.region?.name ?? "지역·관심 조건"}
          </span>
        </Link>
      </header>
      <main className="mx-auto max-w-[1280px] px-4 pt-4 md:px-6 md:pt-7 min-[1200px]:px-10">
        <h1 className="sr-only">공공 공고 포스터 피드</h1>
        <div className="mb-3 hidden items-center justify-between md:flex">
          <Link
            href={changeHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-pl-line px-4 text-sm"
          >
            <MapPin size={15} />
            {[
              data?.interest.region?.name,
              ...(data?.interest.categories.map((c) => c.name) ?? []),
            ]
              .filter(Boolean)
              .join(" · ") || "지역·관심 조건"}
            <span className="text-pl-meta">변경</span>
          </Link>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push(
              query.trim()
                ? `/posters?q=${encodeURIComponent(query.trim())}`
                : "/posters",
            );
          }}
          role="search"
          className="mb-4 flex min-h-11 items-center gap-2 rounded-xl border border-pl-line bg-pl-card px-3"
        >
          <Search
            size={19}
            className="shrink-0 text-pl-meta"
            aria-hidden="true"
          />
          <label htmlFor="feed-search" className="sr-only">
            공고·기관·주제 검색
          </label>
          <input
            id="feed-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="공고·기관·주제 검색"
            maxLength={80}
            className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none"
          />
          <button
            type="submit"
            className="min-h-11 shrink-0 px-2 text-sm font-bold"
          >
            검색
          </button>
        </form>
        <div
          role="tablist"
          aria-label="공고 보기"
          className="mb-4 flex gap-1 border-b border-pl-line"
        >
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected === id}
              tabIndex={selected === id ? 0 : -1}
              aria-controls="poster-feed"
              id={`tab-${id}`}
              onClick={() => {
                setTab(id);
                setPage(1);
              }}
              onKeyDown={(event) => {
                const index = tabs.findIndex(([key]) => key === id);
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                setTab(tabs[next][0]);
                setPage(1);
                document.getElementById(`tab-${tabs[next][0]}`)?.focus();
              }}
              className={`min-h-11 border-b-2 px-3 pb-2 text-sm font-bold ${selected === id ? "border-pl-ink text-pl-ink" : "border-transparent text-pl-meta"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {memberInterest && baseline !== null && (
          <p className="mb-4 text-xs text-pl-meta">
            {visitDateLabel(baseline)} 방문 이후 올라온 공고
          </p>
        )}
        {error ? (
          <div role="alert" className="py-10 text-center">
            <p>공고를 불러오지 못했어요.</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-3 min-h-11 underline"
            >
              다시 불러오기
            </button>
          </div>
        ) : !feed ? (
          <div aria-label="공고 불러오는 중" className="feed-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-lg bg-pl-poster"
              />
            ))}
          </div>
        ) : (
          <section
            role="tabpanel"
            id="poster-feed"
            aria-labelledby={`tab-${selected}`}
          >
            {shown.length === 0 && (
              <div className="py-6 text-sm text-pl-meta">
                {selected === "closing"
                  ? "7일 안에 마감하는 공고가 없어요."
                  : "조건에 맞는 접수 중 공고가 없어요."}{" "}
                <Link href={changeHref} className="underline">
                  조건 변경
                </Link>
              </div>
            )}
            <ul className="feed-grid">
              {shown.map((entry, index) => (
                <Fragment key={entry.id}>
                  {index === first.length && rest.length > 0 && (
                    <li className="col-span-full pt-4 text-base font-bold">
                      접수 중인 관심 공고
                    </li>
                  )}
                  <li>
                    <FeedCard
                      poster={entry.data}
                      display={entry.display}
                      favorite={favorites.has(entry.id)}
                      busy={busy.has(entry.id)}
                      onFavorite={() => void toggle(entry.id)}
                      priority={index < 2}
                    />
                  </li>
                  {index === 3 && showPrompt && promptCard}
                </Fragment>
              ))}
              {shown.length < 4 && showPrompt && promptCard}
            </ul>
            {combined.length > page * 8 && (
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="my-6 flex min-h-12 w-full items-center justify-center rounded-lg border border-pl-line bg-pl-card font-bold"
              >
                더 보기
              </button>
            )}
            {feed.wider.length > 0 && (
              <section className="mt-9" aria-label="서울·전국 대상 공고">
                <h2 className="mb-2 text-lg font-bold">
                  {[...new Set(feed.wider.map((i) => i.scope.label))].join("·")}{" "}
                  대상 공고
                </h2>
                <p className="mb-4 text-xs text-pl-meta">
                  신청 대상은 원문에서 확인해 주세요.
                </p>
                <ul className="feed-grid">
                  {feed.wider.slice(0, page * 8).map(({ entry, scope }) => (
                    <li key={entry.id}>
                      <FeedCard
                        poster={{ ...entry.data, regionLabel: scope.label }}
                        display={entry.display}
                        favorite={favorites.has(entry.id)}
                        busy={busy.has(entry.id)}
                        onFavorite={() => void toggle(entry.id)}
                      />
                    </li>
                  ))}
                </ul>
                {feed.wider.length > page * 8 && (
                  <button
                    type="button"
                    className="my-6 min-h-12 w-full rounded-lg border border-pl-line bg-pl-card"
                    onClick={() => setPage((p) => p + 1)}
                  >
                    대상 공고 더 보기
                  </button>
                )}
              </section>
            )}
            {!combined.length && !feed.wider.length && (
              <Link
                href="/posters"
                className="my-5 inline-flex min-h-11 items-center underline"
              >
                다른 지역·분야 공고 찾기
              </Link>
            )}
          </section>
        )}
        <nav
          aria-label="지역별 공고"
          className="mt-12 border-t border-pl-line pt-6"
        >
          <p className="mb-3 text-sm font-bold">지역별 공고 둘러보기</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-pl-meta">
            {topCombinations.slice(0, 12).map((c) => (
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
