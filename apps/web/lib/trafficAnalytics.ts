const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  return (
    !isAutomated &&
    (actorType === "visitor" || actorType === "member")
  );
}
