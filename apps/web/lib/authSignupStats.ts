/** Auth account creation metrics, never profile/login/analytics events. */
export type SignupAccount = { id: string; created_at: string };
export type SignupStats = {
  asOf: string;
  observedFrom: string;
  observedTo: string;
  timezone: "Asia/Seoul";
  totalAccounts: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  daily: { date: string; count: number }[];
};
type AuthPage = {
  users: SignupAccount[];
  total: number;
  nextPage: number | null;
};
export class SignupStatsError extends Error {
  constructor(public status: number) {
    super("Signup statistics unavailable");
  }
}
const DAY = 86400000;
const KST = 9 * 3600000;

export function aggregateSignupAccounts(
  accounts: SignupAccount[],
  now: Date,
  observedFrom = now.toISOString(),
): SignupStats {
  const end = now.getTime();
  if (!Number.isFinite(end)) throw new SignupStatsError(503);
  const local = new Date(end + KST);
  const today =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    KST;
  const week = today - ((local.getUTCDay() + 6) % 7) * DAY;
  const month = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - KST;
  const daily = Array.from({ length: 31 }, (_, i) => ({
    date: new Date(today - (30 - i) * DAY + KST).toISOString().slice(0, 10),
    count: 0,
  }));
  const seen = new Map<string, number>();
  let todayCount = 0,
    weekCount = 0,
    monthCount = 0;
  for (const account of accounts) {
    const at = Date.parse(account.created_at);
    if (!account.id || !Number.isFinite(at)) throw new SignupStatsError(503);
    if (seen.has(account.id)) {
      if (seen.get(account.id) !== at) throw new SignupStatsError(503);
      continue;
    }
    seen.set(account.id, at);
    if (at >= end) continue;
    if (at >= today) todayCount++;
    if (at >= week) weekCount++;
    if (at >= month) monthCount++;
    const index = Math.floor((at - (today - 30 * DAY)) / DAY);
    if (index >= 0 && index < daily.length) daily[index].count++;
  }
  return {
    asOf: now.toISOString(),
    observedFrom,
    observedTo: now.toISOString(),
    timezone: "Asia/Seoul",
    totalAccounts: [...seen.values()].filter((at) => at < end).length,
    today: todayCount,
    thisWeek: weekCount,
    thisMonth: monthCount,
    daily,
  };
}

/** The privileged reader is never called before a fresh server-side role check. */
export async function readAuthorizedSignupStats(deps: {
  actor: () => Promise<{ role: string | null } | null>;
  page: (page: number, perPage: number) => Promise<AuthPage>;
  now?: () => Date;
}): Promise<SignupStats> {
  const actor = await deps.actor();
  if (!actor) throw new SignupStatsError(401);
  // Same scope as the existing Auth member administration API.
  if (actor.role !== "super_admin") throw new SignupStatsError(403);
  const now = deps.now ?? (() => new Date());
  const start = now();
  const accounts: SignupAccount[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  for (let page = 1; page <= 50; page++) {
    const data = await deps.page(page, 1000);
    if (
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      data.total > 50000
    )
      throw new SignupStatsError(503);
    total ??= data.total;
    if (total !== data.total || data.users.length > 1000)
      throw new SignupStatsError(503);
    for (const user of data.users) {
      // Overlapping pages indicate a moving/incomplete scan, not extra signups.
      if (ids.has(user.id)) throw new SignupStatsError(503);
      ids.add(user.id);
      accounts.push({ id: user.id, created_at: user.created_at });
    }
    if (data.nextPage === null) {
      if (accounts.length !== total) throw new SignupStatsError(503);
      // Detect changes during pagination; never silently return a truncated count.
      const check = await deps.page(1, 1);
      if (check.total !== total) throw new SignupStatsError(503);
      return {
        ...aggregateSignupAccounts(accounts, start),
        observedTo: now().toISOString(),
      };
    }
    if (data.nextPage !== page + 1 || data.users.length === 0)
      throw new SignupStatsError(503);
  }
  throw new SignupStatsError(503);
}
