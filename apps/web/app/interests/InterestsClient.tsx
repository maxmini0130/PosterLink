"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, X } from "lucide-react";
import toast from "react-hot-toast";
import { GuideCard } from "../components/pl/GuideCard";
import {
  markInterestOffered,
  readGuestInterest,
  saveGuestInterest,
} from "../../lib/guestInterest";
import { safeReturnTo } from "../../lib/guestStore";
import { trackProductEvent } from "../../lib/productEvents";
import {
  getCityRegions,
  getDistrictRegions,
  getRegionLabel,
  getSelectedCityId,
} from "../../lib/regionHelpers";
import { guestLocal } from "../lib/guestSession";
import { supabase } from "../lib/supabase";
import { interestCategories } from "../../lib/categoryTaxonomy";

type Region = {
  id: string;
  name: string;
  full_name: string | null;
  level: string;
  parent_id: string | null;
};
type Category = { id: string; name: string };

type State =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; regions: Region[]; categories: Category[] };

/** Chip label as in the design: "서울 마포구". */
const chipLabel = (region: Region, regions: Region[]) => {
  if (region.level !== "sigungu") return getRegionLabel(region);
  const city = regions.find((item) => item.id === region.parent_id);
  return city ? `${city.name} ${region.name}` : getRegionLabel(region);
};

/** Short name for the button: "마포구 공고 보기". */
const regionShort = (region: Region) =>
  region.level === "sigungu" ? region.name : getRegionLabel(region);

export function InterestsClient() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [regionId, setRegionId] = useState<string | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [cityId, setCityId] = useState("");

  const next = () =>
    safeReturnTo(new URLSearchParams(window.location.search).get("next")) ??
    "/";

  useEffect(() => {
    let active = true;
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      // Members keep their conditions in the account.
      if (session) {
        router.replace("/mypage/edit");
        return;
      }
      markInterestOffered(guestLocal, Date.now());
      const [regions, categories] = await Promise.all([
        supabase
          .from("regions")
          .select("id, name, full_name, level, parent_id")
          .in("level", ["nation", "sido", "sigungu"])
          .order("level", { ascending: false })
          .order("full_name", { ascending: true }),
        supabase
          .from("categories")
          .select("id, name, code")
          .order("sort_order"),
      ]);
      if (!active) return;
      if (regions.error || categories.error) {
        setState({ phase: "error" });
        return;
      }
      const stored = readGuestInterest(guestLocal);
      const regionList = (regions.data ?? []) as Region[];
      if (stored) {
        setRegionId(
          regionList.some((region) => region.id === stored.regionId)
            ? stored.regionId
            : null,
        );
        setCategoryIds(stored.categoryIds);
      }
      setState({
        phase: "ready",
        regions: regionList,
        categories: interestCategories((categories.data ?? []) as Category[]),
      });
    })().catch(() => {
      if (active) setState({ phase: "error" });
    });
    return () => {
      active = false;
    };
  }, [router]);

  const regions = useMemo(
    () => (state.phase === "ready" ? state.regions : []),
    [state],
  );
  const region = regions.find((item) => item.id === regionId) ?? null;
  const cities = useMemo(() => getCityRegions(regions), [regions]);
  const districts = useMemo(
    () => getDistrictRegions(regions, cityId || null),
    [regions, cityId],
  );

  const openPicker = () => {
    setCityId(
      getSelectedCityId(regionId, regions) ||
        cities.find((city) => city.name === "서울")?.id ||
        cities[0]?.id ||
        "",
    );
    setPicking(true);
  };

  const toggleCategory = (id: string) =>
    setCategoryIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );

  const skip = () => router.push(next());

  const finish = () => {
    if (!saveGuestInterest(guestLocal, { regionId, categoryIds }, Date.now())) {
      toast.error(
        "이 브라우저에 저장하지 못했어요. 저장 공간 설정을 확인해 주세요.",
      );
      return;
    }
    trackProductEvent("interest_save", {
      metadata: {
        screen: "interests",
        logged_in: false,
        region_id: regionId,
        category_count: categoryIds.length,
      },
    });
    router.push(next());
  };

  return (
    <div className="min-h-screen bg-pl-paper font-pl-sans text-pl-ink">
      <header className="mx-auto flex w-full max-w-[560px] items-center justify-between px-5 pt-4">
        <p className="font-pl-serif text-xl font-bold">PosterLink</p>
        <button
          type="button"
          onClick={skip}
          className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-pl-sub underline-offset-2 hover:underline"
        >
          건너뛰기
        </button>
      </header>

      <main className="mx-auto w-full max-w-[560px] px-5 pb-36 pt-6">
        <h1 className="break-keep text-2xl font-bold leading-snug">
          어느 동네의 어떤 공고를 찾고 계세요?
        </h1>
        <p className="mt-2 break-keep text-sm leading-relaxed text-pl-sub">
          고른 조건으로 홈을 채워 드려요. 가입 없이 이 기기에 저장돼요.
        </p>

        {state.phase === "loading" && (
          <p className="mt-8 text-sm text-pl-sub" role="status">
            불러오는 중이에요…
          </p>
        )}
        {state.phase === "error" && (
          <div className="mt-8">
            <GuideCard
              title="목록을 불러오지 못했어요"
              action={{ href: "/", label: "홈으로 가기" }}
            >
              잠시 후 다시 열어 주세요.
            </GuideCard>
          </div>
        )}

        {state.phase === "ready" && (
          <>
            <section aria-labelledby="interest-region" className="mt-8">
              <h2 id="interest-region" className="text-base font-bold">
                관심 지역
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {region && (
                  <span className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-pl-ink bg-pl-ink pl-3 pr-1 text-sm font-medium text-white">
                    <MapPin size={15} aria-hidden="true" />
                    {chipLabel(region, regions)}
                    <button
                      type="button"
                      onClick={() => setRegionId(null)}
                      aria-label={`${chipLabel(region, regions)} 빼기`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={openPicker}
                  aria-expanded={picking}
                  aria-controls="interest-region-picker"
                  className="inline-flex min-h-[44px] items-center rounded-full border border-dashed border-pl-line bg-pl-card px-4 text-sm font-medium"
                >
                  {region ? "지역 바꾸기" : "지역 고르기"}
                </button>
              </div>
              <p className="mt-2 text-xs text-pl-meta">
                관심 지역은 언제든 바꿀 수 있어요.
              </p>

              {picking && (
                <div
                  id="interest-region-picker"
                  className="mt-3 rounded-xl border border-pl-line bg-pl-card p-4"
                >
                  <label
                    htmlFor="interest-city"
                    className="text-sm font-medium"
                  >
                    시·도
                  </label>
                  <select
                    id="interest-city"
                    value={cityId}
                    onChange={(event) => setCityId(event.target.value)}
                    className="mt-1 block min-h-[44px] w-full rounded-lg border border-pl-line bg-white px-3 text-sm"
                  >
                    {cities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                  <fieldset className="mt-4">
                    <legend className="text-sm font-medium">시·군·구</legend>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {districts.map((district) => (
                        <button
                          key={district.id}
                          type="button"
                          aria-pressed={district.id === regionId}
                          onClick={() => {
                            setRegionId(district.id);
                            setPicking(false);
                          }}
                          className="min-h-[44px] rounded-lg border border-pl-line px-2 text-sm aria-pressed:border-pl-ink aria-pressed:bg-pl-ink aria-pressed:text-white"
                        >
                          {district.name}
                        </button>
                      ))}
                    </div>
                    {districts.length === 0 && cityId && (
                      <button
                        type="button"
                        onClick={() => {
                          setRegionId(cityId);
                          setPicking(false);
                        }}
                        className="mt-2 min-h-[44px] w-full rounded-lg border border-pl-line px-3 text-sm"
                      >
                        {cities.find((city) => city.id === cityId)?.name} 전체
                      </button>
                    )}
                  </fieldset>
                </div>
              )}
            </section>

            <section aria-labelledby="interest-category" className="mt-8">
              <h2 id="interest-category" className="text-base font-bold">
                관심 분야{" "}
                <span className="text-sm font-normal text-pl-meta">
                  여러 개 고를 수 있어요
                </span>
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {state.categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={categoryIds.includes(category.id)}
                    onClick={() => toggleCategory(category.id)}
                    className="min-h-[48px] rounded-lg border border-pl-line bg-pl-card px-3 text-sm font-medium text-pl-sub aria-pressed:border-2 aria-pressed:border-pl-ink aria-pressed:font-bold aria-pressed:text-pl-ink"
                  >
                    {category.name}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={categoryIds.length === 0}
                  onClick={() => setCategoryIds([])}
                  className="min-h-[48px] rounded-lg border border-pl-line bg-pl-card px-3 text-sm font-medium text-pl-sub aria-pressed:border-2 aria-pressed:border-pl-ink aria-pressed:font-bold aria-pressed:text-pl-ink"
                >
                  전체 분야
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {state.phase === "ready" && (
        <div className="fixed inset-x-0 bottom-0 border-t border-pl-line bg-pl-paper/95 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          <button
            type="button"
            onClick={finish}
            className="mx-auto flex min-h-[52px] w-full max-w-[520px] items-center justify-center rounded-xl bg-pl-ink text-base font-bold text-white"
          >
            {region ? `${regionShort(region)} 공고 보기` : "공고 보기"}
          </button>
        </div>
      )}
    </div>
  );
}
