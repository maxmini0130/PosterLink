/**
 * Links the browser's anonymous visitor key to the signed-in account.
 * Dependencies are injected so the retry rules can be tested without Supabase.
 */

export type LinkResult = "linked" | "signup" | "pending";

type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type IdentityLinkerDeps = {
  /** Resolves the RPC result; rejects or returns error for transport/DB failures. */
  link(): Promise<{ data: unknown; error: unknown }>;
  local: KeyValueStore;
  session: KeyValueStore;
  now(): number;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Called once the link is stored, e.g. to clear the signup intent. */
  onLinked(): void;
};

export const IDENTITY_LINK_KEY = "pl.identity_link.v1";
export const LINK_RETRY_AT_KEY = "pl.identity_link_retry_at.v1";
/** Backoff after an RPC error, e.g. before the migration is applied. */
export const LINK_ERROR_BACKOFF_MS = 10 * 60 * 1000;
/** 'pending' means the profile row is not created yet; it usually appears within seconds. */
export const PENDING_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

export function createIdentityLinker(deps: IdentityLinkerDeps) {
  let inFlight: string | null = null;
  let retryUser: string | null = null;
  let retryAttempt = 0;
  let retryTimer: unknown = null;

  function cancelRetry() {
    if (retryTimer !== null) deps.clearTimer(retryTimer);
    retryTimer = null;
  }

  function backoff() {
    try {
      deps.session.setItem(
        LINK_RETRY_AT_KEY,
        String(deps.now() + LINK_ERROR_BACKOFF_MS),
      );
    } catch {
      /* storage blocked */
    }
  }

  function reset(userId: string | null) {
    cancelRetry();
    retryUser = userId;
    retryAttempt = 0;
  }

  async function sync(
    userId: string,
  ): Promise<LinkResult | "skipped" | "error"> {
    if (retryUser !== userId) reset(userId);
    // An explicit call (e.g. right after profile creation) supersedes a scheduled retry.
    cancelRetry();
    try {
      if (
        inFlight === userId ||
        deps.local.getItem(IDENTITY_LINK_KEY) === userId
      )
        return "skipped";
      if (Number(deps.session.getItem(LINK_RETRY_AT_KEY) ?? 0) > deps.now())
        return "skipped";
    } catch {
      return "skipped";
    }
    inFlight = userId;
    try {
      const { data, error } = await deps.link();
      if (retryUser !== userId) return "skipped"; // account changed while waiting
      if (error) {
        backoff();
        return "error";
      }
      if (data === "pending") {
        const delay = PENDING_RETRY_DELAYS_MS[retryAttempt];
        if (delay !== undefined) {
          retryAttempt += 1;
          retryTimer = deps.setTimer(() => {
            retryTimer = null;
            void sync(userId);
          }, delay);
        }
        return "pending";
      }
      if (data !== "linked" && data !== "signup") return "error";
      deps.local.setItem(IDENTITY_LINK_KEY, userId);
      reset(userId);
      deps.onLinked();
      return data;
    } catch {
      backoff();
      return "error";
    } finally {
      if (inFlight === userId) inFlight = null;
    }
  }

  return {
    sync,
    /** Stops retries for a signed-out session. */
    signOut() {
      reset(null);
    },
  };
}
