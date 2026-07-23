"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Braces, CheckCircle2, LayoutList, Plus, Trash2, XCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// 수집 설정(config_json) 구조화 에디터
//
// 기존에는 raw JSON textarea 로만 편집했으나, 이 컴포넌트는 adapter/게시판/셀렉터/
// URL 필터/페이지네이션/원문추적을 필드 단위로 편집하게 하고, 알 수 없는 키는
// 손실 없이 보존한다. "고급(JSON)" 토글로 언제든 raw JSON 편집으로 전환할 수 있다.
//
// 인터페이스는 문자열 기반(value/onChange)이라 기존 폼 상태를 그대로 쓸 수 있다.
// ---------------------------------------------------------------------------

const KNOWN_SELECTOR_KEYS = [
  ["listItem", "목록 항목", "table tbody tr"],
  ["listLink", "목록 링크", "a[href]"],
  ["listTitle", "목록 제목", "(비우면 링크 텍스트)"],
  ["listDate", "목록 날짜", ".date, .td_date, td:last-child"],
  ["detailTitle", "상세 제목", "h1, h2, .view_title, .bo_v_tit"],
  ["detailContent", "상세 본문", ".view_content, .bo_v_con, .content"],
  ["detailImages", "상세 이미지", ".view_content img, .content img"],
  ["detailAttachments", "첨부파일", "a[href*=download], .file_list a"],
] as const;

type BoardRow = { name: string; url: string; category: string };

type ConfigForm = {
  adapter: string;
  maxPages: string;
  siteIds: string;
  boards: BoardRow[];
  paginationParam: string;
  paginationExtra: Record<string, any>;
  selectors: Record<string, string>;
  selectorsExtra: Record<string, any>;
  sameHostOnly: boolean;
  include: string;
  exclude: string;
  urlFiltersExtra: Record<string, any>;
  excludeTitle: string;
  extEnabled: boolean;
  extScope: string;
  extLink: string;
  extExcludeHosts: string;
  extExtra: Record<string, any>;
  extra: Record<string, any>;
};

type Issue = { level: "error" | "warning"; message: string };
type ValidationResult = { level: "ok" | "warning" | "error"; issues: Issue[] };

// --- 유틸 -------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function str(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  return String(value);
}

function arrToLines(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => str(item)).filter(Boolean).join("\n");
  if (typeof value === "string") return value;
  return "";
}

function linesToArr(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function omitKeys(obj: Record<string, any>, keys: string[]): Record<string, any> {
  const next: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) next[key] = obj[key];
  }
  return next;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// --- 파싱/직렬화 ------------------------------------------------------------

function parseToForm(raw: string): ConfigForm {
  let obj: Record<string, any> = {};
  try {
    const parsed = JSON.parse(raw || "{}");
    if (isPlainObject(parsed)) obj = parsed;
  } catch {
    // 파싱 실패 시 빈 폼 (JSON 모드에서 원문 편집)
  }

  const {
    adapter,
    maxPages,
    site_ids: siteIds,
    boards,
    pagination,
    selectors,
    urlFilters,
    excludeTitlePatterns,
    externalOriginal,
    external_original,
    ...extra
  } = obj;

  const paginationObj = isPlainObject(pagination) ? pagination : {};
  const selectorsObj = isPlainObject(selectors) ? selectors : {};
  const urlFiltersObj = isPlainObject(urlFilters) ? urlFilters : {};
  const ext = isPlainObject(externalOriginal)
    ? externalOriginal
    : isPlainObject(external_original)
      ? external_original
      : {};

  const knownSelectors: Record<string, string> = {};
  for (const [key] of KNOWN_SELECTOR_KEYS) {
    knownSelectors[key] = str(selectorsObj[key]);
  }

  return {
    adapter: str(adapter, "generic-board"),
    maxPages: maxPages === undefined || maxPages === null ? "" : String(maxPages),
    siteIds: arrToLines(siteIds),
    boards: Array.isArray(boards)
      ? boards
          .filter(isPlainObject)
          .map((board) => ({
            name: str(board.name),
            url: str(board.url),
            category: str(board.category),
          }))
      : [],
    paginationParam: str(paginationObj.param),
    paginationExtra: omitKeys(paginationObj, ["param"]),
    selectors: knownSelectors,
    selectorsExtra: omitKeys(selectorsObj, KNOWN_SELECTOR_KEYS.map(([key]) => key)),
    sameHostOnly: Boolean(urlFiltersObj.sameHostOnly),
    include: arrToLines(urlFiltersObj.include),
    exclude: arrToLines(urlFiltersObj.exclude),
    urlFiltersExtra: omitKeys(urlFiltersObj, ["sameHostOnly", "include", "exclude"]),
    excludeTitle: arrToLines(excludeTitlePatterns),
    extEnabled: Boolean(ext.enabled ?? ext.follow),
    extScope: str(ext.scopeSelector ?? ext.scope_selector),
    extLink: str(ext.linkSelector ?? ext.link_selector),
    extExcludeHosts: arrToLines(ext.excludeHosts ?? ext.exclude_hosts),
    extExtra: omitKeys(ext, [
      "enabled",
      "follow",
      "scopeSelector",
      "scope_selector",
      "linkSelector",
      "link_selector",
      "excludeHosts",
      "exclude_hosts",
    ]),
    extra: extra ?? {},
  };
}

function serializeForm(form: ConfigForm): string {
  const out: Record<string, any> = { ...form.extra };

  out.adapter = form.adapter.trim() || "generic-board";

  const trimmedMax = form.maxPages.trim();
  if (trimmedMax) {
    const parsed = Number(trimmedMax);
    out.maxPages = Number.isFinite(parsed) ? parsed : trimmedMax;
  }

  const siteIds = linesToArr(form.siteIds);
  if (siteIds.length) out.site_ids = siteIds;

  const boards = form.boards
    .filter((board) => board.name.trim() || board.url.trim())
    .map((board) => {
      const entry: Record<string, string> = { name: board.name.trim(), url: board.url.trim() };
      if (board.category.trim()) entry.category = board.category.trim();
      return entry;
    });
  if (boards.length) out.boards = boards;

  const pagination: Record<string, any> = { ...form.paginationExtra };
  if (form.paginationParam.trim()) pagination.param = form.paginationParam.trim();
  if (Object.keys(pagination).length) out.pagination = pagination;

  const selectors: Record<string, any> = { ...form.selectorsExtra };
  for (const [key] of KNOWN_SELECTOR_KEYS) {
    const value = form.selectors[key]?.trim();
    if (value) selectors[key] = value;
  }
  if (Object.keys(selectors).length) out.selectors = selectors;

  const urlFilters: Record<string, any> = { ...form.urlFiltersExtra };
  if (form.sameHostOnly) urlFilters.sameHostOnly = true;
  const include = linesToArr(form.include);
  if (include.length) urlFilters.include = include;
  const exclude = linesToArr(form.exclude);
  if (exclude.length) urlFilters.exclude = exclude;
  if (Object.keys(urlFilters).length) out.urlFilters = urlFilters;

  const excludeTitle = linesToArr(form.excludeTitle);
  if (excludeTitle.length) out.excludeTitlePatterns = excludeTitle;

  const ext: Record<string, any> = { ...form.extExtra };
  if (form.extEnabled) ext.enabled = true;
  if (form.extScope.trim()) ext.scopeSelector = form.extScope.trim();
  if (form.extLink.trim()) ext.linkSelector = form.extLink.trim();
  const extHosts = linesToArr(form.extExcludeHosts);
  if (extHosts.length) ext.excludeHosts = extHosts;
  if (Object.keys(ext).length) out.externalOriginal = ext;

  return JSON.stringify(out, null, 2);
}

// --- 검증 -------------------------------------------------------------------

export function validateCollectionConfig(raw: string): ValidationResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { level: "ok", issues: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return {
      level: "error",
      issues: [{ level: "error", message: "JSON 문법 오류: 저장하기 전에 형식을 확인하세요." }],
    };
  }

  if (!isPlainObject(parsed)) {
    return { level: "error", issues: [{ level: "error", message: "설정은 객체(JSON object) 형태여야 합니다." }] };
  }

  const issues: Issue[] = [];
  const config = parsed as Record<string, any>;

  if (!str(config.adapter).trim()) {
    issues.push({ level: "warning", message: "adapter 가 비어 있습니다. 기본 generic-board 로 처리됩니다." });
  }

  if (config.maxPages !== undefined && config.maxPages !== null && config.maxPages !== "") {
    const maxPages = Number(config.maxPages);
    if (!Number.isInteger(maxPages) || maxPages < 1) {
      issues.push({ level: "error", message: "maxPages 는 1 이상의 정수여야 합니다." });
    }
  }

  if (config.boards !== undefined) {
    if (!Array.isArray(config.boards)) {
      issues.push({ level: "error", message: "boards 는 배열이어야 합니다." });
    } else {
      config.boards.forEach((board: any, index: number) => {
        const label = `게시판 ${index + 1}`;
        if (!isPlainObject(board)) {
          issues.push({ level: "error", message: `${label}: 객체 형태가 아닙니다.` });
          return;
        }
        const url = str(board.url).trim();
        if (!url) {
          issues.push({ level: "error", message: `${label}: URL 이 비어 있습니다.` });
        } else if (!isValidUrl(url)) {
          issues.push({ level: "error", message: `${label}: URL 형식이 올바르지 않습니다 (http/https).` });
        }
        if (!str(board.name).trim()) {
          issues.push({ level: "warning", message: `${label}: 이름이 비어 있습니다.` });
        }
      });
    }
  }

  for (const key of ["urlFilters", "pagination", "selectors", "externalOriginal"]) {
    if (config[key] !== undefined && !isPlainObject(config[key])) {
      issues.push({ level: "error", message: `${key} 는 객체 형태여야 합니다.` });
    }
  }

  if (isPlainObject(config.externalOriginal)) {
    const ext = config.externalOriginal;
    const enabled = Boolean(ext.enabled ?? ext.follow);
    const hasSelector = str(ext.scopeSelector ?? ext.scope_selector).trim() || str(ext.linkSelector ?? ext.link_selector).trim();
    if (enabled && !hasSelector) {
      issues.push({ level: "warning", message: "원문추적이 켜져 있지만 scope/link 셀렉터가 없습니다." });
    }
  }

  const level = issues.some((issue) => issue.level === "error")
    ? "error"
    : issues.some((issue) => issue.level === "warning")
      ? "warning"
      : "ok";

  return { level, issues };
}

// --- UI 스타일 --------------------------------------------------------------

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950";
const labelClass = "mb-1 block text-xs font-bold text-gray-500 dark:text-slate-400";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className={labelClass}>{children}</span>;
}

// --- 메인 컴포넌트 ----------------------------------------------------------

type ConfigEditorProps = {
  value: string;
  onChange: (next: string) => void;
};

export default function ConfigEditor({ value, onChange }: ConfigEditorProps) {
  const [mode, setMode] = useState<"form" | "json">("form");
  const [form, setForm] = useState<ConfigForm>(() => parseToForm(value));
  const [jsonText, setJsonText] = useState<string>(value);
  const lastEmitted = useRef<string>(value);

  // 외부에서 value 가 바뀌면(다른 기관 로드 등) 내부 상태 재동기화
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setForm(parseToForm(value));
      setJsonText(value);
    }
  }, [value]);

  const validation = useMemo(() => validateCollectionConfig(jsonText), [jsonText]);

  function emit(next: string) {
    lastEmitted.current = next;
    onChange(next);
  }

  function updateForm(updater: (prev: ConfigForm) => ConfigForm) {
    setForm((prev) => {
      const next = updater(prev);
      const serialized = serializeForm(next);
      setJsonText(serialized);
      emit(serialized);
      return next;
    });
  }

  function updateJson(text: string) {
    setJsonText(text);
    emit(text);
    try {
      const parsed = JSON.parse(text || "{}");
      if (isPlainObject(parsed)) setForm(parseToForm(text));
    } catch {
      // JSON 편집 중에는 폼 동기화를 건너뛴다
    }
  }

  function switchToForm() {
    try {
      JSON.parse(jsonText || "{}");
    } catch {
      return; // 유효하지 않으면 전환 차단 (검증 배지가 오류를 안내)
    }
    setForm(parseToForm(jsonText));
    setMode("form");
  }

  const updateSelector = (key: string, next: string) =>
    updateForm((prev) => ({ ...prev, selectors: { ...prev.selectors, [key]: next } }));

  const updateBoard = (index: number, patch: Partial<BoardRow>) =>
    updateForm((prev) => ({
      ...prev,
      boards: prev.boards.map((board, i) => (i === index ? { ...board, ...patch } : board)),
    }));

  const addBoard = () =>
    updateForm((prev) => ({ ...prev, boards: [...prev.boards, { name: "", url: "", category: "" }] }));

  const removeBoard = (index: number) =>
    updateForm((prev) => ({ ...prev, boards: prev.boards.filter((_, i) => i !== index) }));

  const jsonInvalid = validation.level === "error" && validation.issues.some((issue) => issue.message.includes("JSON 문법"));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:col-span-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm font-black text-gray-950 dark:text-white">수집 설정</span>
        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs font-bold dark:border-slate-800">
          <button
            type="button"
            onClick={switchToForm}
            disabled={jsonInvalid}
            className={`flex items-center gap-1 px-3 py-1.5 transition ${
              mode === "form"
                ? "bg-indigo-500 text-white"
                : "bg-transparent text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <LayoutList size={13} /> 구조화
          </button>
          <button
            type="button"
            onClick={() => setMode("json")}
            className={`flex items-center gap-1 px-3 py-1.5 transition ${
              mode === "json"
                ? "bg-indigo-500 text-white"
                : "bg-transparent text-gray-500 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <Braces size={13} /> 고급(JSON)
          </button>
        </div>
      </div>

      {mode === "form" ? (
        <div className="space-y-5">
          {/* 기본 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="sm:col-span-1">
              <FieldLabel>어댑터</FieldLabel>
              <input
                value={form.adapter}
                onChange={(event) => updateForm((prev) => ({ ...prev, adapter: event.target.value }))}
                placeholder="generic-board"
                className={inputClass}
              />
            </label>
            <label>
              <FieldLabel>최대 페이지</FieldLabel>
              <input
                type="number"
                min={1}
                value={form.maxPages}
                onChange={(event) => updateForm((prev) => ({ ...prev, maxPages: event.target.value }))}
                placeholder="2"
                className={inputClass}
              />
            </label>
            <label>
              <FieldLabel>페이지 파라미터</FieldLabel>
              <input
                value={form.paginationParam}
                onChange={(event) => updateForm((prev) => ({ ...prev, paginationParam: event.target.value }))}
                placeholder="page"
                className={inputClass}
              />
            </label>
          </div>

          {/* 게시판 목록 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <FieldLabel>게시판 목록</FieldLabel>
              <button
                type="button"
                onClick={addBoard}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Plus size={12} /> 추가
              </button>
            </div>
            {form.boards.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs font-semibold text-gray-400 dark:border-slate-800 dark:text-slate-500">
                게시판이 없습니다. 목록 URL 을 기본 게시판으로 사용합니다.
              </p>
            ) : (
              <div className="space-y-2">
                {form.boards.map((board, index) => (
                  <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={board.name}
                      onChange={(event) => updateBoard(index, { name: event.target.value })}
                      placeholder="게시판 이름"
                      className={`${inputClass} sm:w-40`}
                    />
                    <input
                      value={board.url}
                      onChange={(event) => updateBoard(index, { url: event.target.value })}
                      placeholder="https://..."
                      className={`${inputClass} flex-1 font-mono text-xs`}
                    />
                    <input
                      value={board.category}
                      onChange={(event) => updateBoard(index, { category: event.target.value })}
                      placeholder="분류"
                      className={`${inputClass} sm:w-28`}
                    />
                    <button
                      type="button"
                      onClick={() => removeBoard(index)}
                      className="flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
                      aria-label="게시판 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 셀렉터 */}
          <div>
            <FieldLabel>셀렉터</FieldLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KNOWN_SELECTOR_KEYS.map(([key, label, placeholder]) => (
                <label key={key} className="flex flex-col">
                  <span className="mb-1 text-[11px] font-bold text-gray-400 dark:text-slate-500">{label}</span>
                  <input
                    value={form.selectors[key] ?? ""}
                    onChange={(event) => updateSelector(key, event.target.value)}
                    placeholder={placeholder}
                    className={`${inputClass} font-mono text-xs`}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* URL 필터 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <FieldLabel>URL / 제목 필터</FieldLabel>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={form.sameHostOnly}
                  onChange={(event) => updateForm((prev) => ({ ...prev, sameHostOnly: event.target.checked }))}
                  className="h-3.5 w-3.5"
                />
                같은 호스트만
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="flex flex-col">
                <span className="mb-1 text-[11px] font-bold text-gray-400 dark:text-slate-500">포함 패턴 (줄당 1개)</span>
                <textarea
                  value={form.include}
                  onChange={(event) => updateForm((prev) => ({ ...prev, include: event.target.value }))}
                  rows={3}
                  placeholder="/board/view"
                  className={`${inputClass} font-mono text-xs`}
                />
              </label>
              <label className="flex flex-col">
                <span className="mb-1 text-[11px] font-bold text-gray-400 dark:text-slate-500">제외 URL 패턴 (줄당 1개)</span>
                <textarea
                  value={form.exclude}
                  onChange={(event) => updateForm((prev) => ({ ...prev, exclude: event.target.value }))}
                  rows={3}
                  placeholder="/download"
                  className={`${inputClass} font-mono text-xs`}
                />
              </label>
              <label className="flex flex-col">
                <span className="mb-1 text-[11px] font-bold text-gray-400 dark:text-slate-500">제외 제목 패턴 (줄당 1개)</span>
                <textarea
                  value={form.excludeTitle}
                  onChange={(event) => updateForm((prev) => ({ ...prev, excludeTitle: event.target.value }))}
                  rows={3}
                  placeholder="결과 발표"
                  className={`${inputClass} font-mono text-xs`}
                />
              </label>
            </div>
          </div>

          {/* 원문 추적 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <FieldLabel>원문 추적 (경유 페이지)</FieldLabel>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={form.extEnabled}
                  onChange={(event) => updateForm((prev) => ({ ...prev, extEnabled: event.target.checked }))}
                  className="h-3.5 w-3.5"
                />
                사용
              </label>
            </div>
            {form.extEnabled && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex flex-col">
                  <span className="mb-1 text-[11px] font-bold text-gray-400 dark:text-slate-500">범위 셀렉터</span>
                  <input
                    value={form.extScope}
                    onChange={(event) => updateForm((prev) => ({ ...prev, extScope: event.target.value }))}
                    placeholder=".view_content"
                    className={`${inputClass} font-mono text-xs`}
                  />
                </label>
                <label className="flex flex-col">
                  <span className="mb-1 text-[11px] font-bold text-gray-400 dark:text-slate-500">링크 셀렉터</span>
                  <input
                    value={form.extLink}
                    onChange={(event) => updateForm((prev) => ({ ...prev, extLink: event.target.value }))}
                    placeholder="a[href^=http]"
                    className={`${inputClass} font-mono text-xs`}
                  />
                </label>
                <label className="flex flex-col sm:col-span-2">
                  <span className="mb-1 text-[11px] font-bold text-gray-400 dark:text-slate-500">제외 호스트 (줄당 1개)</span>
                  <textarea
                    value={form.extExcludeHosts}
                    onChange={(event) => updateForm((prev) => ({ ...prev, extExcludeHosts: event.target.value }))}
                    rows={2}
                    placeholder="youth.seoul.go.kr"
                    className={`${inputClass} font-mono text-xs`}
                  />
                </label>
              </div>
            )}
          </div>

          {/* site_ids */}
          <label className="flex flex-col">
            <FieldLabel>site_ids (줄당 1개, 기존 크롤러 연동)</FieldLabel>
            <textarea
              value={form.siteIds}
              onChange={(event) => updateForm((prev) => ({ ...prev, siteIds: event.target.value }))}
              rows={2}
              placeholder="seoul-city"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
        </div>
      ) : (
        <textarea
          value={jsonText}
          onChange={(event) => updateJson(event.target.value)}
          rows={16}
          spellCheck={false}
          placeholder="수집 설정 JSON"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 font-mono text-xs font-bold outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-950"
        />
      )}

      <ValidationBadge validation={validation} />
    </div>
  );
}

function ValidationBadge({ validation }: { validation: ValidationResult }) {
  if (validation.level === "ok") {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={14} /> 설정 검증 통과
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1">
      {validation.issues.map((issue, index) => {
        const itemTone = issue.level === "error" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400";
        const ItemIcon = issue.level === "error" ? XCircle : AlertTriangle;
        return (
          <div key={index} className={`flex items-start gap-1.5 text-xs font-semibold ${itemTone}`}>
            <ItemIcon size={13} className="mt-0.5 shrink-0" />
            <span>{issue.message}</span>
          </div>
        );
      })}
    </div>
  );
}
