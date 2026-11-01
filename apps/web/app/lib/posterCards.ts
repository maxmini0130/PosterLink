"use client";

import type { PlPosterCardData } from "../components/pl/PosterListCard";
import { fetchCategoryRegionNames } from "./posterHelpers";
import { supabase } from "./supabase";

const CARD_SELECT =
  "id,title,source_org_name,application_start_at,application_end_at,deadline_type,thumbnail_url,source_key,poster_status";

type CardRow = {
  id: string;
  title: string;
  source_org_name: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  deadline_type: string | null;
  thumbnail_url: string | null;
  source_key: string | null;
  poster_status: string | null;
};

/**
 * Card data for these poster ids, in the given order. Posters that are not
 * public (hidden, deleted) are left out; null when the lookup fails.
 */
export async function loadPosterCards(
  posterIds: string[],
): Promise<PlPosterCardData[] | null> {
  if (posterIds.length === 0) return [];
  const { data, error } = await supabase
    .from("posters")
    .select(CARD_SELECT)
    .in("id", posterIds);
  if (error) return null;
  const rows = new Map(((data ?? []) as CardRow[]).map((row) => [row.id, row]));
  const meta = await fetchCategoryRegionNames([...rows.keys()]).catch(
    () => ({}) as Record<string, never>,
  );
  return posterIds.flatMap((id) => {
    const row = rows.get(id);
    if (!row) return [];
    const names = (
      meta as Record<
        string,
        { categoryName?: string | null; regionName?: string | null }
      >
    )[id];
    return [
      {
        id: row.id,
        title: row.title,
        org: row.source_org_name ?? undefined,
        applicationStartAt: row.application_start_at,
        deadline: row.application_end_at ?? undefined,
        deadlineType: row.deadline_type,
        tags: [names?.categoryName, names?.regionName].filter(
          (value): value is string => Boolean(value),
        ),
        image: row.thumbnail_url ?? undefined,
        sourceUrl: row.source_key ?? undefined,
        posterStatus: row.poster_status,
      },
    ];
  });
}
