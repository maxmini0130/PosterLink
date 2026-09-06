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

  const [categoryLinksRes, regionLinksRes, postersRes] = await Promise.all([
    supabase
      .from("poster_categories")
      .select("poster_id, category_id")
      .in("poster_id", ids),
    supabase
      .from("poster_regions")
      .select("poster_id, region_id")
      .in("poster_id", ids),
    supabase
      .from("posters")
      .select("id, field_verification")
      .in("id", ids),
  ]);

  const categoryLinks = categoryLinksRes.data ?? [];
  const regionLinks = regionLinksRes.data ?? [];

  const categoryIds = [...new Set(categoryLinks.map((link: any) => link.category_id).filter(Boolean))];
  const regionIds = [...new Set(regionLinks.map((link: any) => link.region_id).filter(Boolean))];

  const [cats, regs] = await Promise.all([
    categoryIds.length ? supabase.from("categories").select("id, name, code").in("id", categoryIds) : { data: [] },
    regionIds.length ? supabase.from("regions").select("id, name, full_name, level").in("id", regionIds) : { data: [] },
  ]);

  const catMap = Object.fromEntries((cats.data ?? []).map((c: any) => [c.id, c.name]));
  const catCodeMap = Object.fromEntries((cats.data ?? []).map((c: any) => [c.id, c.code]));
  const categoryRank = Object.fromEntries((cats.data ?? []).map((c: any) => [c.id, rankCategory(c)]));
  const regMap = Object.fromEntries((regs.data ?? []).map((r: any) => [r.id, r.level === "sigungu" ? r.full_name || r.name : r.name]));
  const regionRank = Object.fromEntries((regs.data ?? []).map((r: any) => [r.id, rankRegion(r)]));
  const categoryIdsByPoster = new Map<string, string[]>();
  const regionIdsByPoster = new Map<string, string[]>();
  const primaryCategoryCodeByPoster = new Map<string, string | null>();

  for (const link of categoryLinks as any[]) {
    categoryIdsByPoster.set(link.poster_id, [
      ...(categoryIdsByPoster.get(link.poster_id) ?? []),
      link.category_id,
    ]);
  }

  for (const link of regionLinks as any[]) {
    regionIdsByPoster.set(link.poster_id, [
      ...(regionIdsByPoster.get(link.poster_id) ?? []),
      link.region_id,
    ]);
  }

  for (const poster of postersRes.data ?? []) {
    primaryCategoryCodeByPoster.set(poster.id, readPrimaryCategoryCode(poster.field_verification));
  }

  const result: Record<string, PosterWithMeta> = {};
  for (const posterId of ids) {
    const categoryList = categoryIdsByPoster.get(posterId) ?? [];
    const regionList = regionIdsByPoster.get(posterId) ?? [];
    const categoryId = pickPrimaryCategoryId(
      categoryList,
      categoryRank,
      catCodeMap,
      primaryCategoryCodeByPoster.get(posterId),
    );
    const regionId = pickPrimaryId(regionList, regionRank);
    result[posterId] = {
      categoryId,
      regionId,
      categoryIds: categoryList,
      regionIds: regionList,
      categoryName: categoryId ? catMap[categoryId] ?? null : null,
      regionName: regionId ? regMap[regionId] ?? null : null,
    };
  }
  return result;
}

function readPrimaryCategoryCode(fieldVerification: any) {
  const code = String(fieldVerification?.classification?.primaryCategory ?? "").trim();
  return /^CAT_[A-Z_]+$/.test(code) ? code : null;
}

function pickPrimaryCategoryId(
  ids: string[],
  ranks: Record<string, number>,
  codes: Record<string, string>,
  primaryCode?: string | null,
) {
  if (primaryCode) {
    const matched = ids.find((id) => codes[id] === primaryCode);
    if (matched) return matched;
  }
  return pickPrimaryId(ids, ranks);
}

function pickPrimaryId(ids: string[], ranks: Record<string, number>) {
  return [...ids].sort((a, b) => (ranks[b] ?? 0) - (ranks[a] ?? 0))[0] ?? null;
}

function rankCategory(category: any) {
  const name = String(category?.name ?? "");
  const code = String(category?.code ?? "");
  if (name === "기타") return 0;
  return name === "湲고?" || /OTHER/i.test(code) ? 0 : 10;
}

function rankRegion(region: any) {
  if (region?.level === "sigungu") return 30;
  if (region?.level === "sido") return 20;
  return 10;
}

export async function fetchPosterImages(posterIds: string[]): Promise<Record<string, string[]>> {
  const ids = [...new Set(posterIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const { data } = await supabase
    .from("poster_images")
    .select("poster_id, storage_path, image_type, created_at")
    .in("poster_id", ids)
    .order("created_at", { ascending: true });

  const result: Record<string, string[]> = {};
  const images = [...(data ?? [])].sort((a: any, b: any) => {
    if (a.poster_id !== b.poster_id) return String(a.poster_id).localeCompare(String(b.poster_id));
    if (a.image_type === "thumbnail" && b.image_type !== "thumbnail") return -1;
    if (a.image_type !== "thumbnail" && b.image_type === "thumbnail") return 1;
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  });

  for (const image of images) {
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
