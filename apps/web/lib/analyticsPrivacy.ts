/** Shared by browser analytics and the existing visit endpoint. Never accept raw URLs. */
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const token = /^[a-z][a-z0-9_-]{0,79}$/i;
const sources = new Set([
  "chatgpt",
  "openai",
  "google",
  "naver",
  "bing",
  "facebook",
  "instagram",
  "kakao",
  "youtube",
  "newsletter",
  "direct",
]);
const mediums = new Set([
  "paid",
  "cpc",
  "ppc",
  "display",
  "social",
  "paid_social",
  "organic",
  "referral",
  "email",
  "none",
]);
export function safeCampaign(value: string | null) {
  return value &&
    token.test(value) &&
    !/\d{7}|token|password|secret|email/i.test(value)
    ? value
    : null;
}
export function campaignQuery(input: string | URLSearchParams) {
  const source = new URLSearchParams(input);
  const out = new URLSearchParams();
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ]) {
    // Ambiguous campaign values must not silently pick a platform/URL winner.
    if (source.getAll(key).length !== 1) continue;
    const value = safeCampaign(source.get(key));
    if (
      !value ||
      (key === "utm_source" && !sources.has(value.toLowerCase())) ||
      (key === "utm_medium" && !mediums.has(value.toLowerCase()))
    )
      continue;
    // Campaign/content/term are controlled campaign slugs, never free text search terms.
    if (["utm_campaign", "utm_term"].includes(key) && !value.startsWith("pl_"))
      continue;
    if (
      key === "utm_content" &&
      value !== "public_info_a" &&
      !value.startsWith("pl_") &&
      !/^[a-z]+_ad_[a-z0-9]+$/.test(value)
    )
      continue;
    out.set(key, value);
  }
  return out;
}
export function publicAnalyticsPath(path: string): string | null {
  if (
    [
      "/",
      "/posters",
      "/login",
      "/signup",
      "/onboarding",
      "/privacy",
      "/terms",
      "/institutions",
    ].includes(path)
  )
    return path;
  if (/^\/posters\/[0-9a-f-]{36}$/i.test(path) && UUID.test(path.split("/")[2]))
    return path;
  if (
    /^\/institutions\/[0-9a-f-]{36}$/i.test(path) &&
    UUID.test(path.split("/")[2])
  )
    return path;
  if (/^\/institutions\/(?!following$)[a-z][a-z0-9-]{0,79}$/.test(path))
    return path;
  if (
    /^\/(categories|regions)\/[a-z][a-z0-9-]{0,79}(\/[a-z][a-z0-9-]{0,79})?$/.test(
      path,
    )
  )
    return path;
  return null;
}
export function safeReferrer(value: string | null) {
  try {
    const url = new URL(value || "");
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const known = host.match(
      /(^|\.)(google\.(com|co\.kr|co\.jp|co\.uk|de|fr|ca|com\.au)|naver\.com|bing\.com|chatgpt\.com|openai\.com|facebook\.com|instagram\.com|youtube\.com|posterlink\.kr)$/,
    );
    return known ? `https://${known[2]}/` : null;
  } catch {
    return null;
  }
}
export function sanitizedVisitQuery(input: string | URLSearchParams) {
  const original = new URLSearchParams(input);
  // Own visit rows can include user_id. Account/campaign linkage has not been
  // approved; retain structural filters only, even if a caller forges a query.
  // GA uses campaignQuery independently after optional analytics consent.
  const result = new URLSearchParams();
  for (const key of ["category", "region", "sort", "includeClosed"]) {
    const value = original.get(key);
    if (value && /^[a-z0-9_-]{1,80}$/i.test(value) && !/\d{7}/.test(value))
      result.set(key, value);
  }
  return result.toString();
}
