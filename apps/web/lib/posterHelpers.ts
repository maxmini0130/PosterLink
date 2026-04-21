import { supabase } from "./supabase";

export interface PosterWithMeta {
  categoryName: string | null;
  regionName: string | null;
}

export async function fetchCategoryRegionNames(posterIds: string[]): Promise<Record<string, PosterWithMeta>> {
  if (posterIds.length === 0) return {};

  const { data: posters } = await supabase
    .from("posters")
    .select("id, category_id, primary_region_id")
    .in("id", posterIds);

  if (!posters || posters.length === 0) return {};

  const categoryIds = [...new Set(posters.map((p: any) => p.category_id).filter(Boolean))];
  const regionIds = [...new Set(posters.map((p: any) => p.primary_region_id).filter(Boolean))];

  const [cats, regs] = await Promise.all([
    categoryIds.length ? supabase.from("categories").select("id, name").in("id", categoryIds) : { data: [] },
    regionIds.length ? supabase.from("regions").select("id, name").in("id", regionIds) : { data: [] },
  ]);

  const catMap = Object.fromEntries((cats.data ?? []).map((c: any) => [c.id, c.name]));
  const regMap = Object.fromEntries((regs.data ?? []).map((r: any) => [r.id, r.name]));

  const result: Record<string, PosterWithMeta> = {};
  for (const poster of posters) {
    result[poster.id] = {
      categoryName: poster.category_id ? catMap[poster.category_id] ?? null : null,
      regionName: poster.primary_region_id ? regMap[poster.primary_region_id] ?? null : null,
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
