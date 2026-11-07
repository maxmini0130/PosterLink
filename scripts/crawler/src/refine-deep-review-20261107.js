import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Final, narrowly scoped fee-unit correction and public prose cleanup.
const root = fileURLToPath(
  new URL("../../../data/results/deep-review-20261107/", import.meta.url),
);
const read = async (n) =>
  JSON.parse(await fs.readFile(`${root}/${n}.json`, "utf8"));
const save = async (n, v) =>
  fs.writeFile(`${root}/${n}.json`, JSON.stringify(v, null, 2));
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=DEEP_REVIEW_20261107"));
const plan = await read("refine-plan");
const hash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
assert.equal(
  hash,
  "1099f311eaa95d1170a73832dd4552d5c20000213691aedb3f5e3d3291b34a95",
);
assert.equal(plan.items.length, 11);
assert(
  !(await fs.access(`${root}/refined.json`).then(
    () => true,
    () => false,
  )),
  "Never replay an existing journal",
);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    auth: { persistSession: false },
    global: {
      fetch: (u, o) => {
        if (!apply) assert.equal(o?.method || "GET", "GET");
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
const canonical = (v) =>
  Array.isArray(v)
    ? v
        .map(canonical)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const same = (a, b) => assert.deepEqual(canonical(a), canonical(b));
for (const item of plan.items) {
  assert(
    Object.keys(item.patch).every((k) =>
      ["summary_long", "participation_fee"].includes(k),
    ),
  );
  assert.equal(item.before.id, item.id);
  same(
    await check(db.from("posters").select(select).eq("id", item.id).single()),
    item.before,
  );
}
if (!apply) {
  await save("refine-dry-run", { hash, passed: true });
  console.log(
    JSON.stringify({ dryRun: true, feeCorrections: 2, proseCleanups: 9 }),
  );
  process.exit(0);
}
assert.equal((await read("refine-dry-run")).hash, hash);
const journal = { hash, items: [] };
for (const item of plan.items) {
  same(
    await check(db.from("posters").select(select).eq("id", item.id).single()),
    item.before,
  );
  const verification = structuredClone(item.before.field_verification);
  verification.sourceDeepReview20261107.finalRefinement = {
    planSha256: hash,
    refinedAt: new Date().toISOString(),
    feeUnitCorrected: [57, 77].includes(item.i),
  };
  verification.readableNotice.summaryLong = item.patch.summary_long;
  if (item.patch.participation_fee)
    verification.readableNotice.facts = {
      ...verification.readableNotice.facts,
      participationFee: item.patch.participation_fee,
    };
  const patch = { ...item.patch, field_verification: verification };
  journal.items.push({ id: item.id, i: item.i, phase: "write" });
  await save("refined", journal);
  const result = await check(
    db
      .from("posters")
      .update(patch)
      .eq("id", item.id)
      .eq("poster_status", item.before.poster_status)
      .eq("updated_at", item.before.updated_at)
      .select("id"),
  );
  assert.equal(result.length, 1);
  const after = await check(
    db.from("posters").select(select).eq("id", item.id).single(),
  );
  for (const [key, value] of Object.entries(item.before))
    if (key !== "updated_at")
      same(after[key], key in patch ? patch[key] : value);
  await save(`refined-after-${item.id}`, after);
  journal.items.at(-1).phase = "verified";
  await save("refined", journal);
}
await check(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: null,
    action_type: "update",
    action_reason: "deep_review_fee_unit_and_public_prose_20261107",
    metadata_json: {
      ids: plan.items.map((x) => x.id),
      planSha256: hash,
      feeCorrections: 2,
      proseCleanups: 9,
    },
  }),
);
journal.completedAt = new Date().toISOString();
await save("refined", journal);
console.log(
  JSON.stringify({
    verified: journal.items.length,
    feeCorrections: 2,
    proseCleanups: 9,
  }),
);
