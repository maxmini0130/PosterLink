const TITLE_GENERIC_WORDS = [
  "참여자",
  "교육생",
  "수강생",
  "대상자",
  "모집",
  "안내",
  "공고",
  "신청",
  "접수",
  "추가",
  "기간",
  "연장",
];

// These modifiers describe a run/session of the same program rather than its
// identity. Keep years and edition numbers so genuinely different annual
// programs do not collapse into one record.
const TITLE_SCHEDULE_MODIFIER_PATTERNS = [
  // normalizeText removes range punctuation and brackets before these run.
  /\d{1,2}\s+\d{1,2}\s*월\s*매주\s*(?:월|화|수|목|금|토|일)요일/gu,
  /\(\s*\d{1,2}\s*[~～\-]\s*\d{1,2}\s*월\s*매주\s*(?:월|화|수|목|금|토|일)요일\s*\)/gu,
  /<\s*\d{1,2}\s*[~～\-]\s*\d{1,2}\s*월\s*매주\s*(?:월|화|수|목|금|토|일)요일\s*>/gu,
  /\b\d{1,2}\s*[~～\-]\s*\d{1,2}\s*월\s*매주\s*(?:월|화|수|목|금|토|일)요일\b/gu,
  /매주\s*(?:월|화|수|목|금|토|일)요일/gu,
  /(?:^|\s)\d{1,2}\s*월(?:\s|$)/gu,
];

const TITLE_VARIANT_WORDS = [
  "신규",
  "프로그램",
  "안내",
];

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return compact(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[「」『』“”"']/g, "")
    .replace(/[<>\[\]()[\]{}]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizePosterTitle(value, orgName = "") {
  let title = normalizeText(value);
  const org = normalizeText(orgName);

  if (org && title.startsWith(org)) {
    title = title.slice(org.length).trim();
  }

  for (const word of TITLE_GENERIC_WORDS) {
    title = title.replace(new RegExp(escapeRegExp(normalizeText(word)), "gi"), " ");
  }

  for (const pattern of TITLE_SCHEDULE_MODIFIER_PATTERNS) {
    title = title.replace(pattern, " ");
  }

  for (const word of TITLE_VARIANT_WORDS) {
    title = title.replace(new RegExp(`(?:^|\\s)${escapeRegExp(normalizeText(word))}(?=\\s|$)`, "giu"), " ");
  }

  return title.replace(/\s+/g, " ").trim();
}

export function normalizePosterOrg(value) {
  return normalizeText(value)
    .replace(/^(?:주|주식회사)\s+/i, "")
    .replace(/\s*(주식회사|\(주\)|㈜|재단법인|사단법인|사회복지법인|유한회사)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSourceUrl(value) {
  const raw = compact(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of ["page", "pageIndex", "cp", "sort", "searchKeyword", "utm_source", "utm_medium", "utm_campaign"]) {
      url.searchParams.delete(key);
    }
    const sortedParams = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, paramValue] of sortedParams) {
      url.searchParams.append(key, paramValue);
    }
    return url.href.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export function normalizeImageIdentity(value) {
  const raw = compact(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of ["w", "h", "width", "height", "q", "quality", "resize", "thumb", "thumbnail", "cache"]) {
      url.searchParams.delete(key);
    }
    return `${url.origin}${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export function normalizeDateKey(value) {
  if (!value) return "";
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function bigrams(value) {
  const text = value.replace(/\s+/g, "");
  if (text.length <= 1) return text ? [text] : [];
  const grams = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.push(text.slice(index, index + 2));
  }
  return grams;
}

function diceCoefficient(a, b) {
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  if (aGrams.length === 0 || bGrams.length === 0) return 0;

  const counts = new Map();
  for (const gram of aGrams) counts.set(gram, (counts.get(gram) ?? 0) + 1);

  let overlap = 0;
  for (const gram of bGrams) {
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  }

  return (2 * overlap) / (aGrams.length + bGrams.length);
}

function tokenJaccard(a, b) {
  const aTokens = new Set(a.split(/\s+/).filter((token) => token.length >= 2));
  const bTokens = new Set(b.split(/\s+/).filter((token) => token.length >= 2));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union > 0 ? intersection / union : 0;
}

export function textSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return Math.max(diceCoefficient(a, b), tokenJaccard(a, b));
}

function getImages(row = {}) {
  const nestedImages = Array.isArray(row.poster_images)
    ? row.poster_images.map((image) => image.storage_path ?? image.url ?? image.image_url)
    : [];
  return [
    row.thumbnail_url,
    ...(Array.isArray(row.images) ? row.images : []),
    ...nestedImages,
  ].filter(Boolean);
}

function getSourceUrls(row = {}) {
  const links = Array.isArray(row.poster_links)
    ? row.poster_links
      .filter((link) => !link?.link_type || link.link_type === "official_notice")
      .map((link) => link.url)
    : [];
  return [row.source_key, row.sourceUrl, row.url, ...links].filter(Boolean);
}

function getApplicationUrls(row = {}) {
  const links = Array.isArray(row.poster_links)
    ? row.poster_links
      .filter((link) => link?.link_type === "official_apply")
      .map((link) => link.url)
    : [];
  return [row.application_url, row.applicationUrl, row.applyUrl, ...links].filter(Boolean);
}

function getAttachmentHashes(row = {}) {
  const directSources = Array.isArray(row.attachmentAnalysis?.sources)
    ? row.attachmentAnalysis.sources
    : [];
  const verifiedSources = Array.isArray(row.field_verification?.attachmentAnalysis?.sources)
    ? row.field_verification.attachmentAnalysis.sources
    : [];
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  return [...directSources, ...verifiedSources, ...attachments]
    .map((source) => source?.contentHash ?? source?.content_hash ?? source?.sha256 ?? source?.hash)
    .filter((hash) => /^[a-f0-9]{64}$/i.test(String(hash ?? "")))
    .map((hash) => String(hash).toLowerCase());
}

export function buildDuplicateFingerprint(row = {}) {
  const org = normalizePosterOrg(row.source_org_name ?? row.org ?? row.site);
  const title = normalizePosterTitle(row.title, org);
  const sourceUrls = new Set(getSourceUrls(row).map(normalizeSourceUrl).filter(Boolean));
  const applicationUrls = new Set(getApplicationUrls(row).map(normalizeSourceUrl).filter(Boolean));
  const attachmentHashes = new Set(getAttachmentHashes(row));
  const images = new Set(getImages(row).map(normalizeImageIdentity).filter(Boolean));
  const deadline = normalizeDateKey(row.application_end_at ?? row.deadline);

  return {
    id: row.id ?? null,
    status: row.poster_status ?? null,
    title,
    org,
    deadline,
    sourceUrls,
    applicationUrls,
    attachmentHashes,
    images,
  };
}

export function scorePosterDuplicate(candidate = {}, existing = {}) {
  const candidateFp = buildDuplicateFingerprint(candidate);
  const existingFp = buildDuplicateFingerprint(existing);
  const matched = [];
  let score = 0;

  if ([...candidateFp.sourceUrls].some((url) => existingFp.sourceUrls.has(url))) {
    return {
      score: 100,
      decision: "merge",
      reason: "same-source-url",
      matched: ["source-url"],
      candidate: candidateFp,
      existing: existingFp,
    };
  }

  const imageMatched = [...candidateFp.images].some((image) => existingFp.images.has(image));
  if (imageMatched) {
    score += 95;
    matched.push("image");
  }

  const titleSimilarity = textSimilarity(candidateFp.title, existingFp.title);
  if (titleSimilarity >= 0.95) {
    score += 45;
    matched.push("title-exact");
  } else if (titleSimilarity >= 0.55) {
    score += Math.round(titleSimilarity * 45);
    matched.push(`title-${titleSimilarity.toFixed(2)}`);
  }

  const orgSimilarity = textSimilarity(candidateFp.org, existingFp.org);
  if (candidateFp.org && existingFp.org && orgSimilarity >= 0.9) {
    score += 20;
    matched.push("org");
  } else if (candidateFp.org && existingFp.org && orgSimilarity >= 0.65) {
    score += 10;
    matched.push(`org-${orgSimilarity.toFixed(2)}`);
  }

  if (candidateFp.deadline && existingFp.deadline && candidateFp.deadline === existingFp.deadline) {
    score += 20;
    matched.push("deadline");
  }

  const attachmentMatched = [...candidateFp.attachmentHashes]
    .some((hash) => existingFp.attachmentHashes.has(hash));
  if (attachmentMatched) {
    score += 70;
    matched.push("attachment-hash");
  }

  const applicationUrlMatched = [...candidateFp.applicationUrls]
    .some((url) => existingFp.applicationUrls.has(url));
  if (applicationUrlMatched) {
    score += 55;
    matched.push("application-url");
  }

  const canMerge =
    score >= 90 ||
    (titleSimilarity === 1 && candidateFp.title.length >= 8 && orgSimilarity >= 0.9) ||
    (score >= 85 && titleSimilarity >= 0.72 && (orgSimilarity >= 0.65 || matched.includes("deadline"))) ||
    (imageMatched && titleSimilarity >= 0.45) ||
    (attachmentMatched && titleSimilarity >= 0.45) ||
    (applicationUrlMatched && titleSimilarity >= 0.72 && orgSimilarity >= 0.65);
  const needsReview = !canMerge && score >= 65 && titleSimilarity >= 0.55;

  return {
    score,
    decision: canMerge ? "merge" : needsReview ? "review" : "none",
    reason: canMerge ? "high-confidence-duplicate" : needsReview ? "possible-duplicate" : "not-duplicate",
    matched,
    titleSimilarity,
    orgSimilarity,
    candidate: candidateFp,
    existing: existingFp,
  };
}

export function findBestPosterDuplicate(candidate = {}, existingRows = []) {
  let best = null;

  for (const row of existingRows) {
    if (candidate.id && row.id && candidate.id === row.id) continue;
    const scored = scorePosterDuplicate(candidate, row);
    if (!best || scored.score > best.score) {
      best = { ...scored, row };
    }
  }

  return best ?? { score: 0, decision: "none", reason: "no-candidates", matched: [], row: null };
}

export function duplicateIssueFromMatch(match) {
  if (!match || match.decision === "none") return null;
  const targetType = match.row?.duplicateTargetType === "notice_candidate" ? "notice_candidate" : "poster";
  const canAutoMerge = match.decision === "merge" && targetType === "poster";

  return {
    code: canAutoMerge ? "duplicate-auto-merge" : "duplicate-suspected",
    severity: canAutoMerge ? "medium" : "high",
    decision: "review",
    reason: canAutoMerge
      ? "same or highly similar notice already exists; source should be merged"
      : "similar existing notice found; confirm before publishing",
    evidence: `score ${match.score}; ${match.matched.join(", ")}; existing ${targetType} ${match.row?.id ?? ""}`.trim(),
    duplicateTargetType: targetType,
    duplicatePosterId: targetType === "poster" ? match.row?.id ?? null : null,
    duplicateCandidateId: targetType === "notice_candidate" ? match.row?.id ?? null : null,
    duplicateScore: match.score,
  };
}
