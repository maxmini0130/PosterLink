export function getRegionLabel(region: any) {
  if (!region) return "";
  if (region.level === "sigungu") return region.full_name || region.name;
  return region.name;
}

export function getCityRegions(regions: any[]) {
  return regions.filter((region) => region.level === "nation" || region.level === "sido");
}

export function getDistrictRegions(regions: any[], cityId: string | null) {
  if (!cityId) return [];
  return regions.filter((region) => region.level === "sigungu" && region.parent_id === cityId);
}

export function getSelectedCityId(regionId: string | null, regions: any[]) {
  if (!regionId) return "";
  const region = regions.find((item) => item.id === regionId);
  if (!region) return "";
  return region.level === "sigungu" ? region.parent_id || "" : region.id;
}

export function getSelectedDistrictId(regionId: string | null, regions: any[]) {
  if (!regionId) return "";
  const region = regions.find((item) => item.id === regionId);
  return region?.level === "sigungu" ? region.id : "";
}

export function getRegionScopeIds(regionId: string | null, regionList: any[]) {
  if (!regionId) return null;

  const selected = regionList.find((region) => region.id === regionId);
  if (!selected || selected.level === "nation") return null;

  const ids = new Set<string>([regionId]);
  for (const region of regionList) {
    if (region.parent_id === regionId) ids.add(region.id);
  }

  let parentId = selected.parent_id;
  while (parentId) {
    ids.add(parentId);
    parentId = regionList.find((region) => region.id === parentId)?.parent_id ?? null;
  }

  return ids;
}
