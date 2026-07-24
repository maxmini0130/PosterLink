// ---------------------------------------------------------------------------
// 수집 설정(config_json) 스키마 · 파싱/직렬화 · 검증
//
// React 에 의존하지 않는 순수 로직만 모아 둔다(단위 테스트 가능).
// ConfigEditor 컴포넌트가 이 모듈을 사용한다.
// ---------------------------------------------------------------------------

export const KNOWN_SELECTOR_KEYS: ReadonlyArray<readonly [string, string, string]> = [
  ["listItem", "목록 항목", "table tbody tr"],
  ["listLink", "목록 링크", "a[href]"],
  ["listTitle", "목록 제목", "(비우면 링크 텍스트)"],
  ["listDate", "목록 날짜", ".date, .td_date, td:last-child"],
  ["detailTitle", "상세 제목", "h1, h2, .view_title, .bo_v_tit"],
  ["detailContent", "상세 본문", ".view_content, .bo_v_con, .content"],
  ["detailImages", "상세 이미지", ".view_content img, .content img"],
  ["detailAttachments", "첨부파일", "a[href*=download], .file_list a"],
];

// id 는 React 리스트 key 안정화를 위한 클라이언트 전용 필드다.
// parseToForm 은 부여하지 않고(순수 유지), serializeForm 은 무시한다(직렬화 제외).
export type BoardRow = { id?: string; name: string; url: string; category: string };

export type ConfigForm = {
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

export type Issue = { level: "error" | "warning"; message: string };
export type ValidationResult = { level: "ok" | "warning" | "error"; issues: Issue[] };

// --- 유틸 -------------------------------------------------------------------

export function isPlainObject(value: unknown): value is Record<string, any> {
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

export function parseToForm(raw: string): ConfigForm {
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

export function serializeForm(form: ConfigForm): string {
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
  } catch {
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
    const hasSelector =
      str(ext.scopeSelector ?? ext.scope_selector).trim() || str(ext.linkSelector ?? ext.link_selector).trim();
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
