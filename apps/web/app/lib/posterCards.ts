"use client";

import type { PlPosterCardData } from "../components/pl/PosterListCard";
import { fetchCategoryRegionNames } from "./posterHelpers";
import { supabase } from "./supabase";
import {
  loadPosterImageMetadata,
  metadataForUrl,
} from "../../lib/posterImageMetadata";
import {
  deadlineVerificationFromRow,
  withDeadlineColumns,
  type DeadlineVerificationRow,
} from "../../lib/posterDeadlineFields";

const CARD_SELECT =
  "id,title,source_org_name,organizer_name,application_start_at,application_end_at,deadline_type,event_end_at,thumbnail_url,source_key,poster_status";

type CardRow = DeadlineVerificationRow & {
  id: string;
  title: string;
  source_org_name: string | null;
  organizer_name: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  deadline_type: string | null;
  event_end_at: string | null;
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
    .select(await withDeadlineColumns(supabase, CARD_SELECT))
    .in("id", posterIds)
    .returns<CardRow[]>();
  if (error) return null;
  const rows = new Map(((data ?? []) as CardRow[]).map((row) => [row.id, row]));
  const images = await loadPosterImageMetadata(supabase, [...rows.keys()]);
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
        org: row.organizer_name || undefined,
        applicationStartAt: row.application_start_at,
        deadline: row.application_end_at ?? undefined,
        deadlineType: row.deadline_type,
        eventEndAt: row.event_end_at,
        ...metadataForUrl(images.get(id), row.thumbnail_url),
        regionLabel: names?.regionName,
        tags: [names?.categoryName, names?.regionName].filter(
          (value): value is string => Boolean(value),
        ),
        image: row.thumbnail_url ?? undefined,
        sourceUrl: row.source_key ?? undefined,
        posterStatus: row.poster_status,
        deadlineVerification: deadlineVerificationFromRow(row),
      },
    ];
  });
}
