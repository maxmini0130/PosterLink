// src/adapters/fifty-plus-education.js
// 서울시50플러스포털 center course boards (/<center>/education.do), first
// connected for 서대문50플러스센터 (/sdm). The portal is the collection
// source; the center that runs the course is the organizer.
//
// List rows carry 기관, 분류, 제목, 모집기간, 교육기간, 강사, 수강료, 정원 and
// the application button label (수강신청 / 대기신청 / 신청마감). The detail
// page (education-detail.do?id=N) repeats 정원·모집기간·수강료, adds 추가비용,
// 문의, the session table and the course poster image, and shows the same
// button. The course id is the notice identity: a new 기수 or class has a new
// id and is a separate notice.
import { fetchPage } from "../crawler.js";
import { filterAndOrderPosterImages } from "../poster-image-rules.js";
import { portalDeadlineIso, readPortalDeadline } from "../deadline-provenance.js";
import {
  SOURCE_APPLICATION_STATUS_RULES,
  classifySourceApplicationLabel,
} from "../source-application-status.js";

const BASE_URL = "https://www.50plus.or.kr";
const PORTAL_NAME = "서울시50플러스포털";
const DEFAULT_OPEN_LIST_MAX_PAGES = 5;
const DEFAULT_ALL_LIST_MAX_PAGES = 3;

// Only centers whose list was checked against the live site. The list column
// 기관 must match `label`; the organizer is never guessed for other centers.
export const FIFTY_PLUS_CENTERS = Object.freeze({
  sdm: Object.freeze({ label: "서대문센터", organizerName: "서대문50플러스센터" }),
});

// List rows by detail URL, filled by parseList and read by parseDetail in the
// same crawl (crawlSite calls parseList first). Detail values win.
const listRowsByUrl = new Map();

function cleanText(value) {
  return String(value ?? "")
    .replace(/ /g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactText(value) {
  return cleanText(value).replace(/\s+/g, " ").trim();
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

/** "/sdm/education.do" -> "sdm". */
export function centerCodeFromUrl(url) {
  try {
    return new URL(url, BASE_URL).pathname.split("/").filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

/** Stable detail URL for a course id under the board's center path. */
export function detailUrlFor(boardUrl, courseId) {
  const center = centerCodeFromUrl(boardUrl);
  if (!center || !/^\d+$/.test(String(courseId ?? ""))) return null;
  return `${BASE_URL}/${center}/education-detail.do?id=${courseId}`;
}

export function courseIdFromUrl(url) {
  try {
    const id = new URL(url, BASE_URL).searchParams.get("id");
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function listPageUrl(boardUrl, { state = null, page = 1 } = {}) {
  const url = new URL(boardUrl, BASE_URL);
  if (state) url.searchParams.set("state", state);
  else url.searchParams.delete("state");
  if (page > 1) url.searchParams.set("page", String(page));
  else url.searchParams.delete("page");
  return url.href;
}

/** Text of a cell with <br> kept as a space and the mobile label removed. */
function cellValue($, cell) {
  const $copy = $(cell).clone();
  $copy.find(".td-normal__label, label").remove();
  $copy.find("br").replaceWith(" ");
  return compactText($copy.text());
}

function cellLabel($, cell) {
  return compactText($(cell).find(".td-normal__label, label").first().text()).replace(/\s*[:：]\s*$/, "");
}

const DOTTED_DATE = /(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/g;

function pad(value) {
  return String(value).padStart(2, "0");
}

/** "2026.11.16 ~2026.11.21" -> { start: "2026-11-16", end: "2026-11-21", raw }. */
export function parseDottedRange(value) {
  const raw = compactText(value);
  const dates = [...raw.matchAll(DOTTED_DATE)].map((match) => {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    return valid ? `${year}-${pad(month)}-${pad(day)}` : null;
  });
  if (dates.length === 0 || dates.some((date) => !date)) return { start: null, end: null, raw };
  const [start, end = start] = [dates[0], dates[dates.length - 1]];
  if (end < start) return { start: null, end: null, raw };
  return { start, end, raw };
}

function displayRange(range) {
  if (!range?.start) return null;
  const dotted = (date) => date.replaceAll("-", ".");
  return range.start === range.end ? dotted(range.start) : `${dotted(range.start)} ~ ${dotted(range.end)}`;
}

const LIST_FIELD_KEYS = Object.freeze({
  기관: "centerLabel",
  중분류: "term",
  소분류: "track",
  제목: "title",
  모집기간: "applicationPeriod",
  교육기간: "educationPeriod",
  강사: "lecturer",
  수강료: "fee",
  정원: "capacity",
});

/**
 * Course rows on one list page. Each row links to education-detail.do?id=N
 * through its application button, whose text is the application status.
 */
export function parseFiftyPlusListPage($, pageUrl, boardUrl = pageUrl) {
  const rows = [];
  $(".campus-course-list-table table").first().find("tbody tr").each((_, row) => {
    const $row = $(row);
    const $button = $row.find("a.td-normal__application-btn[href*='education-detail.do']").first();
    const courseId = courseIdFromUrl(resolveUrl(pageUrl, $button.attr("href")));
    const url = detailUrlFor(boardUrl, courseId);
    if (!url) return;

    const fields = {};
    $row.find("td").each((__, cell) => {
      const key = LIST_FIELD_KEYS[cellLabel($, cell)];
      if (key) fields[key] = cellValue($, cell);
    });
    if (!fields.title) return;

    rows.push({
      courseId,
      url,
      title: fields.title,
      centerLabel: fields.centerLabel ?? null,
      term: fields.term ?? null,
      track: fields.track ?? null,
      applicationPeriod: parseDottedRange(fields.applicationPeriod),
      educationPeriod: parseDottedRange(fields.educationPeriod),
      lecturer: fields.lecturer ?? null,
      fee: fields.fee ?? null,
      capacity: fields.capacity ?? null,
      statusLabel: compactText($button.text()),
    });
  });
  return rows;
}

function readableText($, element) {
  const $copy = $(element).clone();
  $copy.find("script, style, noscript, iframe, img").remove();
  $copy.find("br").replaceWith("\n");
  $copy.find("p, div, li, tr").each((_, child) => {
    $(child).append("\n");
  });
  return cleanText($copy.text());
}

function applicationInfo($, $box) {
  const info = {};
  $box.find(".application-info").each((_, paragraph) => {
    const $paragraph = $(paragraph);
    const labels = $paragraph.find(".application-info__label");
    labels.each((index, label) => {
      const key = compactText($(label).text()).replace(/[:：]\s*$/, "");
      // The value runs from this label to the next label in the same paragraph.
      let value = "";
      let node = label.nextSibling;
      const next = labels.get(index + 1);
      while (node && node !== next) {
        value += node.type === "text" ? node.data : node.name === "br" ? " " : $(node).text();
        node = node.nextSibling;
      }
      if (key) info[key] = compactText(value.replace(/<!--.*?-->/g, ""));
    });
  });
  return info;
}

function isCourseImage(src) {
  return Boolean(src) && !/logo|icon|btn|banner|sns|kakao|facebook|twitter|blog|sprite|favicon/i.test(src);
}

function courseImages($, $info, postUrl) {
  const images = [];
  $info.find("img").each((_, img) => {
    const $img = $(img);
    // The shared "신청·면제·환불방법" banner links to education-Introduce.do.
    if ($img.closest("a[href*='education-Introduce']").length > 0) return;
    const url = resolveUrl(postUrl, $img.attr("src") || $img.attr("data-src"));
    if (url && isCourseImage(url) && !images.includes(url)) images.push(url);
  });
  return images;
}

function scheduleRows($) {
  const rows = [];
  $(".course-schedule-table tbody tr").each((_, row) => {
    const values = {};
    $(row).find("td").each((__, cell) => {
      const label = cellLabel($, cell);
      if (label) values[label] = cellValue($, cell);
    });
    if (Object.keys(values).length > 0) rows.push(values);
  });
  return rows;
}

function truncate(value, maxLength) {
  const text = compactText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * The detail page as plain values (no network). `listRow` is the matching
 * list row when the list was read in the same crawl.
 */
export function parseFiftyPlusDetailPage($, postUrl, listRow = null) {
  const title = compactText($(".show-title").first().text())
    || compactText($("#LINK_TITLE").attr("value"))
    || listRow?.title
    || "";
  const $box = $(".application-box").first();
  const $button = $box.children("a, span").filter((_, el) => /block-btn/.test($(el).attr("class") ?? "")).first();
  const statusLabel = compactText($button.text()) || listRow?.statusLabel || "";
  const applyHref = $button.is("a") ? resolveUrl(postUrl, $button.attr("href")) : null;
  const info = applicationInfo($, $box);
  const detailPeriod = parseDottedRange(info["모집기간"]);
  const applicationPeriod = detailPeriod.start ? detailPeriod : listRow?.applicationPeriod ?? detailPeriod;
  const $info = $(".course-info").first();
  const infoText = readableText($, $info);
  const contact = compactText($(".course-contact").first().text()).replace(/^문의하기\s*[:：]\s*/, "");
  const lecturers = $(".lecturer-list .lecturer-name").map((_, el) => compactText($(el).text())).get().filter(Boolean);
  const thumbnail = resolveUrl(postUrl, $("#LINK_IMAGE_URL").attr("value"));
  const images = courseImages($, $info, postUrl);

  return {
    courseId: courseIdFromUrl(postUrl),
    title,
    statusLabel,
    applyHref: applyHref && /education-apply\.do/.test(applyHref) ? applyHref : null,
    capacity: info["정원"] || listRow?.capacity || null,
    applicationPeriod,
    fee: info["수강료"] || listRow?.fee || null,
    extraCost: info["추가비용"] || null,
    contact: contact || null,
    infoText,
    schedule: scheduleRows($),
    lecturers: lecturers.length > 0 ? lecturers : listRow?.lecturer ? [listRow.lecturer] : [],
    images,
    thumbnail: thumbnail && isCourseImage(thumbnail) ? thumbnail : null,
  };
}

const ELIGIBILITY_LINE = /(?:^|\n)\s*[※*\-■□●○▶]?\s*(?:교육|모집|신청|참여|수강)?\s*(?:대상|자격)\s*[:：]/;

/**
 * The crawler post for one course: labeled content lines for the common
 * notice-fact extraction, the deadline from the portal field, the source
 * application state and the review issues the adapter can already see.
 */
export function buildFiftyPlusCoursePost({ detail, listRow = null, boardUrl, postUrl }) {
  const centerCode = centerCodeFromUrl(boardUrl ?? postUrl);
  const center = FIFTY_PLUS_CENTERS[centerCode] ?? null;
  const centerMatches = Boolean(center && (!listRow?.centerLabel || listRow.centerLabel === center.label));
  const organizerName = centerMatches ? center.organizerName : null;
  const state = classifySourceApplicationLabel(detail.statusLabel);
  const period = detail.applicationPeriod ?? { start: null, end: null, raw: "" };
  const educationPeriod = listRow?.educationPeriod ?? null;
  const portalDeadline = period.end
    ? readPortalDeadline(`${period.start} ~ ${period.end}`, { site: "50plus-education", field: "모집기간" })
    : null;
  const hasEligibility = ELIGIBILITY_LINE.test(`\n${detail.infoText ?? ""}`);

  const reviewIssues = [];
  const addIssue = (code, reason, evidence = "") => reviewIssues.push({ code, reason, evidence: truncate(evidence, 200) });
  if (!hasEligibility) {
    addIssue("eligibility-unconfirmed", "수강 대상이 원문 텍스트에 없음(강좌 포스터 이미지에서 확인 필요)", detail.title);
  }
  if (!portalDeadline) {
    addIssue("application-period-unconfirmed", "모집기간을 원문에서 읽지 못함", period.raw);
  }
  if (!organizerName) {
    addIssue("organizer-unconfirmed", "목록의 기관 값이 등록된 센터와 다름", listRow?.centerLabel ?? centerCode ?? "");
  }
  if (state === "unknown" || state === "upcoming") {
    addIssue("application-status-unconfirmed", "원문 신청 버튼의 접수 상태를 확인 필요", detail.statusLabel);
  }
  if (state === "waitlist") {
    addIssue("source-application-waitlist", "원문 신청 버튼이 대기신청(대기 접수)", detail.statusLabel);
  }

  const lines = [
    organizerName ? `주관기관: ${organizerName}` : null,
    listRow?.term || listRow?.track ? `과정 분류: ${[listRow.term, listRow.track].filter(Boolean).join(" / ")}` : null,
    // The source's own button text; an unrecognized label is shown as is.
    `접수상태: ${detail.statusLabel || "확인 필요"}${state === "unknown" && detail.statusLabel ? " (확인 필요)" : ""}`,
    displayRange(period) ? `모집기간: ${displayRange(period)}` : null,
    displayRange(educationPeriod) ? `교육기간: ${displayRange(educationPeriod)}` : null,
    detail.fee ? `수강료: ${detail.fee}${detail.extraCost ? ` (추가비용: ${detail.extraCost})` : ""}` : null,
    detail.capacity ? `정원: ${detail.capacity.replace(/\s+명$/, "명")}` : null,
    detail.lecturers.length > 0 ? `강사: ${detail.lecturers.join(", ")}` : null,
    state === "open" || state === "waitlist"
      ? `신청방법: ${PORTAL_NAME} 강좌 상세 화면에서 '${detail.statusLabel}' 버튼으로 온라인 신청(로그인 필요)`
      : null,
    detail.contact ? `문의: ${detail.contact}` : null,
  ];
  const places = [...new Set(detail.schedule.map((row) => row["장소"]).filter(Boolean))];
  if (places.length > 0) lines.push(`교육장소: ${places.join(", ")}`);
  if (detail.schedule.length > 0) {
    lines.push("", "교육일정");
    for (const row of detail.schedule.slice(0, 12)) {
      const parts = [row["일시"], row["내용"] ? truncate(row["내용"], 120) : null].filter(Boolean);
      if (parts.length > 0) lines.push(`- ${parts.join(" · ")}`);
    }
  }
  if (detail.infoText) lines.push("", detail.infoText);

  const images = state === "closed"
    ? []
    : detail.images.length > 0 ? detail.images : detail.thumbnail ? [detail.thumbnail] : [];

  return {
    title: detail.title || listRow?.title || undefined,
    content: cleanText(lines.filter((line) => line !== null).join("\n")),
    deadline: portalDeadline ? portalDeadlineIso(portalDeadline) : undefined,
    deadlineOrigin: portalDeadline ? "portal_field" : undefined,
    portalDeadline: portalDeadline ?? undefined,
    eventStartAt: educationPeriod?.start ?? undefined,
    eventEndAt: educationPeriod?.end ?? undefined,
    organizerName: organizerName ?? undefined,
    images,
    attachments: [],
    links: detail.applyHref && (state === "open" || state === "waitlist")
      ? [{ link_type: "official_apply", title: `${PORTAL_NAME} ${detail.statusLabel}`, url: detail.applyHref, is_primary: true }]
      : [],
    sourceUrl: postUrl,
    sourceIdentity: { param: "id", value: detail.courseId ?? courseIdFromUrl(postUrl) },
    sourceApplicationStatus: {
      state,
      label: detail.statusLabel || null,
      applicationPeriod: period.start ? { start: period.start, end: period.end } : null,
      rules: SOURCE_APPLICATION_STATUS_RULES,
    },
    sourceReviewIssues: reviewIssues,
  };
}

async function readListPages(boardUrl, { state, maxPages }) {
  const rows = [];
  let failed = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = listPageUrl(boardUrl, { state, page });
    const $ = await fetchPage(pageUrl);
    if (!$) {
      failed = page === 1;
      break;
    }
    const pageRows = parseFiftyPlusListPage($, pageUrl, boardUrl);
    const known = new Set(rows.map((row) => row.url));
    const fresh = pageRows.filter((row) => !known.has(row.url));
    rows.push(...fresh);
    if (fresh.length === 0) break;
  }
  return { rows, failed };
}

export default {
  name: "50plus-education",

  /**
   * Open courses come from the 모집중 filter (state=JOIN) until it is empty;
   * the first pages of the full list add recently closed courses so an open
   * record that turns 신청마감 is seen again.
   */
  async parseList(boardUrl, site = {}, _maxPages = 2, board = {}) {
    const openPages = Number(board.openListMaxPages ?? DEFAULT_OPEN_LIST_MAX_PAGES) || DEFAULT_OPEN_LIST_MAX_PAGES;
    const allPages = Number(board.allListMaxPages ?? board.maxPages ?? site.maxPages ?? DEFAULT_ALL_LIST_MAX_PAGES)
      || DEFAULT_ALL_LIST_MAX_PAGES;
    const open = await readListPages(boardUrl, { state: "JOIN", maxPages: openPages });
    const all = await readListPages(boardUrl, { state: null, maxPages: allPages });
    if (open.failed && all.failed) {
      throw new Error(`50plus course list could not be fetched: ${boardUrl}`);
    }

    const byUrl = new Map();
    for (const row of [...open.rows, ...all.rows]) {
      if (!byUrl.has(row.url)) byUrl.set(row.url, row);
    }
    for (const row of byUrl.values()) listRowsByUrl.set(row.url, row);

    return [...byUrl.values()].map((row) => ({
      title: row.title,
      url: row.url,
      sourceUrl: row.url,
      date: "",
      images: [],
      attachments: [],
      listApplicationStatus: row.statusLabel,
    }));
  },

  async parseDetail(postUrl, _site = {}, board = {}) {
    const listRow = listRowsByUrl.get(postUrl) ?? null;
    const $ = await fetchPage(postUrl);
    if (!$) {
      throw new Error(`50plus course detail could not be fetched: ${postUrl}`);
    }
    const detail = parseFiftyPlusDetailPage($, postUrl, listRow);
    const post = buildFiftyPlusCoursePost({ detail, listRow, boardUrl: board?.url ?? postUrl, postUrl });
    if (post.images.length === 0) {
      return { ...post, posterImageRule: null, posterImageCandidates: null };
    }
    const posterImages = await filterAndOrderPosterImages(post.images, {
      title: post.title,
      content: post.content,
      site: PORTAL_NAME,
      sourceUrl: postUrl,
      preferredImageUrls: detail.images,
    });
    return {
      ...post,
      images: posterImages.images,
      posterImageRule: posterImages.posterImageRule,
      posterImageCandidates: posterImages.posterImageCandidates,
    };
  },
};
