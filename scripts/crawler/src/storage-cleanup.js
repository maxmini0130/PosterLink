export const DEFAULT_POSTER_IMAGE_BUCKET = process.env.POSTER_IMAGE_BUCKET?.trim() || "poster-originals";

const REMOVE_CHUNK_SIZE = 100;

export function storagePathFromValue(value, bucket = DEFAULT_POSTER_IMAGE_BUCKET) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;

  try {
    const url = new URL(trimmed);
    const publicMarker = `/storage/v1/object/public/${bucket}/`;
    const signedMarker = `/storage/v1/object/sign/${bucket}/`;
    const marker = url.pathname.includes(publicMarker) ? publicMarker : signedMarker;
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) return null;
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return trimmed.replace(/^\/+/, "") || null;
  }
}

export function storagePathsFromValues(values, bucket = DEFAULT_POSTER_IMAGE_BUCKET) {
  return [
    ...new Set(
      values
        .map((value) => storagePathFromValue(value, bucket))
        .filter(Boolean),
    ),
  ];
}

export async function removeStoragePaths(supabase, paths, options = {}) {
  const bucket = options.bucket ?? DEFAULT_POSTER_IMAGE_BUCKET;
  const dryRun = options.dryRun ?? false;
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  let removed = 0;

  for (let index = 0; index < uniquePaths.length; index += REMOVE_CHUNK_SIZE) {
    const chunk = uniquePaths.slice(index, index + REMOVE_CHUNK_SIZE);
    if (dryRun) {
      removed += chunk.length;
      continue;
    }

    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) throw error;
    removed += chunk.length;
  }

  return removed;
}

export async function fetchPosterStoragePaths(supabase, posterIds, options = {}) {
  const bucket = options.bucket ?? DEFAULT_POSTER_IMAGE_BUCKET;
  const ids = [...new Set(posterIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("posters")
    .select("thumbnail_url, poster_images(storage_path)")
    .in("id", ids);
  if (error) throw error;

  return storagePathsFromValues(
    (data ?? []).flatMap((poster) => [
      poster.thumbnail_url,
      ...((poster.poster_images ?? []).map((image) => image.storage_path)),
    ]),
    bucket,
  );
}

export async function deletePostersWithStorage(supabase, posterIds, options = {}) {
  const bucket = options.bucket ?? DEFAULT_POSTER_IMAGE_BUCKET;
  const dryRun = options.dryRun ?? false;
  const status = options.status;
  const ids = [...new Set(posterIds.filter(Boolean))];
  if (ids.length === 0) return { deletedRows: 0, deletedStorageObjects: 0 };

  const storagePaths = await fetchPosterStoragePaths(supabase, ids, { bucket });
  const deletedStorageObjects = await removeStoragePaths(supabase, storagePaths, { bucket, dryRun });

  if (dryRun) {
    return { deletedRows: ids.length, deletedStorageObjects };
  }

  let query = supabase.from("posters").delete({ count: "exact" }).in("id", ids);
  if (status) query = query.eq("poster_status", status);
  const { count, error } = await query;
  if (error) throw error;

  return { deletedRows: count ?? ids.length, deletedStorageObjects };
}

export async function replacePosterImagesWithStorageCleanup(supabase, posterId, nextImageUrls, options = {}) {
  const bucket = options.bucket ?? DEFAULT_POSTER_IMAGE_BUCKET;
  const dryRun = options.dryRun ?? false;
  const nextStoragePaths = storagePathsFromValues(nextImageUrls, bucket);

  const { data: existingRows, error: selectError } = await supabase
    .from("poster_images")
    .select("storage_path")
    .eq("poster_id", posterId);
  if (selectError) throw selectError;

  const previousStoragePaths = storagePathsFromValues(
    (existingRows ?? []).map((row) => row.storage_path),
    bucket,
  );
  const pathsToRemove = previousStoragePaths.filter((path) => !nextStoragePaths.includes(path));
  const deletedStorageObjects = await removeStoragePaths(supabase, pathsToRemove, { bucket, dryRun });

  if (dryRun) return { deletedStorageObjects };

  const { error: deleteError } = await supabase
    .from("poster_images")
    .delete()
    .eq("poster_id", posterId);
  if (deleteError) throw deleteError;

  if (nextImageUrls.length > 0) {
    const { error } = await supabase.from("poster_images").insert(
      nextImageUrls.map((url, index) => ({
        poster_id: posterId,
        storage_path: url,
        image_type: index === 0 ? "thumbnail" : "original",
      })),
    );
    if (error) throw error;
  }

  return { deletedStorageObjects };
}
