import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Pure helpers for Naver sign-in (docs/NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md,
 * option B). Server only: they read key material passed in by the caller.
 */

/** Transaction cookie: `<transaction id>.<browser secret>`, only under /auth/naver. */
export const NAVER_TX_COOKIE = "pl_naver_tx";
/** Where to go after a successful sign-in (validated again when read). */
export const NAVER_NEXT_COOKIE = "pl_naver_next";
export const NAVER_COOKIE_PATH = "/auth/naver";
export const NAVER_TX_TTL_SECONDS = 30 * 60;
/** Linking or unlinking needs a sign-in to PosterLink at most this long ago. */
export const RECENT_AUTH_MS = 10 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const MIN_KEY_LENGTH = 32;

export type NaverEnv = Record<string, string | undefined>;
export type HashKey = { version: number; key: string };

/** The server switch. Anything but "true" keeps every Naver route at 503. */
export function naverEnabled(env: NaverEnv) {
  return env.NAVER_LOGIN_ENABLED === "true";
}

/**
 * Hash keys NAVER_ID_HASH_KEY_V1..V9 present in the environment. A key that
 * is too short is an error, so a typo never silently produces weak hashes.
 */
export function parseHashKeys(env: NaverEnv): HashKey[] {
  const keys: HashKey[] = [];
  for (let version = 1; version <= 9; version++) {
    const key = env[`NAVER_ID_HASH_KEY_V${version}`];
    if (key === undefined || key === "") continue;
    if (key.length < MIN_KEY_LENGTH)
      throw new Error(`NAVER_ID_HASH_KEY_V${version} is too short`);
    keys.push({ version, key });
  }
  return keys;
}

/** {"1": hash, "2": hash}: the Naver ID under every key this server has. */
export function naverIdHashes(naverId: string, keys: HashKey[]) {
  if (!naverId) throw new Error("empty Naver id");
  return Object.fromEntries(
    keys.map(({ version, key }) => [
      String(version),
      createHmac("sha256", key).update(`naver:${naverId}`).digest("hex"),
    ]),
  );
}

export const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** 32 random bytes, URL-safe (43 characters). */
export const newSecret = () => randomBytes(32).toString("base64url");

export function encodeTxCookie(id: string, secret: string) {
  return `${id}.${secret}`;
}

export function parseTxCookie(value: string | undefined | null) {
  if (!value) return null;
  const dot = value.indexOf(".");
  const id = value.slice(0, dot);
  const secret = value.slice(dot + 1);
  if (dot < 0 || !UUID.test(id) || !SECRET.test(secret)) return null;
  return { id, secret };
}

/**
 * When the member last signed in to PosterLink, from the access token's
 * `amr` claim (method timestamps in seconds). Token refreshes do not count.
 */
export function lastSignInAt(claims: unknown): number | null {
  const amr = (claims as { amr?: unknown } | null)?.amr;
  if (!Array.isArray(amr)) return null;
  const times = amr
    .map((entry) => (entry as { timestamp?: unknown })?.timestamp)
    .filter((time): time is number => typeof time === "number" && time > 0);
  return times.length ? Math.max(...times) * 1000 : null;
}

export function isRecentSignIn(signedInAt: number | null, now: number) {
  return (
    signedInAt !== null &&
    signedInAt <= now + 60 * 1000 &&
    now - signedInAt <= RECENT_AUTH_MS
  );
}

/** Naver's response.id: printable, bounded. Anything else is rejected. */
export function validNaverId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[\x21-\x7e]+$/.test(value)
  );
}

/**
 * The client address as the platform reports it (Vercel sets the first
 * x-forwarded-for entry), or "unknown". Used only for the start rate limit.
 */
export function clientAddress(headers: { get(name: string): string | null }) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Keyed hash of the client address, so the database never stores the address. */
export function clientKey(address: string, keys: HashKey[]) {
  const key = keys[keys.length - 1]?.key;
  if (!key) throw new Error("no hash key");
  return createHmac("sha256", key).update(`client:${address}`).digest("hex");
}

/** Same-origin check for state-changing POSTs (CSRF), from Origin or Referer. */
export function sameOrigin(
  headers: { get(name: string): string | null },
  origin: string,
) {
  const source = headers.get("origin") ?? headers.get("referer");
  if (!source) return false;
  try {
    return new URL(source).origin === origin;
  } catch {
    return false;
  }
}
