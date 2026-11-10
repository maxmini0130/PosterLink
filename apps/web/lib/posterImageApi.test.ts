import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const storage =
  "https://fixture.supabase.co/storage/v1/object/public/posters/a.png";
async function fixture(record: unknown) {
  const state = { reads: 0, fetches: 0, options: null as any };
  const result = await build({
    entryPoints: ["apps/web/app/api/poster-image-meta/route.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    define: {
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(
        "https://fixture.supabase.co",
      ),
    },
    plugins: [
      {
        name: "read-only-fixtures",
        setup(b) {
          b.onResolve({ filter: /^(next\/server)$|publicDiscovery$/ }, (a) => ({
            path: a.path,
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents:
              a.path === "next/server"
                ? "export const NextResponse={json:(v,o)=>Response.json(v,o)};"
                : `export function createPublicSupabaseClient(){state.reads++;const q={select:()=>q,eq:()=>q,in:()=>q,or:()=>q,maybeSingle:async()=>({data:record,error:null})};return {from:()=>q};}`,
          }));
        },
      },
    ],
  });
  const mod = { exports: {} as { GET: (r: any) => Promise<Response> } };
  const png = Buffer.alloc(24);
  png.write("PNG", 1);
  png.writeUInt32BE(800, 16);
  png.writeUInt32BE(1200, 20);
  new Function(
    "module",
    "exports",
    "state",
    "record",
    "fetch",
    result.outputFiles[0].text,
  )(mod, mod.exports, state, record, async (_url: string, options: unknown) => {
    state.fetches++;
    state.options = options;
    return new Response(png);
  });
  return {
    state,
    get: (src = storage) =>
      mod.exports.GET({
        nextUrl: new URL(
          `https://local.invalid/api/poster-image-meta?id=aaaaaaaa-0000-4000-8000-000000000001&src=${encodeURIComponent(src)}`,
        ),
      }),
  };
}
test("image probe rejects foreign hosts and unrelated files before any network download", async () => {
  const f = await fixture({ thumbnail_url: storage, poster_images: [] });
  assert.equal((await f.get("http://127.0.0.1/private")).status, 400);
  assert.equal(f.state.reads, 0);
  assert.equal(f.state.fetches, 0);
  assert.equal(
    (await (await f.get(storage + "unrelated")).json()).status,
    "missing",
  );
  assert.equal(f.state.fetches, 0);
});
test("measured but undecided and explicitly unsuitable images never become ok", async () => {
  for (const status of [null, "unsuitable"]) {
    const f = await fixture({
      thumbnail_url: storage,
      poster_images: [
        {
          storage_path: storage,
          image_width: 800,
          image_height: 1200,
          image_status: status,
        },
      ],
    });
    assert.equal((await (await f.get()).json()).status, status);
    assert.equal(f.state.fetches, 0);
  }
});
test("legacy metadata probe is ranged, refuses redirects, deduplicates and caches reads", async () => {
  const f = await fixture({ thumbnail_url: storage, poster_images: [] });
  const responses = await Promise.all([f.get(), f.get()]);
  for (const r of responses)
    assert.deepEqual(await r.json(), {
      width: 800,
      height: 1200,
      status: "ok",
      src: storage,
    });
  await f.get();
  assert.equal(f.state.reads, 1);
  assert.equal(f.state.fetches, 1);
  assert.equal(f.state.options.redirect, "error");
  assert.equal(f.state.options.headers.Range, "bytes=0-524287");
});
