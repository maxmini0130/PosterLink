export interface PosterMetricCounts {
  linkClickCounts: Record<string, number>;
  favoriteCounts: Record<string, number>;
}

export async function fetchPosterMetricCounts(posterIds: string[]): Promise<PosterMetricCounts> {
  const ids = [...new Set(posterIds.filter(Boolean))];
  if (ids.length === 0) return { linkClickCounts: {}, favoriteCounts: {} };

  const params = new URLSearchParams();
  params.set("posterIds", ids.join(","));

  try {
    const response = await fetch(`/api/poster-link-clicks?${params.toString()}`);
    if (!response.ok) return { linkClickCounts: {}, favoriteCounts: {} };

    const data = await response.json() as {
      clickCounts?: Record<string, number>;
      favoriteCounts?: Record<string, number>;
      counts?: Record<string, number>;
    };
    return {
      linkClickCounts: data.clickCounts ?? data.counts ?? {},
      favoriteCounts: data.favoriteCounts ?? {},
    };
  } catch {
    return { linkClickCounts: {}, favoriteCounts: {} };
  }
}

export async function fetchPosterLinkClickCounts(posterIds: string[]): Promise<Record<string, number>> {
  const { linkClickCounts } = await fetchPosterMetricCounts(posterIds);
  return linkClickCounts;
}
