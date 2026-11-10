"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { BottomNav } from "../components/BottomNav";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { ApplyMark } from "../components/pl/ApplyMark";
import { GuideCard } from "../components/pl/GuideCard";
import {
  PosterListCard,
  type PlPosterCardData,
} from "../components/pl/PosterListCard";
import { SectionHeader } from "../components/pl/SectionHeader";
import { InstitutionFollowButton } from "../institutions/InstitutionFollowButton";
import {
  GUEST_MERGED_EVENT,
  PENDING_ACTION_DONE_EVENT,
  forgetGuestFavorite,
  guestLocal,
  signInWithKakao,
} from "../lib/guestSession";
import { loadPosterCards } from "../lib/posterCards";
import { supabase } from "../lib/supabase";
import {
  discardUnavailableGuestFavorites,
  dismissMergeNotice,
  readGuestFavorites,
  readMergeNotice,
  readUnavailableGuestFavorites,
} from "../../lib/guestStore";
import {
  cardApplicationInput,
  createReadWriteGate,
  groupByReception,
  noDateNote,
  type UserStatus,
} from "../../lib/myPosters";
import { trackProductEvent } from "../../lib/productEvents";
import { readGuestApplied } from "../../lib/appliedPosters";
import { markApplied, unmarkApplied } from "../lib/appliedClient";
import { saveGuestFavorite } from "../lib/guestSession";
import { showActionToast } from "../components/pl/actionToast";
import { FavoritesV61, type FavoriteCard } from "./FavoritesV61";

type Favorite = { card: PlPosterCardData; status: UserStatus };
type Institution = { id: string; name: string; slug: string };
type Tab = "favorites" | "following";

type State =
  | { phase: "loading" }
  | { phase: "error" }
  | {
      phase: "guest";
      /** This browser's favourites and 신청했어요 marks (a mark alone also shows). */
      entries: Array<{ card: FavoriteCard; applied: boolean }>;
      favoriteIds: ReadonlySet<string>;
      count: number;
    }
  | {
      phase: "member";
      userId: string;
      favorites: Favorite[];
      /** False until favorites.user_status exists (migration 20261101010000). */
      applySupported: boolean;
      institutions: Institution[];
    };

const RETURN_TO = "/my-posters";

function isMissingColumn(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      /user_status/.test(error.message ?? "")),
  );
}

async function loadMember(userId: string): Promise<State> {
  let applySupported = true;
  let rows: Array<{ poster_id: string; user_status?: string | null }> | null =
    null;
  const withStatus = await supabase
    .from("favorites")
    .select("poster_id, user_status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (isMissingColumn(withStatus.error)) {
    applySupported = false;
    const plain = await supabase
      .from("favorites")
      .select("poster_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (plain.error) return { phase: "error" };
    rows = plain.data;
  } else if (withStatus.error) {
    return { phase: "error" };
  } else {
    rows = withStatus.data;
  }

  const statusById = new Map(
    (rows ?? []).map(
      (row) =>
        [
          row.poster_id,
          row.user_status === "applied" ? "applied" : "interested",
        ] as const,
    ),
  );
  const [cards, follows] = await Promise.all([
    loadPosterCards([...statusById.keys()]),
    supabase
      .from("institution_follows")
      .select("institution_id, institutions(id, name, slug)")
      .eq("user_id", userId),
  ]);
  if (!cards) return { phase: "error" };
  const institutions = (
    (follows.data ?? []) as Array<{
      institutions: Institution | Institution[] | null;
    }>
  )
    .flatMap((row) =>
      Array.isArray(row.institutions)
        ? row.institutions
        : row.institutions
          ? [row.institutions]
          : [],
    )
    .filter((institution) => institution?.slug);
  return {
    phase: "member",
    userId,
    applySupported,
    institutions,
    favorites: cards.map((card) => ({
      card,
      status: (statusById.get(card.id) ?? "interested") as UserStatus,
    })),
  };
}

async function loadGuest(): Promise<State> {
  const favoriteIds = readGuestFavorites(guestLocal).map(
    (item) => item.posterId,
  );
  const appliedIds = readGuestApplied(guestLocal).map((item) => item.posterId);
  const ids = [...new Set([...favoriteIds, ...appliedIds])];
  const cards = await loadPosterCards(ids);
  if (!cards) return { phase: "error" };
  const applied = new Set(appliedIds);
  return {
    phase: "guest",
    entries: cards.map((card) => ({ card, applied: applied.has(card.id) })),
    favoriteIds: new Set(favoriteIds),
    count: favoriteIds.length,
  };
}

export function MyPostersClient() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [tab, setTab] = useState<Tab>("favorites");
  const [mergedCount, setMergedCount] = useState<number | null>(null);
  const [unmovedCount, setUnmovedCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Reads (first load, merge and pending-action events) must not undo a
  // write the person just made on this screen.
  const gate = useRef(createReadWriteGate()).current;

  const load = useCallback(async () => {
    const token = gate.beginRead();
    if (token === null) return; // a write is running; read again after it
    const userId =
      (await supabase.auth.getSession()).data.session?.user.id ?? null;
    const next = userId ? await loadMember(userId) : await loadGuest();
    if (!gate.endRead(token)) return; // superseded by a newer read or a write
    setState(next);
    if (userId) {
      setMergedCount(readMergeNotice(guestLocal));
      setUnmovedCount(readUnavailableGuestFavorites(guestLocal).length);
    }
  }, [gate]);

  const write = async (run: () => Promise<void>) => {
    gate.beginWrite();
    try {
      await run();
    } finally {
      if (gate.endWrite()) void load();
    }
  };

  useEffect(() => {
    void load();
    const reload = () => void load();
    window.addEventListener(GUEST_MERGED_EVENT, reload);
    window.addEventListener(PENDING_ACTION_DONE_EVENT, reload);
    return () => {
      window.removeEventListener(GUEST_MERGED_EVENT, reload);
      window.removeEventListener(PENDING_ACTION_DONE_EVENT, reload);
    };
  }, [load]);

  const toggleGuestFavorite = (posterId: string) => {
    if (state.phase !== "guest") return;
    const saved = state.favoriteIds.has(posterId);
    if (saved) forgetGuestFavorite(posterId);
    else if (!saveGuestFavorite(posterId)) {
      toast.error("이 기기에 저장하지 못했어요");
      return;
    }
    trackProductEvent(saved ? "favorite_remove" : "favorite_add", {
      posterId,
      metadata: { screen: "favorites", logged_in: false },
    });
    void load();
  };

  // v6.1 신청 표시 from a row (SPEC 5, 9 "찜 이동"). The groups are read again
  // after the write, so the row moves at once.
  const mark = async (posterId: string) => {
    let ok = false;
    await write(async () => {
      setBusyId(posterId);
      ok = await markApplied(posterId, "favorites");
      setBusyId(null);
    });
    if (!ok) {
      toast.error("표시를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    await load();
    showActionToast(
      "'신청한 공고'로 옮겼어요",
      { label: "되돌리기", onClick: () => void unmark(posterId) },
      { id: "fav-moved" },
    );
  };

  const unmark = async (posterId: string) => {
    let ok = false;
    await write(async () => {
      setBusyId(posterId);
      ok = await unmarkApplied(posterId, "favorites");
      setBusyId(null);
    });
    if (!ok) toast.error("되돌리지 못했어요. 잠시 후 다시 시도해 주세요.");
    await load();
  };

  const removeMember = (userId: string, posterId: string) =>
    write(() => removeMemberNow(userId, posterId));

  const removeMemberNow = async (userId: string, posterId: string) => {
    setBusyId(posterId);
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("poster_id", posterId);
    setBusyId(null);
    if (error) {
      toast.error("찜을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    trackProductEvent("favorite_remove", {
      posterId,
      metadata: { screen: "favorites", logged_in: true },
    });
    setState((current) =>
      current.phase === "member"
        ? {
            ...current,
            favorites: current.favorites.filter(
              (entry) => entry.card.id !== posterId,
            ),
          }
        : current,
    );
  };

  const signIn = async () => {
    const error = await signInWithKakao(RETURN_TO);
    if (error)
      toast.error(
        "카카오 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
  };

  return (
    <div className="min-h-screen bg-pl-paper pb-[calc(var(--mobile-nav-height)+32px)] font-pl-sans text-pl-ink md:pb-12">
      <div className="hidden md:block">
        <Header />
      </div>
      <main className="mx-auto w-full max-w-[1200px] px-5 py-6 xl:px-10 xl:py-8">
        {state.phase === "member" ? (
          <MemberView
            state={state}
            tab={tab}
            setTab={setTab}
            mergedCount={mergedCount}
            onDismissNotice={() => {
              dismissMergeNotice(guestLocal);
              setMergedCount(null);
            }}
            unmovedCount={unmovedCount}
            onDiscardUnmoved={() => {
              discardUnavailableGuestFavorites(guestLocal);
              setUnmovedCount(0);
            }}
            busyId={busyId}
            onRemove={(posterId) => void removeMember(state.userId, posterId)}
            onMark={(posterId) => void mark(posterId)}
            onUnmark={(posterId) => void unmark(posterId)}
          />
        ) : (
          <>
            {state.phase !== "guest" && (
              <h1 className="font-pl-serif text-[26px] font-bold">찜</h1>
            )}
            {state.phase === "loading" && (
              <p className="mt-6 text-sm text-pl-sub" role="status">
                불러오는 중이에요…
              </p>
            )}
            {state.phase === "error" && (
              <div className="mt-6">
                <GuideCard title="내 공고를 불러오지 못했어요">
                  잠시 후 다시 열어 주세요.
                </GuideCard>
              </div>
            )}
            {state.phase === "guest" && (
              <GuestView
                state={state}
                busyId={busyId}
                onToggleFavorite={toggleGuestFavorite}
                onMark={(posterId) => void mark(posterId)}
                onUnmark={(posterId) => void unmark(posterId)}
                onSignIn={signIn}
              />
            )}
          </>
        )}
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}

function GuestView({
  state,
  busyId,
  onToggleFavorite,
  onMark,
  onUnmark,
  onSignIn,
}: {
  state: Extract<State, { phase: "guest" }>;
  busyId: string | null;
  onToggleFavorite: (posterId: string) => void;
  onMark: (posterId: string) => void;
  onUnmark: (posterId: string) => void;
  onSignIn: () => void;
}) {
  return (
    <div className="space-y-6">
      <FavoritesV61
        entries={state.entries}
        actions={{
          favoriteIds: state.favoriteIds,
          busyId,
          onToggleFavorite,
          onMark,
          onUnmark,
        }}
      />
      {state.entries.length > 0 && (
        <section
          aria-labelledby="guest-keep"
          className="rounded-xl border border-pl-line bg-pl-card p-4"
        >
          <h2 id="guest-keep" className="m-0 text-[15px] font-bold">
            이 기기에 찜한 공고 {state.count}개
          </h2>
          <p className="m-0 mt-1 text-sm leading-6 text-pl-sub">
            계정에 보관하면 다른 기기에서도 이어서 볼 수 있어요. 신청 표시도
            함께 옮겨져요.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSignIn}
              className="min-h-[48px] rounded-lg bg-kakao px-5 font-bold text-kakao-text"
            >
              카카오로 계속하기
            </button>
            <Link
              href="/login"
              className="inline-flex min-h-[44px] items-center text-sm font-medium underline underline-offset-2"
            >
              다른 방법으로 로그인
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

const TAB_ORDER: Tab[] = ["favorites", "following"];

function MemberView({
  state,
  tab,
  setTab,
  mergedCount,
  onDismissNotice,
  unmovedCount,
  onDiscardUnmoved,
  busyId,
  onRemove,
  onMark,
  onUnmark,
}: {
  state: Extract<State, { phase: "member" }>;
  tab: Tab;
  setTab: (tab: Tab) => void;
  mergedCount: number | null;
  onDismissNotice: () => void;
  unmovedCount: number;
  onDiscardUnmoved: () => void;
  busyId: string | null;
  onRemove: (posterId: string) => void;
  onMark: (posterId: string) => void;
  onUnmark: (posterId: string) => void;
}) {
  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "favorites", label: "찜", count: state.favorites.length },
    {
      key: "following",
      label: "팔로우 기관",
      count: state.institutions.length,
    },
  ];
  const visible = tab;

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = TAB_ORDER.indexOf(visible);
    const next =
      TAB_ORDER[
        (index + (event.key === "ArrowRight" ? 1 : -1) + TAB_ORDER.length) %
          TAB_ORDER.length
      ];
    setTab(next);
    document.getElementById(`my-tab-${next}`)?.focus();
  };

  return (
    <>
      {mergedCount !== null && (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-pl-ink px-4 py-3 text-sm text-white"
        >
          <span>이 기기에 찜한 공고 {mergedCount}개를 계정으로 옮겼어요</span>
          <button
            type="button"
            aria-label="안내 닫기"
            onClick={onDismissNotice}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {unmovedCount > 0 && (
        <div
          role="status"
          className="mb-4 flex flex-col gap-2 rounded-xl border border-pl-line bg-pl-card px-4 py-3 text-sm text-pl-ink sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            이 기기에 찜한 공고 {unmovedCount}개는 삭제되었거나 지금 볼 수 없는
            공고라 계정으로 옮기지 못했어요.
          </span>
          <button
            type="button"
            onClick={onDiscardUnmoved}
            className="inline-flex min-h-[44px] shrink-0 items-center self-start rounded-lg border border-pl-line px-3 font-medium sm:self-auto"
          >
            이 기기에서 지우기
          </button>
        </div>
      )}
      {state.institutions.length > 0 && (
        <div
          role="tablist"
          aria-label="찜 목록"
          className="mb-4 flex gap-1 overflow-x-auto"
        >
          {tabs.map((entry) => (
            <button
              key={entry.key}
              id={`my-tab-${entry.key}`}
              type="button"
              role="tab"
              aria-selected={visible === entry.key}
              aria-controls={`my-panel-${entry.key}`}
              tabIndex={visible === entry.key ? 0 : -1}
              onClick={() => setTab(entry.key)}
              onKeyDown={onTabKey}
              className={`min-h-[44px] shrink-0 rounded-lg px-4 text-sm ${
                visible === entry.key
                  ? "bg-pl-ink font-bold text-white"
                  : "border border-pl-line bg-pl-card text-pl-ink"
              }`}
            >
              {entry.label} {entry.count}
            </button>
          ))}
        </div>
      )}

      <div
        id="my-panel-favorites"
        role={state.institutions.length > 0 ? "tabpanel" : undefined}
        aria-labelledby={
          state.institutions.length > 0 ? "my-tab-favorites" : undefined
        }
        hidden={visible !== "favorites"}
      >
        <FavoritesV61
          entries={state.favorites.map((entry) => ({
            card: entry.card,
            applied: entry.status === "applied",
          }))}
          actions={{
            favoriteIds: new Set(state.favorites.map((entry) => entry.card.id)),
            busyId,
            onToggleFavorite: onRemove,
            onMark,
            onUnmark,
          }}
        />
      </div>

      <div
        id="my-panel-following"
        role="tabpanel"
        aria-labelledby="my-tab-following"
        hidden={visible !== "following"}
      >
        <ul className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
          {state.institutions.map((institution) => (
            <li
              key={institution.id}
              className="flex items-center gap-3 rounded-xl border border-pl-line bg-pl-card p-3"
            >
              <Link
                href={`/institutions/${institution.slug}`}
                className="min-w-0 flex-1 truncate text-[15px] font-bold underline-offset-2 hover:underline"
              >
                {institution.name}
              </Link>
              <InstitutionFollowButton
                institutionId={institution.id}
                returnPath={RETURN_TO}
                variant="pl"
              />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
