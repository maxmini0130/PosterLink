/**
 * 청년몽땅정보통 (youth.seoul.go.kr) notice identity for links (2026-11-19).
 *
 * Every notice on the portal has a stable id (sprtInfoId). A poster built from
 * one notice must not carry links that belong to a different notice.
 *
 * In the review golden set, 31 of 266 reviewed posters had links a person
 * removed. The detail page itself only links its own notice (checked on live
 * pages): the foreign links came from duplicate merges. When a later notice
 * from the same center (a sibling session, the next month's class) was merged
 * into an existing poster, its 공식 공고 원문 / 경유 출처 link and its own
 * application forms were appended to that poster (addSupplementalPosterLinks).
 * The appended notice link then made the next sibling match by source URL,
 * so one poster collected up to 17 notices' links.
 *
 * Pure functions; upload-to-supabase.js applies them on the merge path.
 */

const YOUTH_HOST = /(?:^|\.)youth\.seoul\.go\.kr$/i;
const VIEW_PATH = /\/infoData\/sprtInfo\/view\.do$/i;

/** The portal notice id (sprtInfoId) of a youth.seoul.go.kr notice URL, or null. */
export function youthSeoulNoticeId(url) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return null;
  }
  if (!YOUTH_HOST.test(parsed.hostname) || !VIEW_PATH.test(parsed.pathname)) return null;
  const id = parsed.searchParams.get("sprtInfoId");
  return id && /^\d+$/.test(id) ? id : null;
}

function idsOf(urls) {
  return new Set(urls.map(youthSeoulNoticeId).filter(Boolean));
}

function linkUrl(link) {
  return typeof link === "string" ? link : link?.url ?? null;
}

const PROGRAM_NAME = /[<〈《「＜]\s*([^<>〈〉《》「」＜＞]{2,})\s*[>〉》」＞]/;
// Asides a repost adds to the same title: "*모집 기간 연장*", "(추가모집)", "[마감임박]".
const TITLE_ASIDE = /\*[^*]*\*|\([^()]*\)|\[[^\]]*\]/g;

function squash(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * True when two portal titles name the same program. The program name in
 * angle brackets decides when both titles have one; otherwise the titles
 * must match once asides are removed. Unknown titles are not the same.
 */
export function sameProgramTitle(a, b) {
  if (!a || !b) return false;
  const programA = String(a).match(PROGRAM_NAME)?.[1];
  const programB = String(b).match(PROGRAM_NAME)?.[1];
  if (programA && programB) return squash(programA) === squash(programB);
  const plainA = squash(String(a).replace(TITLE_ASIDE, ""));
  return plainA.length >= 6 && plainA === squash(String(b).replace(TITLE_ASIDE, ""));
}

/**
 * The portal notice ids a stored poster stands for: the id of its source_key
 * when the source is a portal notice, otherwise the ids of its 경유 출처 links
 * (an external original reached through the portal).
 */
export function ownYouthNoticeIds(row = {}) {
  const fromSource = idsOf([row.source_key, row.sourceUrl].filter(Boolean));
  if (fromSource.size > 0) return fromSource;
  const viaLinks = (Array.isArray(row.poster_links) ? row.poster_links : [])
    .filter((link) => link?.link_type === "other")
    .map(linkUrl);
  return idsOf(viaLinks);
}

/**
 * Links to add to an existing poster when a crawled post was merged into it
 * as a duplicate.
 *
 * - The post comes from a different portal notice than the poster (disjoint
 *   notice ids) for a different program (sameProgramTitle is false): none of
 *   its links are added. Its notice link and its forms belong to that other
 *   notice ("…<SKILL:ON - 클로드코드로 디자인>" vs "…<…영상제작>").
 * - A repost of the same program under a new id (a deadline extension, a
 *   typo fix) keeps its links: reviewers kept both notices there.
 * - Otherwise a link to a portal notice other than the poster's own is dropped.
 *
 * Posters unrelated to the portal are returned unchanged.
 */
export function filterSupplementalLinksForNotice({
  targetRow = {},
  sourceUrl = null,
  linkEntries = [],
  incomingTitle = null,
} = {}) {
  const entries = Array.isArray(linkEntries) ? linkEntries : [];
  const targetIds = ownYouthNoticeIds(targetRow);
  if (targetIds.size === 0) return { links: entries, dropped: [], reason: null };

  const incomingIds = idsOf([sourceUrl, ...entries.map(linkUrl)]);
  const sharesNotice = [...incomingIds].some((id) => targetIds.has(id));
  if (incomingIds.size > 0 && !sharesNotice) {
    if (sameProgramTitle(targetRow.title, incomingTitle)) {
      return { links: entries, dropped: [], reason: null };
    }
    return { links: [], dropped: entries, reason: "different-portal-notice" };
  }

  const links = [];
  const dropped = [];
  for (const entry of entries) {
    const id = youthSeoulNoticeId(linkUrl(entry));
    if (id && !targetIds.has(id)) dropped.push(entry);
    else links.push(entry);
  }
  return { links, dropped, reason: dropped.length > 0 ? "foreign-portal-notice-link" : null };
}
