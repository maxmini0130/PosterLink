import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const base = "3c71e3a76e01c3b7966217e3e7c17f7433b0a716";
const origin = "https://synthetic.invalid";
function newAuthRequest(url: string) {
  return Object.assign(new Request(url), {
    cookies: { get: () => undefined },
    nextUrl: new URL(url),
  });
}
async function route(file: string) {
  const state = {
    clients: 0,
    exchanges: 0,
    sessions: 0,
    writes: 0,
    fetches: 0,
    cookies: {} as Record<string, string>,
  };
  const result = await build({
    entryPoints: [file],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    plugins: [
      {
        name: "isolated-auth",
        setup(b) {
          b.onResolve(
            { filter: /^(next\/server|next\/headers|@supabase\/ssr)$/ },
            (a) => ({ path: a.path, namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents:
              a.path === "next/server"
                ? `const wrap=r=>{r.cookies={set:(n,v)=>state.cookies[n]=v};return r}; export const NextResponse={json:(v,o)=>wrap(Response.json(v,o)),redirect:u=>wrap(new Response(null,{status:307,headers:{location:u}}))};`
                : a.path === "next/headers"
                  ? `export const cookies=()=>({getAll:()=>[{name:'existing-auth',value:'preserved'}]});`
                  : `export const createServerClient=(_u,_k,o)=>{state.clients++;return {auth:{exchangeCodeForSession:async()=>{state.exchanges++;o.cookies.setAll([{name:'provider-session',value:'synthetic',options:{}}]);return {data:{user:{id:'synthetic-existing',email:'synthetic@example.invalid'}},error:null}},setSession:async()=>{state.sessions++;return {data:{user:{id:'synthetic-existing'}},error:null}}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'synthetic-existing',primary_region_id:'synthetic-region'},error:null})})}),upsert:async()=>{state.writes++;throw Error('UNEXPECTED_WRITE')}})}};`,
          }));
        },
      },
    ],
  });
  const mod = { exports: {} as { GET: (r: Request) => Promise<Response> } };
  new Function(
    "module",
    "exports",
    "state",
    "fetch",
    result.outputFiles[0].text,
  )(mod, mod.exports, state, () => {
    state.fetches++;
    throw Error("UNEXPECTED_NETWORK");
  });
  return { api: mod.exports, state };
}

test("Naver start and callback fail closed for direct, mobile and in-flight OAuth entry", async () => {
  for (const file of [
    "apps/web/app/api/auth/naver/route.ts",
    "apps/web/app/api/auth/naver/callback/route.ts",
  ]) {
    const { api, state } = await route(file);
    for (const query of [
      "",
      "?code=synthetic&state=synthetic",
      "?mobile_redirect=com.maxmini.posterlink%3A%2F%2Fauth-callback",
    ]) {
      const response = await api.GET(
        newAuthRequest(origin + "/api/auth/naver/callback" + query),
      );
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(
        (await response.json()).code,
        "naver_temporarily_unavailable",
      );
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    assert.deepEqual(state, {
      clients: 0,
      exchanges: 0,
      sessions: 0,
      writes: 0,
      fetches: 0,
      cookies: {},
    });
  }
});

test("legacy Naver token callback is rejected before any Auth client, including mixed entry", async () => {
  const { api, state } = await route("apps/web/app/auth/callback/route.ts");
  for (const q of [
    "naver_at=synthetic",
    "naver_rt=synthetic",
    "code=synthetic&naver_at=synthetic&naver_rt=synthetic",
    "naver_at=synthetic&access_token=synthetic&refresh_token=synthetic",
  ]) {
    const r = await api.GET(newAuthRequest(origin + "/auth/callback?" + q));
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("set-cookie"), null);
  }
  assert.deepEqual(state, {
    clients: 0,
    exchanges: 0,
    sessions: 0,
    writes: 0,
    fetches: 0,
    cookies: {},
  });
});

test("existing Google/Kakao PKCE callback and native session callback remain unchanged", async () => {
  for (const provider of ["google", "kakao"]) {
    const { api, state } = await route("apps/web/app/auth/callback/route.ts");
    const r = await api.GET(
      newAuthRequest(
        origin + "/auth/callback?code=synthetic-" + provider + "&next=/mypage",
      ),
    );
    assert.equal(r.headers.get("location"), origin + "/mypage");
    assert.equal(state.exchanges, 1);
    assert.equal(state.writes, 0);
    assert.equal(state.cookies["provider-session"], "synthetic");
  }
  const { api, state } = await route("apps/web/app/auth/callback/route.ts");
  assert.equal(
    (
      await api.GET(
        newAuthRequest(
          origin +
            "/auth/callback?access_token=synthetic&refresh_token=synthetic",
        ),
      )
    ).status,
    307,
  );
  assert.equal(state.sessions, 1);
});

test("GA integration preserves Production security, stats, SEO and applied migrations", () => {
  for (const p of [
    "apps/web/middleware.ts",
    "apps/web/app/api/auth/delete-account/route.ts",
    "apps/web/app/api/admin/signup-stats/route.ts",
    "apps/web/lib/authSignupStats.ts",
    "apps/web/instrumentation.ts",
    "apps/web/instrumentation-client.ts",
    "apps/web/lib/sentryPrivacy.ts",
    "apps/web/app/robots.ts",
    "apps/web/app/sitemap.ts",
  ]) {
    assert.equal(
      readFileSync(p, "utf8").replace(/\r\n/g, "\n"),
      execFileSync("git", ["show", base + ":" + p], {
        encoding: "utf8",
      }).replace(/\r\n/g, "\n"),
      p,
    );
  }
  assert.equal(
    execFileSync(
      "git",
      ["diff", base, "--", "apps/web/app/api/admin", "pnpm-lock.yaml"],
      { encoding: "utf8" },
    ).trim(),
    "",
  );
  // Applied migrations stay frozen; later stages may only add new migration files.
  const supabaseChanges = execFileSync(
    "git",
    ["diff", "--name-status", "--no-renames", base, "--", "supabase"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const line of supabaseChanges) {
    assert.match(
      line,
      /^A\tsupabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/,
      line,
    );
  }
  // package.json may only register more tests; dependencies and other scripts stay frozen.
  const withoutTestScript = (json: string) => {
    const pkg = JSON.parse(json);
    delete pkg.scripts.test;
    return pkg;
  };
  assert.deepEqual(
    withoutTestScript(readFileSync("package.json", "utf8")),
    withoutTestScript(
      execFileSync("git", ["show", base + ":package.json"], {
        encoding: "utf8",
      }),
    ),
  );
});

test("suspension uses validated stop source and has no credential or provider operations", () => {
  for (const p of [
    "apps/web/app/api/auth/naver/route.ts",
    "apps/web/app/api/auth/naver/callback/route.ts",
    "apps/web/lib/naverAvailability.ts",
  ]) {
    const source = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    assert.equal(
      source,
      execFileSync("git", ["show", "e0fdeb3:" + p], {
        encoding: "utf8",
      }).replace(/\r\n/g, "\n"),
    );
    assert.doesNotMatch(
      source,
      /updateUserById|signInWithPassword|derivePassword|findAuthUserByEmail|createClient|process\.env/,
    );
  }
});
