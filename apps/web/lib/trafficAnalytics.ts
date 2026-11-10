const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A referrer identifies an observed source, never proof of typed/bookmarked entry. */
export function getTrafficSourceLabel(
  row: { utm_source: string | null; referrer_host: string | null },
  ownHosts: Set<string>,
) {
  if (row.utm_source?.trim()) return row.utm_source.trim();
  const host = (row.referrer_host ?? "").toLowerCase().replace(/^www\./, "");
  if (!host) return "출처 미확인";
  if (ownHosts.has(host)) return "사이트 내부 이동";
  const matches = (domain: string) =>
    host === domain || host.endsWith(`.${domain}`);
  if (
    [
      "google.com",
      "google.co.kr",
      "google.co.jp",
      "google.co.uk",
      "google.de",
      "google.fr",
      "google.ca",
      "google.com.au",
    ].some(matches)
  )
    return "Google";
  if (matches("naver.com")) return "Naver";
  if (["daum.net", "kakao.com"].some(matches)) return "Daum/Kakao";
  if (matches("instagram.com")) return "Instagram";
  if (["facebook.com", "fb.com"].some(matches)) return "Facebook";
  if (["threads.net", "threads.com"].some(matches)) return "Threads";
  if (["x.com", "twitter.com"].some(matches)) return "X/Twitter";
  if (matches("youtube.com")) return "YouTube";
  return host;
}

export function getTrafficPeriodStart(days: number, now = new Date()) {
  const safeDays = Math.max(1, Math.floor(days));
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const todayStartUtc =
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate(),
    ) - KST_OFFSET_MS;

  return new Date(todayStartUtc - (safeDays - 1) * DAY_MS).toISOString();
}

export function isExternalHumanTraffic(
  actorType: string,
  isAutomated: boolean,
) {
  return !isAutomated && (actorType === "visitor" || actorType === "member");
}
