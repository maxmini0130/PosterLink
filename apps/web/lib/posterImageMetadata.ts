import type { SupabaseClient } from "@supabase/supabase-js";
import { imageMetadata } from "./feedImages";

/** * keeps old databases working before the optional metadata migration. */
export async function loadPosterImageMetadata(
  client: SupabaseClient,
  ids: string[],
) {
  const result = new Map<string, Array<Record<string, unknown>>>();
  if (!ids.length) return result;
  const { data, error } = await client
    .from("poster_images")
    .select("*")
    .in("poster_id", ids);
  if (error) return result;
  for (const image of data ?? []) {
    const values = result.get(image.poster_id) ?? [];
    values.push(image);
    result.set(image.poster_id, values);
  }
  return result;
}
export function metadataForUrl(
  images: Array<Record<string, unknown>> | undefined,
  url?: string | null,
) {
  return imageMetadata(images?.find((i) => i.storage_path === url));
}
