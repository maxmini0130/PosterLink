import "./load-env.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Final retained-field audit: a library name was incorrectly stored as a benefit.
assert(process.argv.includes("--confirm=SOURCE_REVIEW_20261107"));
const root = fileURLToPath(
  new URL("../../../data/results/source-review-20261107/", import.meta.url),
);
const id = "4b71dd60-3b86-4be8-9696-91d381853918";
const expected = JSON.parse(
  await fs.readFile(`${root}/after-${id}.json`, "utf8"),
);
const journal = JSON.parse(await fs.readFile(`${root}/applied.json`, "utf8"));
assert(journal.completedAt);
assert(!journal.benefitsCorrection);
assert.equal(expected.poster_status, "closed");
assert.equal(expected.benefits_summary, "시흥도서관");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  { auth: { persistSession: false } },
);
const checked = async (query) => {
  const result = await query;
  assert.ifError(result.error);
  return result.data;
};
const before = await checked(
  db.from("posters").select("*").eq("id", id).single(),
);
for (const [key, value] of Object.entries(before))
  assert.deepEqual(value, expected[key], key);
const benefit = "산책 기록을 책으로 제작하고 사진전·출판기념회로 공유 예정";
const write = await checked(
  db
    .from("posters")
    .update({ benefits_summary: benefit })
    .eq("id", id)
    .eq("updated_at", before.updated_at)
    .eq("poster_status", "closed")
    .select("*"),
);
assert.equal(write.length, 1);
for (const [key, value] of Object.entries(before))
  if (!["updated_at", "benefits_summary"].includes(key))
    assert.deepEqual(write[0][key], value, key);
assert.equal(write[0].benefits_summary, benefit);
await checked(
  db.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "poster",
    target_id: id,
    action_type: "approve",
    action_reason: "source_review_20261107_retained_benefits",
    metadata_json: {
      before: before.benefits_summary,
      after: benefit,
      source:
        "https://geumcheonlib.seoul.kr/geumcheonlib/uce/programDetail.do?idxNo=3937&INST_CD=INST0000&INST_GB=1&selfId=1090",
    },
  }),
);
journal.benefitsCorrection = {
  id,
  before: before.benefits_summary,
  after: benefit,
  verifiedAt: new Date().toISOString(),
};
await fs.writeFile(
  `${root}/benefits-correction.json`,
  JSON.stringify({ before, after: write[0] }, null, 2),
);
await fs.writeFile(
  `${root}/after-${id}.json`,
  JSON.stringify({ ...expected, ...write[0] }, null, 2),
);
await fs.writeFile(`${root}/applied.json`, JSON.stringify(journal, null, 2));
console.log(
  JSON.stringify({
    corrected: 1,
    status: "closed",
    otherFieldsPreserved: true,
  }),
);
