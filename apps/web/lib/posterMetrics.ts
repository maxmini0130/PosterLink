export interface PosterMetricCounts {
  viewCounts: Record<string, number>;
  linkClickCounts: Record<string, number>;
  favoriteCounts: Record<string, number>;
}

export async function fetchPosterMetricCounts(posterIds: string[]): Promise<PosterMetricCounts> {
  const ids = [...new Set(posterIds.filter(Boolean))];
  if (ids.length === 0) return { viewCounts: {}, linkClickCounts: {}, favoriteCounts: {} };

  const params = new URLSearchParams();
  params.set("posterIds", ids.join(","));

  try {
    const response = await fetch(`/api/poster-link-clicks?${params.toString()}`);
    if (!response.ok) return { viewCounts: {}, linkClickCounts: {}, favoriteCounts: {} };

    const data = await response.json() as {
      viewCounts?: Record<string, number>;
      clickCounts?: Record<string, number>;
      favoriteCounts?: Record<string, number>;
      counts?: Record<string, number>;
    };
    return {
      viewCounts: data.viewCounts ?? {},
      linkClickCounts: data.clickCounts ?? data.counts ?? {},
      favoriteCounts: data.favoriteCounts ?? {},
    };
  } catch {
    return { viewCounts: {}, linkClickCounts: {}, favoriteCounts: {} };
  }
}

export async function logPosterView(posterId: string): Promise<boolean> {
  const storageKey = `poster_view_logged:${posterId}`;
  const now = Date.now();

  try {
    const previousLoggedAt = Number(localStorage.getItem(storageKey) ?? 0);
    if (previousLoggedAt && now - previousLoggedAt < 1000 * 60 * 30) {
      return false;
    }

    let visitorKey = localStorage.getItem("posterlink_visitor_key");
    if (!visitorKey) {
      visitorKey = crypto.randomUUID();
      localStorage.setItem("posterlink_visitor_key", visitorKey);
    }

    localStorage.setItem(storageKey, String(now));
    const body = JSON.stringify({
      poster_id: posterId,
      visitor_key: visitorKey,
      referrer_path: window.location.pathname,
    });

    const response = await fetch("/api/poster-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });

    if (!response.ok) {
      localStorage.removeItem(storageKey);
      return false;
    }

    return true;
  } catch {
    localStorage.removeItem(storageKey);
    return false;
  }
}

export async function fetchPosterLinkClickCounts(posterIds: string[]): Promise<Record<string, number>> {
  const { linkClickCounts } = await fetchPosterMetricCounts(posterIds);
  return linkClickCounts;
}
