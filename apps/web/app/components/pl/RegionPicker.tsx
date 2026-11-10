"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  browseRegionLabel,
  shortSidoName,
  type BrowseRegion,
} from "../../../lib/browseRegion";

/**
 * Home region title and picker (docs/design/v6.1/SPEC.md 7.1 "서울 전체 ⌄").
 * The region is the one being browsed, not where the person lives (SPEC 8).
 * Phones get a bottom sheet, PC a dropdown under the title. 시·도 first, then
 * its 구·군 with "OO 전체" on top; a 시·도 without 구·군 rows applies at once.
 */

type Region = {
  id: string;
  name: string;
  level: "nation" | "sido" | "sigungu";
  parent_id: string | null;
  code: string | null;
};

const SIDO_ORDER = [
  "REG_SEOUL",
  "REG_GYEONGGI",
  "REG_INCHEON",
  "REG_BUSAN",
  "REG_DAEGU",
  "REG_GWANGJU",
  "REG_DAEJEON",
  "REG_ULSAN",
  "REG_SEJONG",
];

let cachedRegions: Region[] | null = null;

async function loadRegions(): Promise<Region[]> {
  if (cachedRegions) return cachedRegions;
  const { data, error } = await supabase
    .from("regions")
    .select("id,name,level,parent_id,code")
    .in("level", ["nation", "sido", "sigungu"]);
  if (error) throw error;
  cachedRegions = (data ?? []) as Region[];
  return cachedRegions;
}

const FOCUSABLE =
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

export function RegionPicker({
  label,
  selectedId,
  onChoose,
}: {
  label: string;
  /** The browsed region id; null = the server default (서울 전체). */
  selectedId: string | null;
  onChoose: (region: BrowseRegion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [regions, setRegions] = useState<Region[] | null>(cachedRegions);
  const [failed, setFailed] = useState(false);
  const [sidoId, setSidoId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const wide = useWide();

  const fetchRegions = useCallback(() => {
    setFailed(false);
    loadRegions()
      .then(setRegions)
      .catch(() => setFailed(true));
  }, []);

  const byId = new Map((regions ?? []).map((r) => [r.id, r]));
  const seoul = regions?.find((r) => r.code === "REG_SEOUL") ?? null;
  const current = (selectedId && byId.get(selectedId)) || seoul;
  const currentSidoId =
    current?.level === "sigungu" ? current.parent_id : (current?.id ?? null);
  const rank = (r: Region) => {
    const index = SIDO_ORDER.indexOf(r.code ?? "");
    return index < 0 ? SIDO_ORDER.length : index;
  };
  const sidos = (regions ?? [])
    .filter((r) => r.level === "sido")
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ko"));
  const nation = regions?.find((r) => r.level === "nation") ?? null;
  const districtsOf = (id: string) =>
    (regions ?? [])
      .filter((r) => r.level === "sigungu" && r.parent_id === id)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const sido = sidoId ? (byId.get(sidoId) ?? null) : null;
  const districts = sido ? districtsOf(sido.id) : [];

  function close(restoreFocus = true) {
    setOpen(false);
    setSidoId(null);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  }

  function choose(region: Region) {
    const parent =
      region.level === "sigungu" && region.parent_id
        ? byId.get(region.parent_id)
        : null;
    const text = browseRegionLabel(region, parent);
    if (text) onChoose({ regionId: region.id, label: text });
    close();
  }

  function pickSido(region: Region) {
    if (districtsOf(region.id).length) setSidoId(region.id);
    else choose(region);
  }

  // PC: below the title, kept on screen.
  const place = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 340;
    setAnchor({
      top: rect.bottom + 8,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !wide) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, wide, place]);

  // Focus the chosen option (or the first) whenever the list changes.
  useEffect(() => {
    if (!open) return;
    const root = panel.current;
    if (!root) return;
    const target =
      root.querySelector<HTMLElement>('[aria-current="true"]') ??
      root.querySelector<HTMLElement>("[data-region-option]") ??
      root.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
  }, [open, sidoId, regions, failed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (sidoId) setSidoId(null);
        else close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? index <= 0
          ? items.length - 1
          : index - 1
        : index === items.length - 1
          ? 0
          : index + 1;
      event.preventDefault();
      items[next].focus();
    };
    document.addEventListener("keydown", onKey);
    let overflow: string | null = null;
    if (!wide) {
      overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      if (overflow !== null) document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sidoId, wide]);

  const option = (
    region: Region,
    text: string,
    options: { selected: boolean; more?: boolean; onClick: () => void },
  ) => (
    <li key={region.id}>
      <button
        type="button"
        data-region-option
        aria-current={options.selected ? "true" : undefined}
        onClick={options.onClick}
        className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pl-ink ${
          options.selected
            ? "bg-pl-paper font-bold text-pl-ink"
            : "text-pl-ink hover:bg-pl-paper"
        }`}
      >
        <span className="min-w-0 truncate">{text}</span>
        {options.selected && !options.more && (
          <Check size={18} aria-hidden="true" className="shrink-0" />
        )}
        {options.more && (
          <ChevronRight
            size={18}
            aria-hidden="true"
            className="shrink-0 text-pl-meta"
          />
        )}
      </button>
    </li>
  );

  const body = failed ? (
    <div role="alert" className="py-6 text-center text-[14px] text-pl-sub">
      <p className="m-0">지역 목록을 불러오지 못했어요.</p>
      <button
        type="button"
        onClick={fetchRegions}
        className="mt-2 min-h-11 underline"
      >
        다시 불러오기
      </button>
    </div>
  ) : !regions ? (
    <p role="status" className="m-0 py-6 text-center text-[14px] text-pl-meta">
      지역 목록을 불러오는 중
    </p>
  ) : sido ? (
    <>
      <button
        type="button"
        onClick={() => setSidoId(null)}
        className="mb-1 inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-pl-sub"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        시·도 다시 고르기
      </button>
      <ul className="m-0 grid list-none grid-cols-1 gap-1 p-0">
        {option(sido, `${shortSidoName(sido.name)} 전체`, {
          selected: current?.id === sido.id,
          onClick: () => choose(sido),
        })}
      </ul>
      <ul
        aria-label={`${shortSidoName(sido.name)}의 구·군`}
        className="m-0 mt-1 grid list-none grid-cols-3 gap-1 border-t border-pl-line p-0 pt-2"
      >
        {districts.map((district) =>
          option(district, district.name, {
            selected: current?.id === district.id,
            onClick: () => choose(district),
          }),
        )}
      </ul>
    </>
  ) : (
    <ul aria-label="시·도" className="m-0 grid list-none grid-cols-2 gap-1 p-0">
      {sidos.map((region) =>
        option(region, shortSidoName(region.name), {
          selected: currentSidoId === region.id,
          more: districtsOf(region.id).length > 0,
          onClick: () => pickSido(region),
        }),
      )}
      {nation &&
        option(nation, "전국", {
          selected: current?.id === nation.id,
          onClick: () => choose(nation),
        })}
    </ul>
  );

  const sheet =
    open && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[60]">
            <div
              aria-hidden="true"
              onClick={() => close()}
              className="absolute inset-0 bg-pl-ink/40 md:bg-transparent"
            />
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              data-region-picker={wide ? "dropdown" : "sheet"}
              style={
                wide && anchor
                  ? { top: anchor.top, left: anchor.left, width: 340 }
                  : undefined
              }
              className={
                wide
                  ? "absolute max-h-[min(480px,calc(100vh-120px))] overflow-y-auto rounded-xl border border-pl-line bg-pl-card p-3 shadow-xl"
                  : "pl-sheet-panel absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto overscroll-contain rounded-t-[20px] bg-pl-card px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
              }
            >
              {!wide && (
                <div
                  aria-hidden="true"
                  className="mx-auto mb-3 h-1 w-10 rounded-full bg-pl-line"
                />
              )}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2
                    id={titleId}
                    className="m-0 font-pl-serif text-[18px] font-bold text-pl-ink"
                  >
                    {sido ? `${shortSidoName(sido.name)} 구·군` : "둘러볼 지역"}
                  </h2>
                  <p className="m-0 mt-0.5 text-[12.5px] text-pl-meta">
                    둘러보는 지역이에요. 내 설정의 지역은 바뀌지 않아요.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="닫기"
                  onClick={() => close()}
                  className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center text-pl-sub"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              {body}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`둘러보는 지역: ${label}. 바꾸기`}
        onClick={() => {
          if (!regions) fetchRegions();
          setOpen(true);
        }}
        className="flex min-h-11 min-w-0 items-center gap-1.5 text-pl-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pl-ink"
      >
        <MapPin
          size={22}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0"
        />
        <span className="truncate font-pl-serif text-[22px] font-bold leading-none md:text-[34px]">
          {label}
        </span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0" />
      </button>
      {sheet}
    </>
  );
}
