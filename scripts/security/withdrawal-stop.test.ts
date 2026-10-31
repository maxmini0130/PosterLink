import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Execute the actual Next route in memory, with Auth verified by a synthetic
// server stub. No network, service key, account or database is involved.
test("withdrawal safety stop authenticates and never invokes deletion or unlink", async () => {
  const state = { user: false, fail: false, checks: 0 };
  const out = await build({
    entryPoints: ["apps/web/app/api/auth/delete-account/route.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    plugins: [
      {
        name: "isolated-route-dependencies",
        setup(b) {
          b.onResolve(
            { filter: /^(next\/server|next\/headers|@supabase\/ssr)$/ },
            (a) => ({ path: a.path, namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents:
              a.path === "next/server"
                ? "export const NextResponse={json:(v,o)=>Response.json(v,o)};"
                : a.path === "next/headers"
                  ? "export const cookies=()=>({get:()=>undefined});"
                  : "export const createServerClient=()=>({auth:{getUser:async()=>{fixture.checks++;if(fixture.fail)throw Error('test outage');return {data:{user:fixture.user?{id:'synthetic'}:null},error:null}}}});",
          }));
        },
      },
    ],
  });
  const module = { exports: {} as { DELETE: () => Promise<Response> } };
  new Function("module", "exports", "fixture", out.outputFiles[0].text)(
    module,
    module.exports,
    state,
  );
  assert.equal((await module.exports.DELETE()).status, 401);
  state.user = true;
  const response = await module.exports.DELETE();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.match(body.error, /요청이 접수되지 않습니다/);
  assert.equal(body.requestContact, "mailto:maxmini@maxmini.co.kr");
  assert.doesNotMatch(
    JSON.stringify(body),
    /posterlink@maxmini.co.kr|contact@posterlink.kr|privacy@posterlink.kr/,
  );
  assert.equal(body.success, undefined);
  state.fail = true;
  assert.equal((await module.exports.DELETE()).status, 503);
  assert.equal(state.checks, 3);
});
