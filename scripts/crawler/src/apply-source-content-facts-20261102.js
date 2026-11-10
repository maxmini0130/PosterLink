import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(
  new URL(
    "../../../data/results/source-review-20261102-followup/",
    import.meta.url,
  ),
);
const apply = process.argv.includes("--apply");
if (apply) assert(process.argv.includes("--confirm=SOURCE_FACTS_20261102"));
const patches = [
  {
    id: "d266f210-fd0d-495f-acbd-3072fcbf36f6",
    recruitment_count: "6?(?ъ뒪??湲곗?; ?좎껌?쒖뿉??6紐낆쑝濡??쒓린)",
  },
  {
    id: "8708ca07-d8b3-4d65-8c97-5d25607e5f47",
    recruitment_count: "?뚯감蹂??깆씤 7紐????뚯감留??좎껌)",
  },
  {
    id: "67ee7c0b-dd0e-4578-8123-ac71303938ca",
    benefits_summary:
      "珥앷컖源移??닿렇湲걔룰컖?곗궗 ?먮갑쨌泥쒖껜愿痢≤룸텋硫띉?諛????띿큿泥댄뿕(?쇱젙 蹂寃?媛??",
  },
];
const journalPath = `${root}/applied-facts.json`;
const resume = process.argv.includes("--resume");
const existingJournal = await fs
  .readFile(journalPath, "utf8")
  .then(JSON.parse, () => []);
assert(
  !existingJournal.length || (apply && resume),
  "Existing journal; inspect before recovery.",
);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const journal = existingJournal;
for (const { id, ...patch } of patches) {
  const recorded = journal.find((entry) => entry.id === id);
  const expected = JSON.parse(
    await fs.readFile(`${root}/content-after-${id}.json`, "utf8"),
  );
  if (recorded) assert.deepEqual(recorded.patch, patch);
  const { data: before, error } = await db
    .from("posters")
    .select("*,poster_links(*),poster_categories(*),poster_images(*)")
    .eq("id", id)
    .single();
  assert.ifError(error);
  // The full snapshot includes relation arrays whose database ordering may vary.
  for (const key of Object.keys(before).filter(
    (k) =>
      ![
        "poster_links",
        "poster_categories",
        "poster_images",
        ...(recorded ? ["updated_at", ...Object.keys(patch)] : []),
      ].includes(k),
  ))
    assert.deepEqual(
      before[key],
      expected[key],
      `Concurrent change: ${id}/${key}`,
    );
  if (recorded)
    for (const [key, value] of Object.entries(patch))
      assert.deepEqual(before[key], value);
  assert.equal(before.verification_status, "needs_review");
  if (!recorded)
    await fs.writeFile(
      `${root}/facts-before-${id}.json`,
      JSON.stringify(before, null, 2),
    );
  if (!apply) continue;
  if (!recorded) {
    const { data: changed, error: updateError } = await db
      .from("posters")
      .update(patch)
      .eq("id", id)
      .eq("updated_at", before.updated_at)
      .eq("verification_status", "needs_review")
      .select("id");
    assert.ifError(updateError);
    assert.equal(changed.length, 1);
    journal.push({ id, patch, phase: "written" });
    await fs.writeFile(journalPath, JSON.stringify(journal, null, 2));
  }
  const { data: after, error: readError } = await db
    .from("posters")
    .select("*,poster_links(*),poster_categories(*),poster_images(*)")
    .eq("id", id)
    .single();
  assert.ifError(readError);
  for (const [key, value] of Object.entries(before)) {
    if (
      [
        "updated_at",
        "poster_links",
        "poster_categories",
        "poster_images",
      ].includes(key)
    )
      continue;
    assert.deepEqual(
      after[key],
      key in patch ? patch[key] : value,
      `Verification: ${id}/${key}`,
    );
  }
  const original = JSON.parse(
    await fs.readFile(`${root}/facts-before-${id}.json`, "utf8"),
  );
  const ordered = (values) =>
    values.map((value) => JSON.stringify(value)).sort();
  for (const key of ["poster_links", "poster_categories", "poster_images"])
    assert.deepEqual(ordered(after[key]), ordered(original[key]));
  await fs.writeFile(
    `${root}/facts-after-${id}.json`,
    JSON.stringify(after, null, 2),
  );
  journal.find((entry) => entry.id === id).phase = "verified";
  await fs.writeFile(journalPath, JSON.stringify(journal, null, 2));
}
console.log(
  JSON.stringify({
    mode: apply ? "applied" : "dry-run",
    count: patches.length,
    verified: journal.length,
  }),
);
