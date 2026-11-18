import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Read-only planner for the 2026-11-19 snowball link cleanup.
// Before PR #56, the duplicate detector treated links appended to a poster
// (other youth.seoul.go.kr notices) as the poster's own source URL, so each
// later crawl of those notices merged again and appended more links.
// Links are grouped into insert batches (rows written within BATCH_GAP_MS of
// the batch start). The first batch is what the poster was created with and is kept.
// A later batch is proposed for removal when it carries a youth notice whose
// live page title is a different program from the poster title.
// Every proposal is then confirmed by a person in the frozen apply script.
// Usage: node src/build-snowball-link-cleanup-20261119.js   (GET only)
const out = fileURLToPath(
  new URL("../../../data/results/snowball-links-20261119/", import.meta.url),
);
// One merge inserts its links in a single statement, so they share a second.
const BATCH_GAP_MS = 2000;
const YOUTH = /youth\.seoul\.go\.kr\/infoData\/sprtInfo\/view\.do\?[^#]*sprtInfoId=(\d+)/;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (u, o) => {
        assert.equal(o?.method || "GET", "GET");
        return fetch(u, { ...o, signal: AbortSignal.timeout(30000) });
      },
    },
  },
);
const check = async (q) => {
  const r = await q;
  assert.ifError(r.error);
  return r.data;
};

const select =
  "*,poster_links(*),poster_images(*),poster_categories(*),poster_audiences(*)";
// Poster ids come from a read-only SQL listing (published posters with two or
// more youth notice links), passed as --ids=<file with one uuid per line>.
const idsArg = process.argv.find((a) => a.startsWith("--ids="));
assert(idsArg, "--ids=<file> is required");
const ids = (await fs.readFile(idsArg.slice(6), "utf8"))
  .split(/\s+/)
  .filter((s) => /^[0-9a-f-]{36}$/.test(s));
assert(ids.length > 0);
const posters = [];
for (let i = 0; i < ids.length; i += 50)
  posters.push(
    ...(await check(
      db
        .from("posters")
        .select(select)
        .in("id", ids.slice(i, i + 50))
        .eq("poster_status", "published"),
    )),
  );

const titleCache = new Map();
async function youthTitle(id) {
  if (titleCache.has(id)) return titleCache.get(id);
  let title = null;
  try {
    const res = await fetch(
      `https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=${id}`,
      { signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0 PosterLink audit" } },
    );
    const html = await res.text();
    // The notice title is the first <strong> after the card image of the
    // view area (og:title and <title> only carry the portal name).
    const m = html.match(/politicsNoImage[\s\S]*?<strong>([\s\S]*?)<\/strong>/);
    title = m
      ? m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim()
      : null;
  } catch (e) {
    title = `ERROR ${e.message}`;
  }
  titleCache.set(id, title);
  await new Promise((r) => setTimeout(r, 400));
  return title;
}

const bigrams = (s) => {
  const t = String(s ?? "").replace(/[^\p{L}\p{N}]/gu, "");
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
};
const dice = (a, b) => {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return (2 * n) / (A.size + B.size);
};

const plan = [];
for (const p of posters.sort((a, b) => a.id.localeCompare(b.id))) {
  const sorted = [...p.poster_links].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
  const batches = [];
  for (const l of sorted) {
    const last = batches.at(-1);
    if (last && Date.parse(l.created_at) - Date.parse(last[0].created_at) <= BATCH_GAP_MS)
      last.push(l);
    else batches.push([l]);
  }
  const batchesOut = [];
  for (const [index, batch] of batches.entries()) {
    const youth = [];
    for (const l of batch) {
      const m = l.url.match(YOUTH);
      if (m) youth.push({ sprtInfoId: m[1], title: await youthTitle(m[1]) });
    }
    batchesOut.push({
      index,
      at: batch[0].created_at,
      links: batch.map((l) => ({
        id: l.id,
        link_type: l.link_type,
        is_primary: l.is_primary,
        url: l.url,
        title: l.title,
      })),
      youth: youth.map((y) => ({ ...y, similarity: Number(dice(p.title, y.title).toFixed(2)) })),
    });
  }
  plan.push({
    id: p.id,
    title: p.title,
    source_key: p.source_key,
    verification_status: p.verification_status,
    batches: batchesOut,
  });
}
await fs.mkdir(out, { recursive: true });
await fs.writeFile(`${out}/backup.json`, JSON.stringify(posters, null, 2));
await fs.writeFile(`${out}/candidates.json`, JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ posters: posters.length, youthTitles: titleCache.size }));
