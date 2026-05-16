import { supabase } from "./supabase";

export interface PosterWithMeta {
  categoryId: string | null;
  regionId: string | null;
  categoryIds: string[];
  regionIds: string[];
  categoryName: string | null;
  regionName: string | null;
}

export async function fetchCategoryRegionNames(posterIds: string[]): Promise<Record<string, PosterWithMeta>> {
  const ids = [...new Set(posterIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const [categoryLinksRes, regionLinksRes] = await Promise.all([
    supabase
      .from("poster_categories")
      .select("poster_id, category_id")
      .in("poster_id", ids),
    supabase
      .from("poster_regions")
      .select("poster_id, region_id")
      .in("poster_id", ids),
  ]);

  const categoryLinks = categoryLinksRes.data ?? [];
  const regionLinks = regionLinksRes.data ?? [];

  const categoryIds = [...new Set(categoryLinks.map((link: any) => link.category_id).filter(Boolean))];
  const regionIds = [...new Set(regionLinks.map((link: any) => link.region_id).filter(Boolean))];

  const [cats, regs] = await Promise.all([
    categoryIds.length ? supabase.from("categories").select("id, name").in("id", categoryIds) : { data: [] },
    regionIds.length ? supabase.from("regions").select("id, name").in("id", regionIds) : { data: [] },
  ]);

  const catMap = Object.fromEntries((cats.data ?? []).map((c: any) => [c.id, c.name]));
  const regMap = Object.fromEntries((regs.data ?? []).map((r: any) => [r.id, r.name]));
  const firstCategoryByPoster = new Map<string, string>();
  const firstRegionByPoster = new Map<string, string>();
  const categoryIdsByPoster = new Map<string, string[]>();
  const regionIdsByPoster = new Map<string, string[]>();

  for (const link of categoryLinks as any[]) {
    if (!firstCategoryByPoster.has(link.poster_id)) {
      firstCategoryByPoster.set(link.poster_id, link.category_id);
    }
    categoryIdsByPoster.set(link.poster_id, [
      ...(categoryIdsByPoster.get(link.poster_id) ?? []),
      link.category_id,
    ]);
  }

  for (const link of regionLinks as any[]) {
    if (!firstRegionByPoster.has(link.poster_id)) {
      firstRegionByPoster.set(link.poster_id, link.region_id);
    }
    regionIdsByPoster.set(link.poster_id, [
      ...(regionIdsByPoster.get(link.poster_id) ?? []),
      link.region_id,
    ]);
  }

  const result: Record<string, PosterWithMeta> = {};
  for (const posterId of ids) {
    const categoryId = firstCategoryByPoster.get(posterId) ?? null;
    const regionId = firstRegionByPoster.get(posterId) ?? null;
    result[posterId] = {
      categoryId,
      regionId,
      categoryIds: categoryIdsByPoster.get(posterId) ?? [],
      regionIds: regionIdsByPoster.get(posterId) ?? [],
      categoryName: categoryId ? catMap[categoryId] ?? null : null,
      regionName: regionId ? regMap[regionId] ?? null : null,
    };
  }
  return result;
}

export async function fetchPosterImages(posterIds: string[]): Promise<Record<string, string[]>> {
  const ids = [...new Set(posterIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const { data } = await supabase
    .from("poster_images")
    .select("poster_id, storage_path, created_at")
    .in("poster_id", ids)
    .order("created_at", { ascending: true });

  const result: Record<string, string[]> = {};
  for (const image of data ?? []) {
    if (!image.poster_id || !image.storage_path) continue;
    result[image.poster_id] = [...(result[image.poster_id] ?? []), image.storage_path];
  }
  return result;
}

export async function fetchProfileMap(userIds: string[]): Promise<Record<string, { nickname: string }>> {
  if (userIds.length === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id, nickname")
    .in("id", [...new Set(userIds)]);
  return Object.fromEntries((data ?? []).map((p: any) => [p.id, p]));
}
