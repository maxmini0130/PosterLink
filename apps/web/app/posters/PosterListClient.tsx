"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { Footer } from "../components/Footer";
import { BottomSheet } from "../components/pl/BottomSheet";
import { GuideCard } from "../components/pl/GuideCard";
import {
  PosterListCard,
  type PlPosterCardData,
} from "../components/pl/PosterListCard";
import { SectionHeader } from "../components/pl/SectionHeader";
import { guestLocal } from "../lib/guestSession";
import {
  fetchCategoryRegionNames,
  fetchPosterImages,
} from "../lib/posterHelpers";
import { fetchPosterMetricCounts } from "../lib/posterMetrics";
import {
  getCityRegions,
  getDistrictRegions,
  getRegionLabel,
  getRegionScopeIds,
  getSelectedCityId,
} from "../lib/regionHelpers";
import {
  buildPosterSearchPath,
  type DiscoveryPoster,
  type DiscoverySort,
  type DiscoveryTaxonomy,
} from "../../lib/discoveryRoutes";
import { readGuestFavorites } from "../../lib/guestStore";
import { isPosterAcceptingApplications } from "../../lib/posterApplication";
import {
  categoryScopeIds,
  interestCategories,
} from "../../lib/categoryTaxonomy";
import { searchCategoryScope } from "../../lib/categoryScopedSearch";
import {
  groupByRegionScope,
  isSavedSearch,
  readSavedSearches,
  removeSavedSearch,
  saveSearch,
  type SavedSearch,
} from "../../lib/searchGroups";
import { trackAnalytics } from "../../lib/analytics";

const PAGE_SIZE = 12;
const WIDER_FIRST = 6;
const PUBLIC_POSTER_SELECT =
  "id,title,source_org_name,organizer_name,verification_status,verified_at,application_start_at,application_end_at,deadline_type,event_end_at,poster_status,thumbnail_url,source_key,summary_short,created_at,exposure_tier";

const SORTS: Array<{ key: DiscoverySort; label: string }> = [
  { key: "latest", label: "최신 등록순" },
  { key: "deadline", label: "마감 임박순" },
  { key: "popular", label: "인기순" },
  { key: "views", label: "조회순" },
  { key: "favorites", label: "찜 많은순" },
];

type PosterListClientProps = {
  initialPosters: DiscoveryPoster[];
  initialTotalCount: number;
  initialCategories: DiscoveryTaxonomy[];
  initialRegions: DiscoveryTaxonomy[];
  initialQuery: string;
  initialCategoryId: string | null;
  initialRegionId: string | null;
  initialSort: DiscoverySort;
  initialIncludeClosed: boolean;
};

// Rows from the search RPC, semantic search and enrichment (loosely typed as before).
type Row = any;

function toCard(poster: Row): PlPosterCardData {
  return {
    id: poster.id,
    title: poster.title,
    org:
      (poster.verification_status === "verified" && poster.verified_at
        ? poster.organizer_name || poster.source_org_name
        : poster.source_org_name) ?? undefined,
    applicationStartAt: poster.application_start_at,
    deadline: poster.application_end_at ?? undefined,
    deadlineType: poster.deadline_type,
    eventEndAt: poster.event_end_at,
    image: poster.thumbnail_url ?? undefined,
    images: poster.images,
    sourceUrl: poster.source_key ?? undefined,
    posterStatus: poster.poster_status,
    tags: [poster.categoryName].filter((tag): tag is string => Boolean(tag)),
  };
}

export function PosterListClient(props: PosterListClientProps) {
  return (
    <Suspense fallback={null}>
      <PosterListPageContent {...props} />
    </Suspense>
  );
}

function PosterListPageContent({
  initialPosters,
  initialTotalCount,
  initialCategories,
  initialRegions,
  initialQuery,
  initialCategoryId,
  initialRegionId,
  initialSort,
  initialIncludeClosed,
}: PosterListClientProps) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [posters, setPosters] = useState<Row[]>(initialPosters);
  const [resultTotalCount, setResultTotalCount] = useState(initialTotalCount);
  const [categories, setCategories] = useState<Row[]>(initialCategories);
  const [regions, setRegions] = useState<Row[]>(initialRegions);

  const [queryInput, setQueryInput] = useState(initialQuery);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    initialCategoryId,
  );
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(
    initialRegionId,
  );
  const [sortBy, setSortBy] = useState<DiscoverySort>(initialSort);
  const [hideClosedPosters, setHideClosedPosters] =
    useState(!initialIncludeClosed);
  const [semanticSearchActive, setSemanticSearchActive] = useState(false);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [widerCount, setWiderCount] = useState(WIDER_FIRST);
  const pendingSearchLogRef = useRef<string | null>(null);
  const lastLoggedSearchRef = useRef<{ key: string; loggedAt: number } | null>(
    null,
  );
  const skipInitialFetchRef = useRef(true);
  const skipInitialUrlSyncRef = useRef(true);
  const initialSearchLoggedRef = useRef(false);

  const previousFilters = useRef(
    JSON.stringify([
      selectedCategoryId,
      selectedRegionId,
      sortBy,
      hideClosedPosters,
    ]),
  );
  useEffect(() => {
    const key = JSON.stringify([
      selectedCategoryId,
      selectedRegionId,
      sortBy,
      hideClosedPosters,
    ]);
    if (previousFilters.current === key) return;
    previousFilters.current = key;
    trackAnalytics("filter_poster", {
      search_category: selectedCategoryId || "all",
      search_region: selectedRegionId || "all",
      sort: sortBy,
      include_closed: !hideClosedPosters,
    });
  }, [selectedCategoryId, selectedRegionId, sortBy, hideClosedPosters]);

  // Taxonomies (when the server had none), recent searches, saved conditions
  // and which posters are already 찜 (account or this browser).
  useEffect(() => {
    const fetchBase = async () => {
      if (initialCategories.length === 0) {
        const { data } = await supabase
          .from("categories")
          .select("*")
          .order("sort_order");
        if (data) setCategories(data);
      }
      if (initialRegions.length === 0) {
        const { data } = await supabase
          .from("regions")
          .select("*")
          .in("level", ["nation", "sido", "sigungu"])
          .order("level", { ascending: false })
          .order("full_name", { ascending: true });
        if (data) setRegions(data);
      }
    };
    void fetchBase();
    try {
      const stored = localStorage.getItem("recent_searches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {
      /* ignore a broken record */
    }
    setSaved(readSavedSearches(guestLocal));
    void (async () => {
      const userId =
        (await supabase.auth.getSession()).data.session?.user.id ?? null;
      if (!userId) {
        setFavoriteIds(
          new Set(readGuestFavorites(guestLocal).map((item) => item.posterId)),
        );
        return;
      }
      const { data } = await supabase
        .from("favorites")
        .select("poster_id")
        .eq("user_id", userId);
      setFavoriteIds(
        new Set((data ?? []).map((row) => row.poster_id as string)),
      );
    })();
  }, [initialCategories.length, initialRegions.length]);

  const fetchPosters = async (queryStr = searchQuery) => {
    setLoading(true);
    setFailed(false);
    try {
      const normalizedQuery = queryStr.trim();
      let data: Row[] = [];
      let semanticSearchUsed = false;
      const selectedRegionScopeIds = getRegionScopeIds(
        selectedRegionId,
        regions,
      );
      const includeClosed = !hideClosedPosters || normalizedQuery.length > 0;
      // A main category also covers the content types folded into it
      // (교육/취업 -> 교육강좌, 채용); each is searched and the results merged.
      const categoryScope = categoryScopeIds(selectedCategoryId, categories);
      const multiCategory = categoryScope.length > 1;
      const categoryScopeSet = new Set(categoryScope);
      const searchArgs = {
        p_query: normalizedQuery || null,
        p_category_id: selectedCategoryId,
        p_region_ids: selectedRegionScopeIds
          ? Array.from(selectedRegionScopeIds)
          : null,
        p_include_closed: includeClosed,
        p_sort: sortBy === "deadline" ? "deadline" : "latest",
        p_limit: 240,
      };
      let scopedTotal: number | null = null;
      const countPromise = multiCategory
        ? Promise.resolve({ data: null, error: null })
        : supabase.rpc("count_public_posters", {
            p_query: searchArgs.p_query,
            p_category_id: searchArgs.p_category_id,
            p_region_ids: searchArgs.p_region_ids,
            p_include_closed: includeClosed,
          });

      if (hideClosedPosters && normalizedQuery.length >= 2) {
        const semanticResponse = await fetch("/api/posters/semantic-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: normalizedQuery,
            limit: 80,
            categoryId: multiCategory ? null : selectedCategoryId,
            regionIds: searchArgs.p_region_ids,
          }),
        }).catch(() => null);

        if (semanticResponse?.ok) {
          const payload = await semanticResponse.json().catch(() => null);
          if (
            payload?.semantic &&
            Array.isArray(payload.posters) &&
            payload.posters.length > 0
          ) {
            data = payload.posters;
            semanticSearchUsed = true;
          }
        }
      }

      if (!semanticSearchUsed || includeClosed) {
        const scoped = await searchCategoryScope<Row>({
          categoryIds: categoryScope,
          sort: searchArgs.p_sort === "deadline" ? "deadline" : "latest",
          limit: searchArgs.p_limit,
          search: (categoryId, limit) =>
            supabase
              .rpc("search_public_posters", {
                ...searchArgs,
                p_category_id: categoryId,
                p_limit: limit,
              })
              .select(PUBLIC_POSTER_SELECT)
              .then(({ data: rows, error }) => ({
                data: (Array.isArray(rows) ? rows : []) as Row[],
                error,
              })),
        });
        if (scoped.error) throw scoped.error;
        const keywordData = scoped.rows;
        if (multiCategory && includeClosed) scopedTotal = scoped.total;
        data = semanticSearchUsed
          ? mergeUniquePosters(data, keywordData)
          : keywordData;
      }
      const { data: totalCountData, error: countError } = await countPromise;
      if (countError) throw countError;
      const serverTotalCount =
        typeof totalCountData === "number" ? totalCountData : scopedTotal;

      const dateFilteredData =
        !includeClosed && hideClosedPosters
          ? data.filter((poster) =>
              isPosterAcceptingApplications({
                applicationStartAt: poster.application_start_at,
                applicationEndAt: poster.application_end_at,
                deadlineType: poster.deadline_type,
                eventEndAt: poster.event_end_at,
              }),
            )
          : data;

      const ids = dateFilteredData.map((poster) => poster.id);
      const [metaMap, metricCounts, imageMap] = await Promise.all([
        fetchCategoryRegionNames(ids),
        fetchPosterMetricCounts(ids),
        fetchPosterImages(ids),
      ]);
      const enriched = dateFilteredData.map((poster) => ({
        ...poster,
        ...metaMap[poster.id],
        images: imageMap[poster.id] ?? [],
        viewCount: metricCounts.viewCounts[poster.id] ?? 0,
        linkClickCount: metricCounts.linkClickCounts[poster.id] ?? 0,
        favoriteCount: metricCounts.favoriteCounts[poster.id] ?? 0,
        semanticScore: poster.semantic_score ?? null,
      }));

      const filtered = enriched.filter(
        (poster) =>
          (!selectedCategoryId ||
            poster.categoryIds?.some((categoryId: string) =>
              categoryScopeSet.has(categoryId),
            )) &&
          (!selectedRegionScopeIds ||
            poster.regionIds?.some((regionId: string) =>
              selectedRegionScopeIds.has(regionId),
            )),
      );

      const sorted = [...filtered].sort((a, b) => {
        if (semanticSearchUsed && normalizedQuery && sortBy === "latest")
          return (b.semanticScore ?? 0) - (a.semanticScore ?? 0);
        if (sortBy === "deadline") {
          const rank = (poster: Row) => {
            const time = poster.application_end_at
              ? new Date(poster.application_end_at).getTime()
              : Number.NaN;
            return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
          };
          return rank(a) - rank(b);
        }
        if (sortBy === "popular") {
          const score = (poster: Row) =>
            (poster.viewCount ?? 0) +
            (poster.linkClickCount ?? 0) * 2 +
            (poster.favoriteCount ?? 0) * 3;
          return score(b) - score(a);
        }
        if (sortBy === "views") return (b.viewCount ?? 0) - (a.viewCount ?? 0);
        if (sortBy === "favorites")
          return (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0);
        return (
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime()
        );
      });

      setPosters(sorted);
      setResultTotalCount(
        semanticSearchUsed
          ? sorted.length
          : (serverTotalCount ?? sorted.length),
      );
      setSemanticSearchActive(semanticSearchUsed);
      setDisplayCount(PAGE_SIZE);
      setWiderCount(WIDER_FIRST);

      if (
        normalizedQuery.length >= 2 &&
        shouldRecordSearchLog(normalizedQuery, lastLoggedSearchRef)
      ) {
        pendingSearchLogRef.current = null;
        void recordSearchLog(normalizedQuery, sorted.length);
      }
    } catch (err) {
      console.error("Error fetching posters:", err);
      setPosters([]);
      setFailed(true);
      setSemanticSearchActive(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    const timer = setTimeout(() => fetchPosters(), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    searchQuery,
    selectedCategoryId,
    selectedRegionId,
    sortBy,
    hideClosedPosters,
  ]);

  useEffect(() => {
    const normalizedInitialQuery = initialQuery.trim();
    if (initialSearchLoggedRef.current || normalizedInitialQuery.length < 2)
      return;
    initialSearchLoggedRef.current = true;
    if (shouldRecordSearchLog(normalizedInitialQuery, lastLoggedSearchRef)) {
      void recordSearchLog(normalizedInitialQuery, resultTotalCount);
    }
  }, [initialQuery, resultTotalCount]);

  useEffect(() => {
    if (skipInitialUrlSyncRef.current) {
      skipInitialUrlSyncRef.current = false;
      return;
    }
    const category =
      categories.find((item) => item.id === selectedCategoryId) ?? null;
    const region = regions.find((item) => item.id === selectedRegionId) ?? null;
    const path = buildPosterSearchPath({
      query: searchQuery,
      category,
      region,
      sort: sortBy,
      includeClosed: !hideClosedPosters,
    });
    window.history.replaceState(null, "", path);
  }, [
    categories,
    hideClosedPosters,
    regions,
    searchQuery,
    selectedCategoryId,
    selectedRegionId,
    sortBy,
  ]);

  const submitSearch = (term = queryInput) => {
    const normalizedTerm = term.trim();
    trackAnalytics("search_poster", {
      search_category: selectedCategoryId || "all",
      search_region: selectedRegionId || "all",
    });
    if (normalizedTerm) {
      const updated = [
        normalizedTerm,
        ...recentSearches.filter((s) => s !== normalizedTerm),
      ].slice(0, 5);
      setRecentSearches(updated);
      try {
        localStorage.setItem("recent_searches", JSON.stringify(updated));
      } catch {
        /* storage blocked */
      }
    }
    pendingSearchLogRef.current = normalizedTerm || null;
    setQueryInput(normalizedTerm);
    if (normalizedTerm === searchQuery.trim())
      void fetchPosters(normalizedTerm);
    setSearchQuery(normalizedTerm);
  };

  const removeRecentSearch = (term: string) => {
    const updated = recentSearches.filter((s) => s !== term);
    setRecentSearches(updated);
    try {
      localStorage.setItem("recent_searches", JSON.stringify(updated));
    } catch {
      /* storage blocked */
    }
  };

  const regionById = (id: string | null) =>
    regions.find((region) => region.id === id) ?? null;
  const categoryById = (id: string | null) =>
    categories.find((category) => category.id === id) ?? null;
  const conditionLabel = (condition: {
    regionId: string | null;
    categoryId: string | null;
  }) =>
    [
      getRegionLabel(regionById(condition.regionId)) || null,
      categoryById(condition.categoryId)?.name ?? null,
    ]
      .filter(Boolean)
      .join(" · ");

  const current = {
    regionId: selectedRegionId,
    categoryId: selectedCategoryId,
  };
  const currentSaved = isSavedSearch(saved, current);
  const canSave = Boolean(selectedRegionId || selectedCategoryId);

  const saveCurrent = () => {
    if (!saveSearch(guestLocal, current, Date.now())) return;
    // Not interest_save: that event counts 관심 조건 for active sign-ups, and
    // this is only a browser-side search shortcut.
    setSaved(readSavedSearches(guestLocal));
  };

  const applySaved = (condition: SavedSearch) => {
    setSelectedRegionId(condition.regionId);
    setSelectedCategoryId(condition.categoryId);
  };

  const selectedRegion = regionById(selectedRegionId);
  const selectedCategory = categoryById(selectedCategoryId);
  // Seven main categories and 기타 as filters (screen plan v1.0, 05); content
  // types are searched through them, never listed beside them.
  const filterCategories = useMemo(
    () => interestCategories(categories),
    [categories],
  );
  const groups = useMemo(
    () =>
      groupByRegionScope(
        posters,
        (poster: Row) => poster.regionIds,
        selectedRegionId,
        regions,
      ),
    [posters, selectedRegionId, regions],
  );
  const matchedCount = groups.wider.length
    ? groups.matched.length
    : resultTotalCount;
  const statusLabel = hideClosedPosters && !searchQuery ? "접수 중" : "전체";
  const matchedCondition = [
    selectedRegion ? `${getRegionLabel(selectedRegion)} 대상` : null,
    selectedCategory?.name ?? null,
    searchQuery ? `"${searchQuery}"` : null,
    statusLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  const widerCondition = [
    selectedCategory?.name ?? null,
    "연령·거주 등 참여 조건은 상세에서 확인하세요",
  ]
    .filter(Boolean)
    .join(" · ");

  const cityRegions = getCityRegions(regions);
  const selectedCityId = getSelectedCityId(selectedRegionId, regions);
  const districtRegions = getDistrictRegions(regions, selectedCityId || null);

  const filters = (
    <SearchFilters
      idPrefix="filter"
      cityRegions={cityRegions}
      districtRegions={districtRegions}
      categories={filterCategories}
      selectedRegionId={selectedRegionId}
      selectedCityId={selectedCityId || null}
      selectedCategoryId={selectedCategoryId}
      hideClosed={hideClosedPosters}
      onRegion={setSelectedRegionId}
      onCategory={setSelectedCategoryId}
      onHideClosed={setHideClosedPosters}
    />
  );

  const sortSelect = (
    <label className="inline-flex min-h-[44px] items-center gap-2 text-[13px] text-pl-sub">
      <span className="sr-only xl:not-sr-only">정렬</span>
      <span className="relative inline-flex items-center">
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as DiscoverySort)}
          className="min-h-[40px] appearance-none rounded-lg border border-pl-line bg-pl-card py-1 pl-3 pr-8 text-[13px] font-medium text-pl-ink"
        >
          {SORTS.map((sort) => (
            <option key={sort.key} value={sort.key}>
              {sort.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5"
        />
      </span>
    </label>
  );

  return (
    <div className="min-h-screen bg-pl-paper pb-[calc(var(--mobile-nav-height)+32px)] font-pl-sans text-pl-ink md:pb-12">
      <div className="hidden md:block">
        <Header />
      </div>
      <main className="mx-auto w-full max-w-[1200px] px-5 py-5 xl:px-10 xl:py-8">
        <h1 className="font-pl-serif text-[23px] font-bold xl:sr-only">찾기</h1>

        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
          className="mt-3 flex gap-2 xl:mt-0"
        >
          <label htmlFor="poster-search" className="sr-only">
            공고, 기관 검색
          </label>
          <div className="relative min-w-[240px] flex-1">
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pl-meta"
            />
            <input
              id="poster-search"
              data-testid="poster-search-input"
              type="search"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="공고, 기관 검색"
              className="min-h-[48px] w-full rounded-lg border border-pl-line bg-pl-card pl-10 pr-3 text-[15px] text-pl-ink placeholder:text-pl-meta xl:min-h-[52px]"
            />
          </div>
          <button
            type="submit"
            className="min-h-[48px] shrink-0 rounded-lg bg-pl-ink px-4 text-sm font-bold text-white xl:min-h-[52px] xl:px-6"
          >
            검색
          </button>
        </form>

        {!searchQuery && recentSearches.length > 0 && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto">
            <span className="shrink-0 text-xs text-pl-meta">최근 검색</span>
            <ul className="flex gap-1.5">
              {recentSearches.map((term) => (
                <li
                  key={term}
                  className="flex shrink-0 items-center rounded-full border border-pl-line bg-pl-card"
                >
                  <button
                    type="button"
                    onClick={() => submitSearch(term)}
                    className="min-h-[36px] pl-3 pr-1 text-[13px]"
                  >
                    {term}
                  </button>
                  <button
                    type="button"
                    aria-label={`최근 검색어 ${term} 지우기`}
                    onClick={() => removeRecentSearch(term)}
                    className="flex h-9 w-8 items-center justify-center text-pl-meta"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <section aria-labelledby="saved-searches" className="mt-4">
          <h2 id="saved-searches" className="mb-1.5 text-xs text-pl-meta">
            저장한 조건
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {saved.map((condition) => {
              const label = conditionLabel(condition);
              if (!label) return null;
              const active =
                condition.regionId === selectedRegionId &&
                condition.categoryId === selectedCategoryId;
              return (
                <span
                  key={`${condition.regionId}:${condition.categoryId}`}
                  className={`inline-flex items-center rounded-full border ${
                    active
                      ? "border-pl-ink bg-pl-ink text-white"
                      : "border-pl-line bg-pl-card text-pl-ink"
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => applySaved(condition)}
                    className="min-h-[36px] pl-3 pr-1 text-[13px] font-medium"
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    aria-label={`저장한 조건 ${label} 삭제`}
                    onClick={() => {
                      removeSavedSearch(guestLocal, condition);
                      setSaved(readSavedSearches(guestLocal));
                    }}
                    className="flex h-9 w-8 items-center justify-center opacity-70"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={saveCurrent}
              disabled={!canSave || currentSaved}
              className="min-h-[36px] rounded-full border border-dashed border-pl-ink px-3 text-[13px] font-medium disabled:border-pl-line disabled:text-pl-meta xl:hidden"
            >
              {currentSaved ? "저장된 조건" : "지금 조건 저장"}
            </button>
          </div>
          <p className="mt-1 text-xs text-pl-meta">
            저장한 조건은 이 기기의 브라우저에 보관돼요.
          </p>
        </section>

        <div className="mt-4 flex flex-wrap gap-1.5 xl:hidden">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-pl-line bg-pl-card px-3 text-[13px]"
          >
            지역: {getRegionLabel(selectedRegion) || "전체"}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-pl-line bg-pl-card px-3 text-[13px]"
          >
            분야: {selectedCategory?.name ?? "전체"}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={hideClosedPosters}
            onClick={() => setHideClosedPosters((value) => !value)}
            className={`min-h-[40px] rounded-lg border px-3 text-[13px] ${
              hideClosedPosters
                ? "border-pl-ink bg-pl-ink font-bold text-white"
                : "border-pl-line bg-pl-card"
            }`}
          >
            접수 중만
          </button>
          {sortSelect}
        </div>

        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-6">
          <aside
            aria-label="검색 조건"
            className="hidden w-[250px] flex-none self-start rounded-xl border border-pl-line bg-pl-card p-4 xl:block"
          >
            {filters}
            <button
              type="button"
              onClick={saveCurrent}
              disabled={!canSave || currentSaved}
              className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-pl-ink text-sm font-bold disabled:border-pl-line disabled:text-pl-meta"
            >
              {currentSaved ? "저장된 조건" : "지금 조건 저장"}
            </button>
          </aside>

          <div
            className="min-w-0 flex-[1_1_480px] space-y-8"
            aria-busy={loading}
          >
            {loading && (
              <p className="text-sm text-pl-sub" role="status">
                불러오는 중이에요…
              </p>
            )}
            {!loading && failed && (
              <GuideCard title="공고를 불러오지 못했어요">
                잠시 후 다시 검색해 주세요.
              </GuideCard>
            )}
            {!loading &&
              !failed &&
              groups.matched.length === 0 &&
              groups.wider.length === 0 && (
                <GuideCard title="조건에 맞는 공고가 없어요">
                  다른 검색어나 조건으로 찾아보세요.
                </GuideCard>
              )}

            {!loading && groups.matched.length > 0 && (
              <section aria-labelledby="group-matched">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <SectionHeader
                    id="group-matched"
                    title={
                      <>
                        선택한 조건에 맞는 공고{" "}
                        <span className="text-pl-accent">
                          {matchedCount.toLocaleString()}
                        </span>
                      </>
                    }
                    condition={
                      matchedCondition +
                      (semanticSearchActive ? " · 뜻이 비슷한 순" : "")
                    }
                  />
                  <div className="mb-3 hidden xl:block">{sortSelect}</div>
                </div>
                <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-1">
                  {groups.matched.slice(0, displayCount).map((poster) => (
                    <li key={poster.id}>
                      <PosterListCard
                        poster={toCard(poster)}
                        source="search"
                        badge={favoriteIds.has(poster.id) ? "찜" : undefined}
                      />
                    </li>
                  ))}
                </ul>
                {displayCount < groups.matched.length && (
                  <button
                    type="button"
                    onClick={() =>
                      setDisplayCount((count) => count + PAGE_SIZE)
                    }
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-pl-line bg-pl-card text-sm font-medium"
                  >
                    더 보기 ({groups.matched.length - displayCount}건)
                  </button>
                )}
              </section>
            )}

            {!loading && groups.wider.length > 0 && (
              <section aria-labelledby="group-wider">
                <SectionHeader
                  id="group-wider"
                  title="서울·전국 대상 공고"
                  condition={widerCondition}
                />
                <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-1">
                  {groups.wider.slice(0, widerCount).map(({ item, scope }) => (
                    <li key={item.id}>
                      <PosterListCard
                        poster={toCard(item)}
                        source="search"
                        region={scope.nation ? "nation" : "seoul"}
                        regionLabel={scope.label}
                        badge={favoriteIds.has(item.id) ? "찜" : undefined}
                      />
                    </li>
                  ))}
                </ul>
                {widerCount < groups.wider.length && (
                  <button
                    type="button"
                    onClick={() => setWiderCount((count) => count + PAGE_SIZE)}
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-pl-line bg-pl-card text-sm font-medium"
                  >
                    더 보기 ({groups.wider.length - widerCount}건)
                  </button>
                )}
              </section>
            )}
          </div>
        </div>
      </main>

      <BottomSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="검색 조건"
        dismissLabel="닫기"
        primary={
          <button
            type="button"
            onClick={() => setFilterOpen(false)}
            className="min-h-[48px] w-full rounded-lg bg-pl-ink font-bold text-white"
          >
            {resultTotalCount.toLocaleString()}건 보기
          </button>
        }
      >
        <SearchFilters
          idPrefix="sheet"
          cityRegions={cityRegions}
          districtRegions={districtRegions}
          categories={filterCategories}
          selectedRegionId={selectedRegionId}
          selectedCityId={selectedCityId || null}
          selectedCategoryId={selectedCategoryId}
          hideClosed={hideClosedPosters}
          onRegion={setSelectedRegionId}
          onCategory={setSelectedCategoryId}
          onHideClosed={setHideClosedPosters}
        />
      </BottomSheet>

      <Footer />
      <BottomNav />
    </div>
  );
}

/** Region, category and status as real fieldsets (PC sidebar and mobile sheet). */
function SearchFilters({
  idPrefix,
  cityRegions,
  districtRegions,
  categories,
  selectedRegionId,
  selectedCityId,
  selectedCategoryId,
  hideClosed,
  onRegion,
  onCategory,
  onHideClosed,
}: {
  idPrefix: string;
  cityRegions: Row[];
  districtRegions: Row[];
  categories: Row[];
  selectedRegionId: string | null;
  selectedCityId: string | null;
  selectedCategoryId: string | null;
  hideClosed: boolean;
  onRegion: (id: string | null) => void;
  onCategory: (id: string | null) => void;
  onHideClosed: (value: boolean) => void;
}) {
  // Short by default: the chosen district and its city (mockup PcSearch).
  const [showAllRegions, setShowAllRegions] = useState(false);
  const selectedRegion =
    [...cityRegions, ...districtRegions].find(
      (region) => region.id === selectedRegionId,
    ) ?? null;
  const city = cityRegions.find((region) => region.id === selectedCityId);
  const shortList = [
    selectedRegion?.level === "sigungu" ? selectedRegion : null,
    city ?? null,
  ].filter(Boolean);
  const regionOptionLabel = (region: Row) =>
    region.level === "sido"
      ? `${getRegionLabel(region)} 전체`
      : getRegionLabel(region);
  const radio = (
    name: string,
    id: string,
    checked: boolean,
    onChange: () => void,
    label: string,
  ) => (
    <label
      key={id}
      htmlFor={id}
      className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm"
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-pl-ink"
      />
      {label}
    </label>
  );
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-1 text-sm font-bold">지역</legend>
        {radio(
          `${idPrefix}-region`,
          `${idPrefix}-region-all`,
          !selectedRegionId,
          () => onRegion(null),
          "전체 지역",
        )}
        {!showAllRegions &&
          shortList.map((region) =>
            radio(
              `${idPrefix}-region`,
              `${idPrefix}-region-${region.id}`,
              selectedRegionId === region.id,
              () => onRegion(region.id),
              regionOptionLabel(region),
            ),
          )}
        <button
          type="button"
          aria-expanded={showAllRegions}
          aria-controls={`${idPrefix}-region-list`}
          onClick={() => setShowAllRegions((value) => !value)}
          className="mt-1 inline-flex min-h-[40px] items-center text-sm font-medium underline underline-offset-2"
        >
          {showAllRegions ? "지역 목록 접기" : "다른 지역 선택"}
        </button>
        {showAllRegions && (
          <div id={`${idPrefix}-region-list`}>
            {cityRegions.map((region) =>
              radio(
                `${idPrefix}-region`,
                `${idPrefix}-region-${region.id}`,
                selectedRegionId === region.id,
                () => onRegion(region.id),
                regionOptionLabel(region),
              ),
            )}
            {districtRegions.length > 0 && (
              <fieldset className="mt-1 border-l border-pl-line pl-3">
                <legend className="sr-only">
                  {getRegionLabel(
                    cityRegions.find((r) => r.id === selectedCityId),
                  )}{" "}
                  구·군
                </legend>
                {districtRegions.map((region) =>
                  radio(
                    `${idPrefix}-region`,
                    `${idPrefix}-region-${region.id}`,
                    selectedRegionId === region.id,
                    () => onRegion(region.id),
                    region.name,
                  ),
                )}
              </fieldset>
            )}
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-bold">분야</legend>
        {radio(
          `${idPrefix}-category`,
          `${idPrefix}-category-all`,
          !selectedCategoryId,
          () => onCategory(null),
          "전체 분야",
        )}
        {categories.map((category) =>
          radio(
            `${idPrefix}-category`,
            `${idPrefix}-category-${category.id}`,
            selectedCategoryId === category.id,
            () => onCategory(category.id),
            category.name,
          ),
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-bold">접수 상태</legend>
        <label
          htmlFor={`${idPrefix}-open-only`}
          className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm"
        >
          <input
            id={`${idPrefix}-open-only`}
            type="checkbox"
            checked={hideClosed}
            onChange={(event) => onHideClosed(event.target.checked)}
            className="h-4 w-4 accent-pl-ink"
          />
          접수 중만 보기
        </label>
      </fieldset>
    </div>
  );
}

function shouldRecordSearchLog(
  query: string,
  ref: MutableRefObject<{ key: string; loggedAt: number } | null>,
) {
  const key = query.trim().replace(/\s+/g, " ").toLowerCase();
  const now = Date.now();
  const previous = ref.current;
  if (previous?.key === key && now - previous.loggedAt < 60_000) return false;
  ref.current = { key, loggedAt: now };
  return true;
}

function mergeUniquePosters(primary: Row[], secondary: Row[]) {
  const seen = new Set(primary.map((poster) => poster.id).filter(Boolean));
  return [
    ...primary,
    ...secondary.filter((poster) => {
      if (!poster.id || seen.has(poster.id)) return false;
      seen.add(poster.id);
      return true;
    }),
  ];
}

async function recordSearchLog(query: string, resultCount: number) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  await fetch("/api/search-logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: JSON.stringify({ query, result_count: resultCount }),
  }).catch(() => null);
}
