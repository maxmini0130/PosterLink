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
