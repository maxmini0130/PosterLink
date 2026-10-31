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
  dismissMergeNotice,
  readGuestFavorites,
  readMergeNotice,
} from "../../lib/guestStore";
import {
  groupByReception,
  noDateNote,
  type UserStatus,
} from "../../lib/myPosters";
import { trackProductEvent } from "../../lib/productEvents";
import { getDeadlineDisplay } from "../../lib/deadlineDisplay";

type Favorite = { card: PlPosterCardData; status: UserStatus };
type Institution = { id: string; name: string; slug: string };
type Tab = "favorites" | "applied" | "following";

type State =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "guest"; cards: PlPosterCardData[]; count: number }
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

const applyInput = (card: PlPosterCardData) => ({
  applicationStartAt: card.applicationStartAt,
  applicationEndAt: card.deadline,
  deadlineType: card.deadlineType,
  posterStatus: card.posterStatus,
});

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
  const ids = readGuestFavorites(guestLocal).map((item) => item.posterId);
  const cards = await loadPosterCards(ids);
  if (!cards) return { phase: "error" };
  return { phase: "guest", cards, count: ids.length };
}

export function MyPostersClient() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [tab, setTab] = useState<Tab>("favorites");
  const [mergedCount, setMergedCount] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const userId =
      (await supabase.auth.getSession()).data.session?.user.id ?? null;
    const next = userId ? await loadMember(userId) : await loadGuest();
    if (seq !== loadSeq.current) return; // a newer load started meanwhile
    setState(next);
    if (userId) setMergedCount(readMergeNotice(guestLocal));
  }, []);

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

  const removeGuest = (posterId: string) => {
    forgetGuestFavorite(posterId);
    trackProductEvent("favorite_remove", {
      posterId,
      metadata: { screen: "favorites", logged_in: false },
    });
    setState((current) =>
      current.phase === "guest"
        ? {
            ...current,
            cards: current.cards.filter((card) => card.id !== posterId),
            count: current.count - 1,
          }
        : current,
    );
  };

  const removeMember = async (userId: string, posterId: string) => {
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

  const setApplied = async (
    userId: string,
    posterId: string,
    status: UserStatus,
  ) => {
    setBusyId(posterId);
    const { error } = await supabase
      .from("favorites")
      .update({
        user_status: status,
        user_status_updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("poster_id", posterId);
    setBusyId(null);
    if (error) {
      toast.error("표시를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    trackProductEvent("apply_status_set", {
      posterId,
      metadata: { screen: "favorites", status, logged_in: true },
    });
    setState((current) =>
      current.phase === "member"
        ? {
            ...current,
            favorites: current.favorites.map((entry) =>
              entry.card.id === posterId ? { ...entry, status } : entry,
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
            busyId={busyId}
            onRemove={(posterId) => void removeMember(state.userId, posterId)}
            onApply={(posterId, status) =>
              void setApplied(state.userId, posterId, status)
            }
          />
        ) : (
          <>
            <h1 className="font-pl-serif text-[23px] font-bold">내 공고</h1>
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
                onRemove={removeGuest}
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
  onRemove,
  onSignIn,
}: {
  state: Extract<State, { phase: "guest" }>;
  onRemove: (posterId: string) => void;
  onSignIn: () => void;
}) {
  return (
    <div className="mt-5 space-y-6">
      <section
        aria-labelledby="guest-keep"
        className="rounded-xl border border-pl-line bg-pl-card p-4"
      >
        <h2 id="guest-keep" className="text-[15px] font-bold">
          이 기기에 찜한 공고 {state.count}개
        </h2>
        <p className="mt-1 text-sm leading-6 text-pl-sub">
          계정에 보관하면 다른 기기에서도 이어서 보고, 마감 알림과 신청 표시도
          쓸 수 있어요.
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

      {state.cards.length > 0 ? (
        <ul className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
          {state.cards.map((card) => (
            <li key={card.id}>
              <PosterListCard
                poster={card}
                source="favorites"
                badge="이 기기에 저장됨"
                footer={
                  <button
                    type="button"
                    onClick={() => onRemove(card.id)}
                    className="inline-flex min-h-[44px] items-center text-sm text-pl-sub underline underline-offset-2"
                  >
                    찜 취소
                  </button>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <GuideCard
          title="아직 찜한 공고가 없어요"
          action={{ href: "/posters", label: "공고 둘러보기" }}
        >
          마음에 드는 공고를 찜해 두면 여기에서 모아 볼 수 있어요.
        </GuideCard>
      )}
    </div>
  );
}

const TAB_ORDER: Tab[] = ["favorites", "applied", "following"];

function MemberView({
  state,
  tab,
  setTab,
  mergedCount,
  onDismissNotice,
  busyId,
  onRemove,
  onApply,
}: {
  state: Extract<State, { phase: "member" }>;
  tab: Tab;
  setTab: (tab: Tab) => void;
  mergedCount: number | null;
  onDismissNotice: () => void;
  busyId: string | null;
  onRemove: (posterId: string) => void;
  onApply: (posterId: string, status: UserStatus) => void;
}) {
  const applied = state.favorites.filter((entry) => entry.status === "applied");
  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "favorites", label: "찜", count: state.favorites.length },
    ...(state.applySupported
      ? [{ key: "applied" as const, label: "신청 표시", count: applied.length }]
      : []),
    { key: "following", label: "구독 기관", count: state.institutions.length },
  ];
  const visible = tabs.some((entry) => entry.key === tab) ? tab : "favorites";

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const keys = TAB_ORDER.filter((key) =>
      tabs.some((entry) => entry.key === key),
    );
    const index = keys.indexOf(visible);
    const next =
      keys[
        (index + (event.key === "ArrowRight" ? 1 : -1) + keys.length) %
          keys.length
      ];
    setTab(next);
    document.getElementById(`my-tab-${next}`)?.focus();
  };

  const card = (entry: Favorite, showRecordNote = false) => {
    const note = noDateNote(getDeadlineDisplay(applyInput(entry.card)));
    return (
      <PosterListCard
        poster={entry.card}
        source="favorites"
        footer={
          <div className="flex flex-col gap-2">
            {note && <p className="text-xs text-pl-sub">{note}</p>}
            {showRecordNote && entry.status === "applied" && (
              <p className="text-xs text-pl-sub">
                내가 직접 표시한 기록이에요. 공고가 끝나도 그대로 남아요.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {state.applySupported ? (
                <ApplyMark
                  marked={entry.status === "applied"}
                  busy={busyId === entry.card.id}
                  onMark={() => onApply(entry.card.id, "applied")}
                  onUnmark={() => onApply(entry.card.id, "interested")}
                />
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={busyId === entry.card.id}
                onClick={() => onRemove(entry.card.id)}
                className="inline-flex min-h-[44px] items-center text-sm text-pl-sub underline underline-offset-2 disabled:opacity-60"
              >
                찜 취소
              </button>
            </div>
          </div>
        }
      />
    );
  };

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <h1 className="order-1 font-pl-serif text-[23px] font-bold xl:text-[28px]">
          내 공고
        </h1>
        {mergedCount !== null && (
          <div
            role="status"
            className="order-2 flex items-center justify-between gap-3 rounded-xl bg-pl-ink px-4 py-3 text-sm text-white md:order-3 md:w-full"
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
        <div
          role="tablist"
          aria-label="내 공고 목록"
          className="order-3 flex gap-1 overflow-x-auto md:order-2"
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
      </div>

      <div
        id="my-panel-favorites"
        role="tabpanel"
        aria-labelledby="my-tab-favorites"
        hidden={visible !== "favorites"}
        className="mt-6 space-y-7"
      >
        {state.favorites.length === 0 ? (
          <GuideCard
            title="아직 찜한 공고가 없어요"
            action={{ href: "/posters", label: "공고 둘러보기" }}
          >
            마음에 드는 공고를 찜해 두면 접수 상태별로 모아 보여드려요.
          </GuideCard>
        ) : (
          groupByReception(state.favorites, (entry) =>
            applyInput(entry.card),
          ).map((group) => (
            <section key={group.key} aria-labelledby={`group-${group.key}`}>
              <SectionHeader
                id={`group-${group.key}`}
                title={`${group.label} ${group.items.length}`}
              />
              <ul className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
                {group.items.map(({ item }) => (
                  <li key={item.card.id}>{card(item)}</li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {state.applySupported && (
        <div
          id="my-panel-applied"
          role="tabpanel"
          aria-labelledby="my-tab-applied"
          hidden={visible !== "applied"}
          className="mt-6"
        >
          {applied.length === 0 ? (
            <GuideCard title="신청 표시한 공고가 없어요">
              신청을 마친 공고에 직접 &lsquo;신청했어요&rsquo;를 표시해 두면
              여기에서 모아 볼 수 있어요.
            </GuideCard>
          ) : (
            <ul className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
              {applied.map((entry) => (
                <li key={entry.card.id}>{card(entry, true)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        id="my-panel-following"
        role="tabpanel"
        aria-labelledby="my-tab-following"
        hidden={visible !== "following"}
        className="mt-6"
      >
        {state.institutions.length === 0 ? (
          <GuideCard
            title="자주 보는 기관을 구독해 보세요"
            action={{ href: "/institutions", label: "기관 둘러보기" }}
          >
            구독한 기관의 새 공고를 모아 볼 수 있어요.
          </GuideCard>
        ) : (
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
        )}
      </div>
    </>
  );
}
