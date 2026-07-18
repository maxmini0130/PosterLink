const DEFAULT_SITE_URL = "https://www.posterlink.kr";

export function getAppOrigin() {
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_SITE_URL;
  const appUrl = rawAppUrl.startsWith("http") ? rawAppUrl : `https://${rawAppUrl}`;

  try {
    const url = new URL(appUrl);
    if (url.hostname === "posterlink.kr") {
      url.hostname = "www.posterlink.kr";
    }
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}
