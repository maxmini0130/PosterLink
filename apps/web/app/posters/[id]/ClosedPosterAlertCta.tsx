"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ChevronDown, X } from "lucide-react";
import toast from "react-hot-toast";
import { trackAlertEvent } from "../../../lib/alertAnalytics";
import { supabase } from "../../lib/supabase";

const CTA_VARIANT = "closed_poster_v1";

type Option = {
  id: string;
  name: string;
  full_name?: string | null;
  level?: string | null;
};

export type AlertDefaults = {
  regionId: string | null;
  regionName: string;
  categoryId: string | null;
  categoryName: string;
};

type ModalStep = "auth" | "confirm" | "done" | null;

function safeReturnPath(posterId: string) {
  return `/posters/${posterId}?alert=confirm`;
}

export function ClosedPosterAlertCta({
  posterId,
  posterStatus,
  defaults,
}: {
  posterId: string;
  posterStatus: string;
  defaults: AlertDefaults;
}) {
  const ctaRef = useRef<HTMLDivElement>(null);
  const viewedRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<ModalStep>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [regions, setRegions] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [regionId, setRegionId] = useState(defaults.regionId ?? "");
  const [regionName, setRegionName] = useState(defaults.regionName);
  const [categoryId, setCategoryId] = useState(defaults.categoryId ?? "");
  const [categoryName, setCategoryName] = useState(defaults.categoryName);

  const baseProperties = useMemo(
    () => ({
      poster_id: posterId,
      poster_status: posterStatus,
      region: defaults.regionName,
      category: defaults.categoryName,
      cta_variant: CTA_VARIANT,
    }),
    [defaults.categoryName, defaults.regionName, posterId, posterStatus],
  );

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    const element = ctaRef.current;
    if (!element || viewedRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || viewedRef.current) return;
        viewedRef.current = true;
        trackAlertEvent("alert_cta_view", baseProperties);
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [baseProperties]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const alertReturn = params.get("alert") === "confirm";
    if (!alertReturn) return;

    if (alertReturn) {
      void supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        trackAlertEvent("login_complete", baseProperties);
        setStep("confirm");
        params.delete("alert");
        const query = params.toString();
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}`,
        );
      });
    }
  }, [baseProperties]);

  const openFlow = async () => {
    trackAlertEvent("alert_cta_click", baseProperties);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      setStep("confirm");
      return;
    }
    trackAlertEvent("auth_modal_view", baseProperties);
    setStep("auth");
  };

  const loginWithKakao = async () => {
    const next = safeReturnPath(posterId);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: "profile_nickname profile_image",
      },
    });
    if (error) toast.error(error.message);
  };

  const loadOptions = async () => {
    setEditing(true);
    if (regions.length || categories.length) return;
    setLoadingOptions(true);
    const [regionResult, categoryResult] = await Promise.all([
      supabase
        .from("regions")
        .select("id,name,full_name,level")
        .in("level", ["nation", "sido", "sigungu"])
        .order("full_name"),
      supabase.from("categories").select("id,name").order("sort_order"),
    ]);
    setRegions((regionResult.data ?? []) as Option[]);
    setCategories((categoryResult.data ?? []) as Option[]);
    setLoadingOptions(false);
  };

  const saveAlert = async () => {
    if (!regionId && !categoryId) {
      toast.error("지역 또는 분야를 하나 이상 선택해 주세요.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("save_alert_subscription", {
      p_region_id: regionId || null,
      p_category_id: categoryId || null,
      p_source_poster_id: posterId,
      p_cta_variant: CTA_VARIANT,
    });
    setSaving(false);
    if (error) {
      toast.error(
        "알림 조건을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    trackAlertEvent("alert_saved", {
      ...baseProperties,
      region: regionName,
      category: categoryName,
    });
    setStep("done");
    toast.success("다음 공고 알림을 신청했습니다.");
  };

  const close = () => {
    setStep(null);
    setEditing(false);
  };

  return (
    <>
      <div
        ref={ctaRef}
        data-testid="closed-poster-alert-cta"
        className="mt-5 rounded-3xl border border-blue-100 bg-blue-50 p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
            <Bell size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-black text-gray-950">이 공고는 마감됐어요</p>
            <p className="mt-1 break-keep text-sm font-semibold leading-6 text-gray-600">
              {defaults.regionName}의 비슷한 {defaults.categoryName} 공고가
              열리면 알려드릴게요
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openFlow}
          disabled={!hydrated}
          className="mt-4 h-12 w-full rounded-2xl bg-blue-600 text-sm font-black text-white shadow-md shadow-blue-100 transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
        >
          다음 공고 알림 받기
        </button>
      </div>

      {step && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={step === "auth" ? "알림 로그인" : "알림 조건 확인"}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-black text-gray-950">
                  {step === "auth"
                    ? "로그인하고 원하는 공고만 받아보세요"
                    : step === "done"
                      ? "알림 신청이 완료됐어요"
                      : "받을 알림"}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="닫기"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                <X size={18} />
              </button>
            </div>

            {step === "auth" && (
              <>
                <ul className="mt-5 space-y-2 text-sm font-semibold leading-6 text-gray-600">
                  <li>· 비슷한 공고가 등록되었을 때</li>
                  <li>· 관심 기관에서 새 공고가 올라왔을 때</li>
                  <li>· 찜한 공고의 마감이 가까워졌을 때</li>
                  <li>· 접수기간이나 내용이 변경되었을 때</li>
                </ul>
                <button
                  type="button"
                  onClick={loginWithKakao}
                  className="mt-6 w-full rounded-2xl bg-[#FEE500] px-4 py-4 text-sm font-black text-[#191919]"
                >
                  카카오로 로그인하고 계속
                </button>
              </>
            )}

            {step === "confirm" && (
              <>
                {editing ? (
                  <div className="mt-5 space-y-4">
                    <label className="block text-sm font-bold text-gray-700">
                      지역
                      <span className="relative mt-2 block">
                        <select
                          value={regionId}
                          disabled={loadingOptions}
                          onChange={(event) => {
                            const option =
                              event.currentTarget.selectedOptions[0];
                            setRegionId(event.target.value);
                            setRegionName(option?.text || "지역 전체");
                          }}
                          className="h-12 w-full appearance-none rounded-2xl border border-gray-200 bg-white px-4 pr-10 font-semibold outline-none focus:border-blue-400"
                        >
                          <option value="">지역 전체</option>
                          {regions.map((region) => (
                            <option key={region.id} value={region.id}>
                              {region.level === "sigungu"
                                ? region.full_name || region.name
                                : region.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute right-4 top-3.5 text-gray-400"
                          size={18}
                        />
                      </span>
                    </label>
                    <label className="block text-sm font-bold text-gray-700">
                      분야
                      <span className="relative mt-2 block">
                        <select
                          value={categoryId}
                          disabled={loadingOptions}
                          onChange={(event) => {
                            const option =
                              event.currentTarget.selectedOptions[0];
                            setCategoryId(event.target.value);
                            setCategoryName(option?.text || "분야 전체");
                          }}
                          className="h-12 w-full appearance-none rounded-2xl border border-gray-200 bg-white px-4 pr-10 font-semibold outline-none focus:border-blue-400"
                        >
                          <option value="">분야 전체</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute right-4 top-3.5 text-gray-400"
                          size={18}
                        />
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl bg-gray-50 p-5">
                    <p className="font-black text-gray-950">
                      {regionName} · {categoryName}
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-gray-500">
                      비슷한 새 공고와 마감 임박 정보를 알려드려요.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={saveAlert}
                  disabled={
                    saving || loadingOptions || (!regionId && !categoryId)
                  }
                  className="mt-5 h-12 w-full rounded-2xl bg-blue-600 text-sm font-black text-white disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "이 조건으로 알림 받기"}
                </button>
                <button
                  type="button"
                  onClick={editing ? () => setEditing(false) : loadOptions}
                  className="mt-2 h-11 w-full rounded-2xl text-sm font-black text-gray-500"
                >
                  {editing ? "조건 확인으로 돌아가기" : "조건 수정"}
                </button>
              </>
            )}

            {step === "done" && (
              <div className="mt-6 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Check size={28} />
                </span>
                <p className="mt-4 font-black text-gray-950">
                  {regionName} · {categoryName}
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-500">
                  조건에 맞는 새 공고가 등록되면 알려드릴게요.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-6 h-12 w-full rounded-2xl bg-gray-950 text-sm font-black text-white"
                >
                  확인
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
