import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The only place the Naver sign-in uses the service role key
 * (docs/NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md 5-11, approved 2026-11-01).
 * Allowed: the naver_* SECURITY DEFINER functions, and three Auth calls —
 * getUserById and generateLink (magiclink, never e-mailed); createUser comes
 * with the e-mail flows.
 * Only /auth/naver/* routes may import this module (checked by a test).
 * Nothing here logs e-mail addresses, Naver ids, hashes, tokens or links.
 */

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const options = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

function admin(): SupabaseClient {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    options,
  );
}

async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const { data, error } = await admin().rpc(name, args);
  if (error) {
    console.error("naver rpc failed", { name, code: error.code });
    return null;
  }
  return data as T;
}

export const naverDb = {
  start: (
    purpose: "login" | "link_session",
    secretHash: string,
    stateHash: string,
    sessionUserId: string | null,
  ) =>
    rpc<string>("naver_tx_start", {
      p_purpose: purpose,
      p_browser_secret_hash: secretHash,
      p_oauth_state_hash: stateHash,
      p_session_user_id: sessionUserId,
      p_parent_id: null,
    }),
  callback: async (
    id: string,
    secretHash: string,
    stateHash: string,
    hashes: Record<string, string>,
  ) => {
    const rows = await rpc<
      Array<{
        purpose: string;
        flow: string | null;
        target_user_id: string | null;
      }>
    >("naver_tx_callback", {
      p_id: id,
      p_secret_hash: secretHash,
      p_state_hash: stateHash,
      p_hashes: hashes,
    });
    return rows?.[0] ?? null;
  },
  completeLogin: (id: string, secretHash: string, userId: string) =>
    rpc<boolean>("naver_tx_complete_login", {
      p_id: id,
      p_secret_hash: secretHash,
      p_user_id: userId,
    }),
  fail: (id: string, secretHash: string) =>
    rpc<null>("naver_tx_fail", { p_id: id, p_secret_hash: secretHash }),
  completeLink: (
    id: string,
    secretHash: string,
    sessionUserId: string,
    recentAuthAt: number,
  ) =>
    rpc<string | null>("complete_naver_link", {
      p_tx_id: id,
      p_secret_hash: secretHash,
      p_session_user_id: sessionUserId,
      p_recent_auth_at: new Date(recentAuthAt).toISOString(),
    }),
  unlink: (userId: string) =>
    rpc<boolean>("naver_unlink", { p_user_id: userId }),
};

/**
 * A one-time sign-in token for exactly this account (design 5-6), made from
 * the account's current e-mail and never e-mailed. Null when the account is
 * missing, banned, unconfirmed or changing its e-mail, or when the link was
 * made for anyone else. The caller verifies it on the request's own session
 * client and must check the resulting user id again.
 */
export async function sessionTokenFor(userId: string): Promise<string | null> {
  const auth = admin().auth.admin;
  const { data: found, error: findError } = await auth.getUserById(userId);
  const user = found?.user;
  if (findError || !user || user.id !== userId) return null;
  const banned =
    user.banned_until && Date.parse(user.banned_until) > Date.now();
  const deleted = (user as { deleted_at?: string | null }).deleted_at;
  if (
    !user.email ||
    !user.email_confirmed_at ||
    user.new_email ||
    banned ||
    deleted
  )
    return null;

  const { data: link, error: linkError } = await auth.generateLink({
    type: "magiclink",
    email: user.email,
  });
  if (linkError || !link?.properties?.hashed_token) return null;
  if (link.user?.id !== userId) {
    console.error("naver session link user mismatch");
    return null;
  }
  return link.properties.hashed_token;
}
