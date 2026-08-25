export const PUBLIC_POSTER_EXPOSURE_FILTER = "exposure_tier.is.null,exposure_tier.in.(A,B)";

export function isPublicExposureTier(value: unknown) {
  return value === null || value === undefined || value === "A" || value === "B";
}
