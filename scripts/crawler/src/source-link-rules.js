const APPLICATION_HOST_PATTERNS = [
  /^forms\.gle$/i,
  /(^|\.)form\.naver\.com$/i,
  /(^|\.)forms?\.office\.com$/i,
  /(^|\.)typeform\.com$/i,
  /(^|\.)tally\.so$/i,
];

const APPLICATION_PATH_PATTERNS = [
  /^\/forms(?:\/|$)/i,
  /\/viewform(?:\/|$|\?)/i,
  /\/(?:apply|application|register|registration|signup|reservation|booking)(?:\/|$)/i,
];

const APPLICATION_LABEL_PATTERN =
  /\uC2E0\uCCAD|\uC811\uC218|\uC9C0\uC6D0(?:\uD558\uAE30|\s*\uC2E0\uCCAD|\uC11C|\s*\uC811\uC218)|\uC751\uBAA8|\uB4F1\uB85D|\uC608\uC57D|apply|application|register|registration|sign[\s-]?up|booking/i;

export function isLikelyApplicationLink(value, label = "") {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (APPLICATION_LABEL_PATTERN.test(String(label ?? ""))) return true;

  try {
    const url = new URL(text);
    if (
      APPLICATION_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))
    ) {
      return true;
    }
    if (
      /^docs\.google\.com$/i.test(url.hostname) &&
      /^\/forms(?:\/|$)/i.test(url.pathname)
    ) {
      return true;
    }
    return APPLICATION_PATH_PATTERNS.some((pattern) =>
      pattern.test(`${url.pathname}${url.search}`),
    );
  } catch {
    return false;
  }
}

export function inferPosterLinkType(declaredType, value, label = "") {
  if (isLikelyApplicationLink(value, label)) return "official_apply";
  if (declaredType && declaredType !== "other") return declaredType;
  return "other";
}

export function resolveCanonicalSource(post = {}) {
  const listUrl = String(post.url ?? "").trim();
  const resolvedUrl = String(post.sourceUrl ?? listUrl).trim();
  const canFallBackToList =
    listUrl &&
    !isLikelyApplicationLink(listUrl) &&
    isLikelyApplicationLink(resolvedUrl);

  if (!canFallBackToList) {
    return {
      sourceUrl: resolvedUrl || listUrl || null,
      derivedLinks: [],
      replacedApplicationSource: false,
    };
  }

  return {
    sourceUrl: listUrl,
    derivedLinks: [
      {
        link_type: "official_apply",
        title: "\uACF5\uC2DD \uC2E0\uCCAD \uB9C1\uD06C",
        url: resolvedUrl,
        is_primary: true,
      },
    ],
    replacedApplicationSource: true,
  };
}
