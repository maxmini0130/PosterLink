export async function fetchPosterLinkClickCounts(posterIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(posterIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const params = new URLSearchParams();
  params.set("posterIds", ids.join(","));

  try {
    const response = await fetch(`/api/poster-link-clicks?${params.toString()}`);
    if (!response.ok) return {};

    const data = await response.json() as { counts?: Record<string, number> };
    return data.counts ?? {};
  } catch {
    return {};
  }
}
