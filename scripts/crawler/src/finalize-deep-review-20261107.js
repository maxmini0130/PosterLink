import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Close the two same-day festivals after their actual event end, not an invented application deadline.
const root = fileURLToPath(
  new URL("../../../data/results/deep-review-20261107/", import.meta.url),
);
const read = async (n) =>
  JSON.parse(await fs.readFile(`${root}/${n}.json`, "utf8"));
const save = async (n, v) =>
  fs.writeFile(`${root}/${n}.json`, JSON.stringify(v, null, 2));
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=DEEP_REVIEW_20261107"));
const [plan, journal] = await Promise.all([read("plan"), read("applied")]);
assert(
  journal.completedAt &&
    journal.items.length === 28 &&
    journal.items.every((r) => r.phase === "verified"),
);
assert(
  !(await fs.access(`${root}/finalized.json`).then(
    () => true,
    () => false,
  )),
  "Do not replay",
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
const items = plan.items.filter((r) => [12, 13].includes(r.i));
assert.equal(items.length, 2);
for (const item of items) {
  const before = await read(`after-${item.id}`);
  const current = await check(
    db.from("posters").select("*").eq("id", item.id).single(),
  );
  for (const [key, value] of Object.entries(current))
    assert.deepEqual(value, before[key], `Concurrent change ${key}`);
  assert.equal(current.poster_status, "published");
  assert(Date.now() > Date.parse(current.event_end_at));
}
if (!apply) {
  await save("finalize-dry-run", { passed: true, ids: items.map((r) => r.id) });
  console.log(JSON.stringify({ dryRun: true, closingEndedEvents: 2 }));
  process.exit(0);
}
assert((await read("finalize-dry-run")).passed);
const result = { items: [] };
for (const item of items) {
  const before = await read(`after-${item.id}`);
  result.items.push({ id: item.id, i: item.i, phase: "write" });
  await save("finalized", result);
  const verification = structuredClone(before.field_verification);
  verification.sourceDeepReview20261107.status = "closed";
  verification.sourceDeepReview20261107.eventEndedAtFinalCheck =
    new Date().toISOString();
  const patch = { poster_status: "closed", field_verification: verification };
  const updated = await check(
    db
      .from("posters")
      .update(patch)
      .eq("id", item.id)
      .eq("poster_status", "published")
      .eq("updated_at", before.updated_at)
      .select("*"),
  );
  assert.equal(updated.length, 1);
  for (const [key, value] of Object.entries(updated[0]))
    assert.deepEqual(
      value,
      key === "updated_at"
        ? updated[0].updated_at
        : key in patch
          ? patch[key]
          : before[key],
    );
  await save(`final-after-${item.id}`, updated[0]);
  result.items.at(-1).phase = "verified";
  await save("finalized", result);
}
await check(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: null,
    action_type: "update",
    action_reason: "deep_review_same_day_events_ended_20261107",
    metadata_json: {
      ids: items.map((r) => r.id),
      reason:
        "Actual event end elapsed in Asia/Seoul; no application deadline invented",
      finalPublished: 23,
      finalClosed: 5,
    },
  }),
);
result.completedAt = new Date().toISOString();
await save("finalized", result);
console.log(
  JSON.stringify({ verified: 2, finalPublished: 23, finalClosed: 5 }),
);
