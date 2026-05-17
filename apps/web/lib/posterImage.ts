export function resolvePosterImageUrl(imageUrl?: string | null, sourceUrl?: string | null) {
  const value = imageUrl?.trim();
  if (!value) return null;

  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;

  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    try {
      return new URL(value, sourceUrl).href;
    } catch {
      return value;
    }
  }

  return value;
}

function normalizeImageIdentity(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    url.hash = "";

    for (const param of [
      "width",
      "height",
      "w",
      "h",
      "q",
      "quality",
      "resize",
      "thumb",
      "thumbnail",
      "cache",
    ]) {
      url.searchParams.delete(param);
    }

    return `${url.origin}${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return imageUrl.trim().toLowerCase();
  }
}

export function resolvePosterImageGallery(
  images: (string | null | undefined)[],
  thumbnailUrl?: string | null,
  sourceUrl?: string | null,
) {
  const resolvedImages = images
    .map((url) => resolvePosterImageUrl(url, sourceUrl))
    .filter((url): url is string => Boolean(url));
  const gallerySource = resolvedImages.length > 0
    ? resolvedImages
    : [resolvePosterImageUrl(thumbnailUrl, sourceUrl)].filter((url): url is string => Boolean(url));

  const seen = new Set<string>();
  return gallerySource.filter((url) => {
    const identity = normalizeImageIdentity(url);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
