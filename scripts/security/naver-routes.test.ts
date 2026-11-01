import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { build } from "esbuild";

// /auth/naver/* route handlers bundled with fakes for Next, Supabase and the
// two server modules, so each decision is checked without any network or DB.
const ORIGIN = "https://www.posterlink.kr";
const USER = "11111111-1111-4111-8111-111111111111";
const TX = "0f0e0d0c-0b0a-4908-8706-050403020100";
const SECRET = "s".repeat(43);

type Calls = Array<[string, ...unknown[]]>;
type Fakes = {
  member?: { id: string; signedInAt: number } | null;
  start?: string | null;
  callback?: {
    purpose: string;
    flow: string | null;
    target_user_id: string | null;
  } | null;
  completeLogin?: boolean;
  token?: string | null;
  /** Account the one-time token actually signs in (defaults to the target). */
  verifiedUser?: string;
  completeLink?: string | null;
  unlink?: boolean;
  naverId?: string | null;
};

async function route(file: string, fakes: Fakes) {
  const calls: Calls = [];
  const cookies: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }> = [];
  const result = await build({
    entryPoints: [file],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    plugins: [
      {
        name: "fakes",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(next\/server|@supabase\/ssr)$|server\/naverAuthAdmin$|server\/naverProvider$|analyticsAuthReceipt$/,
            },
            (a) => ({ path: a.path, namespace: "fake" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fake" }, (a) => {
            if (a.path === "next/server")
              return {
                contents: `
                  const wrap = (r) => { r.cookies = { set: (name, value, options) => fx.cookies.push({ name, value, options }) }; return r; };
                  export const NextResponse = {
                    json: (body, init) => wrap(Response.json(body, init)),
                    redirect: (url, status) => wrap(new Response(null, { status: status ?? 307, headers: { location: url } })),
                  };`,
              };
            if (a.path === "@supabase/ssr")
              return {
                contents: `export const createServerClient = (_u, _k, o) => ({ auth: {
                  getUser: async () => fx.fakes.member ? { data: { user: { id: fx.fakes.member.id } }, error: null } : { data: { user: null }, error: { message: "no" } },
                  getClaims: async () => ({ data: fx.fakes.member ? { claims: { sub: fx.fakes.member.id, amr: [{ method: "otp", timestamp: Math.floor(fx.fakes.member.signedInAt / 1000) }] } } : null }),
                  verifyOtp: async ({ token_hash }) => {
                    fx.calls.push(["verifyOtp", token_hash]);
                    const id = fx.fakes.verifiedUser ?? fx.fakes.callback?.target_user_id;
                    o.cookies.setAll([{ name: "sb-session", value: "session-of-" + id, options: {} }]);
                    return { data: { user: { id }, session: { user: { id } } }, error: null };
                  },
                  signOut: async () => { fx.calls.push(["signOut"]); return { error: null }; },
                } });`,
              };
            if (a.path.endsWith("analyticsAuthReceipt"))
              return {
                contents: `export const attachAnalyticsAuthReceipt = (_q, _r, m) => fx.calls.push(["receipt", m]);`,
              };
            if (a.path.endsWith("naverProvider"))
              return {
                contents: `
                  export const naverAuthorizeUrl = (id, redirect, state) => "https://nid.naver.com/oauth2.0/authorize?state=" + state + "&redirect_uri=" + encodeURIComponent(redirect);
                  export const naverIdForCode = async () => { fx.calls.push(["naverIdForCode"]); return fx.fakes.naverId === undefined ? "naver-user-1" : fx.fakes.naverId; };`,
              };
            return {
              contents: `
                const call = (name, value) => (...args) => { fx.calls.push([name, ...args]); return Promise.resolve(value); };
                export const naverDb = {
                  start: (...a) => call("start", fx.fakes.start === undefined ? "${TX}" : fx.fakes.start)(...a),
                  callback: (...a) => call("callback", fx.fakes.callback ?? null)(...a),
                  completeLogin: (...a) => call("completeLogin", fx.fakes.completeLogin ?? true)(...a),
                  fail: (...a) => call("fail", null)(...a),
                  completeLink: (...a) => call("completeLink", fx.fakes.completeLink ?? null)(...a),
                  unlink: (...a) => call("unlink", fx.fakes.unlink ?? false)(...a),
                };
                export const sessionTokenFor = (...a) => call("sessionTokenFor", fx.fakes.token === undefined ? "one-time" : fx.fakes.token)(...a);`,
            };
          });
        },
      },
    ],
  });
  const mod = {
    exports: {} as Record<string, (r: unknown) => Promise<Response>>,
  };
  new Function(
    "module",
    "exports",
    "fx",
    "require",
    result.outputFiles[0].text,
  )(mod, mod.exports, { fakes, calls, cookies }, require);
  return { api: mod.exports, calls, cookies };
}

function request(
  path: string,
  {
    cookies = {} as Record<string, string>,
    origin = ORIGIN as string | null,
    form = {} as Record<string, string>,
  } = {},
) {
  const url = new URL(ORIGIN + path);
  const headers = new Headers(origin ? { origin } : {});
  return {
    url: url.toString(),
    nextUrl: url,
    headers,
    cookies: {
      get: (name: string) =>
        name in cookies ? { name, value: cookies[name] } : undefined,
      getAll: () =>
        Object.entries(cookies).map(([name, value]) => ({ name, value })),
    },
    formData: async () => {
      const data = new FormData();
      for (const [k, v] of Object.entries(form)) data.set(k, v);
      return data;
    },
  };
}

const ON = {
  NAVER_LOGIN_ENABLED: "true",
  NAVER_CLIENT_ID: "client",
  NAVER_CLIENT_SECRET: "secret",
  NAVER_ID_HASH_KEY_V1: "k".repeat(32),
  NEXT_PUBLIC_APP_URL: ORIGIN,
  NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};
function withEnv(env: Record<string, string | undefined>) {
  for (const key of Object.keys(ON)) delete process.env[key];
  Object.assign(process.env, env);
}
const txCookie = {
  pl_naver_tx: `${TX}.${SECRET}`,
  pl_naver_next: "/my-posters",
};
const names = (calls: Calls) => calls.map((c) => c[0]);
const R = "apps/web/app/auth/naver";

test("with the switch off every Naver route answers 503 and does nothing", async () => {
  withEnv({ ...ON, NAVER_LOGIN_ENABLED: undefined });
  for (const [file, method, path] of [
    ["start", "POST", "/auth/naver/start"],
    ["callback", "GET", "/auth/naver/callback?code=c&state=s"],
    ["finalize", "POST", "/auth/naver/finalize"],
    ["unlink", "POST", "/auth/naver/unlink"],
  ]) {
    const { api, calls, cookies } = await route(`${R}/${file}/route.ts`, {
      member: { id: USER, signedInAt: Date.now() },
    });
    const response = await api[method](request(path, { cookies: txCookie }));
    assert.equal(response.status, 503, file);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(calls, []);
    assert.deepEqual(cookies, []);
  }
});

test("start: same-origin only; binds a transaction to this browser and goes to Naver", async () => {
  withEnv(ON);
  const cross = await route(`${R}/start/route.ts`, {});
  const refused = await cross.api.POST(
    request("/auth/naver/start", { origin: "https://evil.example" }),
  );
  assert.equal(
    refused.headers.get("location"),
    `${ORIGIN}/login?error=login_failed`,
  );
  assert.deepEqual(cross.calls, []);

  const { api, calls, cookies } = await route(`${R}/start/route.ts`, {});
  const response = await api.POST(
    request("/auth/naver/start", {
      form: { purpose: "login", next: "https://evil.example/x" },
    }),
  );
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.origin, "https://nid.naver.com");
  assert.equal(
    location.searchParams.get("redirect_uri"),
    `${ORIGIN}/auth/naver/callback`,
  );
  const [, purpose, secretHash, stateHash, sessionUser] = calls[0];
  assert.deepEqual([purpose, sessionUser], ["login", null]);
  assert.match(String(secretHash), /^[0-9a-f]{64}$/);
  assert.match(String(stateHash), /^[0-9a-f]{64}$/);
  assert.notEqual(stateHash, location.searchParams.get("state")); // only the hash is stored
  const tx = cookies.find((c) => c.name === "pl_naver_tx")!;
  assert.match(tx.value, new RegExp(`^${TX}\\.[A-Za-z0-9_-]{43}$`));
  assert.deepEqual(
    {
      httpOnly: tx.options?.httpOnly,
      sameSite: tx.options?.sameSite,
      path: tx.options?.path,
    },
    { httpOnly: true, sameSite: "lax", path: "/auth/naver" },
  );
  assert.equal(cookies.find((c) => c.name === "pl_naver_next")?.value, "/"); // unsafe next dropped
});

test("start for linking needs a member who signed in within 10 minutes", async () => {
  withEnv(ON);
  const out = await route(`${R}/start/route.ts`, { member: null });
  assert.equal(
    (
      await out.api.POST(
        request("/auth/naver/start", { form: { purpose: "link_session" } }),
      )
    ).headers.get("location"),
    `${ORIGIN}/login`,
  );
  const stale = await route(`${R}/start/route.ts`, {
    member: { id: USER, signedInAt: Date.now() - 11 * 60 * 1000 },
  });
  assert.equal(
    (
      await stale.api.POST(
        request("/auth/naver/start", { form: { purpose: "link_session" } }),
      )
    ).headers.get("location"),
    `${ORIGIN}/mypage/edit?naver=reauth`,
  );
  assert.deepEqual(names(stale.calls), []);
  const fresh = await route(`${R}/start/route.ts`, {
    member: { id: USER, signedInAt: Date.now() - 60 * 1000 },
  });
  await fresh.api.POST(
    request("/auth/naver/start", { form: { purpose: "link_session" } }),
  );
  assert.deepEqual(
    [fresh.calls[0][0], fresh.calls[0][1], fresh.calls[0][4]],
    ["start", "link_session", USER],
  );
});

test("callback: a linked Naver ID signs in to exactly that account, after consuming the transaction", async () => {
  withEnv(ON);
  const { api, calls, cookies } = await route(`${R}/callback/route.ts`, {
    callback: { purpose: "login", flow: "login", target_user_id: USER },
  });
  const response = await api.GET(
    request("/auth/naver/callback?code=c&state=st", { cookies: txCookie }),
  );
  assert.equal(response.headers.get("location"), `${ORIGIN}/my-posters`);
  assert.deepEqual(names(calls), [
    "naverIdForCode",
    "callback",
    "completeLogin",
    "sessionTokenFor",
    "verifyOtp",
    "receipt",
  ]);
  const hashes = calls[1][4] as Record<string, string>;
  assert.deepEqual(Object.keys(hashes), ["1"]);
  assert.ok(!JSON.stringify(calls).includes("naver-user-1")); // the raw Naver id never leaves the route
  assert.equal(calls[3][1], USER);
  assert.equal(
    cookies.find((c) => c.name === "sb-session")?.value,
    `session-of-${USER}`,
  );
  assert.equal(
    cookies.find((c) => c.name === "pl_naver_tx")?.options?.maxAge,
    0,
  );
});

test("callback: unlinked, unconsumed, sessionless and failed Naver answers never sign in", async () => {
  withEnv(ON);
  const cases: Array<[Fakes, string, string[]]> = [
    [
      { callback: { purpose: "login", flow: null, target_user_id: null } },
      "/login?error=naver_not_linked",
      ["naverIdForCode", "callback", "fail"],
    ],
    [
      {
        callback: { purpose: "login", flow: "login", target_user_id: USER },
        completeLogin: false,
      },
      "/login?error=naver_failed",
      ["naverIdForCode", "callback", "completeLogin", "fail"],
    ],
    [
      {
        callback: { purpose: "login", flow: "login", target_user_id: USER },
        token: null,
      },
      "/login?error=naver_failed",
      [
        "naverIdForCode",
        "callback",
        "completeLogin",
        "sessionTokenFor",
        "fail",
      ],
    ],
    // The token signed in someone else: signed out at once, no session cookie kept.
    [
      {
        callback: { purpose: "login", flow: "login", target_user_id: USER },
        verifiedUser: "22222222-2222-4222-8222-222222222222",
      },
      "/login?error=naver_failed",
      [
        "naverIdForCode",
        "callback",
        "completeLogin",
        "sessionTokenFor",
        "verifyOtp",
        "signOut",
        "fail",
      ],
    ],
    [
      { callback: null },
      "/login?error=naver_failed",
      ["naverIdForCode", "callback", "fail"],
    ],
    [
      { naverId: null },
      "/login?error=naver_failed",
      ["naverIdForCode", "fail"],
    ],
  ];
  for (const [fakes, location, expected] of cases) {
    const { api, calls, cookies } = await route(
      `${R}/callback/route.ts`,
      fakes,
    );
    const response = await api.GET(
      request("/auth/naver/callback?code=c&state=st", { cookies: txCookie }),
    );
    assert.equal(response.headers.get("location"), ORIGIN + location);
    assert.deepEqual(names(calls), expected);
    assert.equal(
      cookies.some((c) => c.name === "sb-session"),
      false,
    );
  }
  // No transaction cookie (another browser), or Naver reported an error.
  for (const path of [
    "/auth/naver/callback?code=c&state=st",
    "/auth/naver/callback?error=access_denied&state=st",
  ]) {
    const { api, calls } = await route(`${R}/callback/route.ts`, {});
    const cookies = path.includes("error") ? txCookie : {};
    await api.GET(request(path, { cookies }));
    assert.ok(!names(calls).includes("callback"));
  }
  // Linking goes on to the confirmation page.
  const link = await route(`${R}/callback/route.ts`, {
    callback: {
      purpose: "link_session",
      flow: "link_session",
      target_user_id: USER,
    },
  });
  const response = await link.api.GET(
    request("/auth/naver/callback?code=c&state=st", { cookies: txCookie }),
  );
  assert.equal(response.headers.get("location"), `${ORIGIN}/auth/naver/link`);
  assert.ok(!names(link.calls).includes("sessionTokenFor"));
});

test("finalize and unlink: same origin, fresh sign-in, and the database decides", async () => {
  withEnv(ON);
  const fresh = { id: USER, signedInAt: Date.now() - 60 * 1000 };
  const ok = await route(`${R}/finalize/route.ts`, {
    member: fresh,
    completeLink: USER,
  });
  assert.equal(
    (
      await ok.api.POST(request("/auth/naver/finalize", { cookies: txCookie }))
    ).headers.get("location"),
    `${ORIGIN}/mypage/edit?naver=linked`,
  );
  assert.equal(ok.calls[0][3], USER);
  const refused = await route(`${R}/finalize/route.ts`, {
    member: fresh,
    completeLink: null,
  });
  assert.equal(
    (
      await refused.api.POST(
        request("/auth/naver/finalize", { cookies: txCookie }),
      )
    ).headers.get("location"),
    `${ORIGIN}/mypage/edit?naver=link_failed`,
  );
  const stale = await route(`${R}/finalize/route.ts`, {
    member: { id: USER, signedInAt: Date.now() - 20 * 60 * 1000 },
  });
  assert.equal(
    (
      await stale.api.POST(
        request("/auth/naver/finalize", { cookies: txCookie }),
      )
    ).headers.get("location"),
    `${ORIGIN}/mypage/edit?naver=reauth`,
  );
  assert.deepEqual(names(stale.calls), ["fail"]);
  const cross = await route(`${R}/finalize/route.ts`, {
    member: fresh,
    completeLink: USER,
  });
  await cross.api.POST(
    request("/auth/naver/finalize", {
      cookies: txCookie,
      origin: "https://evil.example",
    }),
  );
  assert.deepEqual(cross.calls, []);

  const unlink = await route(`${R}/unlink/route.ts`, {
    member: fresh,
    unlink: true,
  });
  assert.equal(
    (await unlink.api.POST(request("/auth/naver/unlink"))).headers.get(
      "location",
    ),
    `${ORIGIN}/mypage/edit?naver=unlinked`,
  );
  const crossUnlink = await route(`${R}/unlink/route.ts`, {
    member: fresh,
    unlink: true,
  });
  await crossUnlink.api.POST(request("/auth/naver/unlink", { origin: null }));
  assert.deepEqual(crossUnlink.calls, []);
});

test("only /auth/naver/* routes may import the service-role module", () => {
  const files = execFileSync("git", ["ls-files", "apps/web"], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter((f) => /\.(ts|tsx)$/.test(f));
  const importers = files.filter((f) =>
    /naverAuthAdmin/.test(readFileSync(f, "utf8")),
  );
  for (const file of importers)
    assert.ok(
      file === "apps/web/lib/server/naverAuthAdmin.ts" ||
        file.startsWith("apps/web/app/auth/naver/"),
      file,
    );
  const admin = readFileSync("apps/web/lib/server/naverAuthAdmin.ts", "utf8");
  for (const op of admin.matchAll(
    /auth\.(?:admin\.)?(\w+)\(|\bauth\s*\.\s*(\w+)\(/g,
  ))
    assert.ok(["getUserById", "generateLink"].includes(op[1] ?? op[2]), op[0]);
  assert.doesNotMatch(
    admin,
    /updateUserById|deleteUser|listUsers|signInWithPassword|\.from\(/,
  );
});
