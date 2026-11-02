import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
test("image metadata migration preserves images, rejects invalid values and leaves RLS unchanged", async () => {
  const db = new PGlite();
  await db.exec(
    "CREATE TABLE poster_images(id int primary key,width int,height int);ALTER TABLE poster_images ENABLE ROW LEVEL SECURITY;INSERT INTO poster_images VALUES(1,800,1200)",
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261102020000_add_poster_image_feed_metadata.sql",
      "utf8",
    ),
  );
  assert.deepEqual(
    (await db.query("SELECT width,height,image_status FROM poster_images"))
      .rows,
    [{ width: 800, height: 1200, image_status: null }],
  );
  await assert.rejects(
    db.exec("UPDATE poster_images SET image_status='approved'"),
  );
  await assert.rejects(db.exec("UPDATE poster_images SET image_width=0"));
  assert.equal(
    (
      await db.query(
        "SELECT relrowsecurity FROM pg_class WHERE relname='poster_images'",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  await db.close();
});
