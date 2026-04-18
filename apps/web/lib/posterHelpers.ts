import { supabase } from "./supabase";

export interface PosterWithMeta {
  categoryName: string | null;
  regionName: string | null;
}

export async function fetchCategoryRegionNames(posterIds: string[]): Promise<Record<string, PosterWithMeta>> {
  if (posterIds.length === 0) return {};

  const [catLinks, regLinks] = await Promise.all([
    supabase.from("poster_categories").select("poster_id, category_id").in("poster_id", posterIds),
    supabase.from("poster_regions").select("poster_id, region_id").in("poster_id", posterIds),
  ]);

  const categoryIds = [...new Set((catLinks.data ?? []).map((r: any) => r.category_id))];
  const regionIds = [...new Set((regLinks.data ?? []).map((r: any) => r.region_id))];

  const [cats, regs] = await Promise.all([
    categoryIds.length ? supabase.from("categories").select("id, name").in("id", categoryIds) : { data: [] },
    regionIds.length ? supabase.from("regions").select("id, name").in("id", regionIds) : { data: [] },
  ]);

  const catMap = Object.fromEntries((cats.data ?? []).map((c: any) => [c.id, c.name]));
  const regMap = Object.fromEntries((regs.data ?? []).map((r: any) => [r.id, r.name]));
  const posterCatMap = Object.fromEntries((catLinks.data ?? []).map((r: any) => [r.poster_id, catMap[r.category_id]]));
  const posterRegMap = Object.fromEntries((regLinks.data ?? []).map((r: any) => [r.poster_id, regMap[r.region_id]]));

  const result: Record<string, PosterWithMeta> = {};
  for (const id of posterIds) {
    result[id] = {
      categoryName: posterCatMap[id] ?? null,
      regionName: posterRegMap[id] ?? null,
    };
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
