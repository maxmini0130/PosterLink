import { validNaverId } from "../naverAuthCore";

/**
 * Naver OAuth calls. Each request has its own 10-second limit; any failure
 * returns null and the caller shows a general message.
 */

const TIMEOUT_MS = 10_000;

export function naverAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
) {
  const url = new URL("https://nid.naver.com/oauth2.0/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

/** The Naver response.id for this authorization code, or null. */
export async function naverIdForCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  state: string;
  fetch?: typeof fetch;
}): Promise<string | null> {
  const request = input.fetch ?? fetch;
  try {
    const token = await request("https://nid.naver.com/oauth2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        state: input.state,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const tokenBody = (await token.json().catch(() => null)) as {
      access_token?: unknown;
    } | null;
    if (!token.ok || typeof tokenBody?.access_token !== "string") return null;
    const profile = await request("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await profile.json().catch(() => null)) as {
      resultcode?: unknown;
      response?: { id?: unknown };
    } | null;
    if (!profile.ok || body?.resultcode !== "00") return null;
    return validNaverId(body.response?.id) ? body.response.id : null;
  } catch {
    return null;
  }
}
