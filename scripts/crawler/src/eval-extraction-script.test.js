import assert from "node:assert/strict";
import test from "node:test";

import { evidenceRowsFromPayload } from "./eval-extraction.js";

test("evidenceRowsFromPayload reads dry-run backfill plan evidence", () => {
  assert.deepEqual(
    evidenceRowsFromPayload({
      plans: [
        { id: "poster-1", evidence: { poster_id: "poster-1", field_key: "content_type" } },
        { id: "poster-2", evidence: null },
      ],
    }),
    [{ poster_id: "poster-1", field_key: "content_type" }],
  );
});

test("evidenceRowsFromPayload reads multi-row field evidence backfill plans", () => {
  assert.deepEqual(
    evidenceRowsFromPayload({
      plans: [
        {
          id: "poster-1",
          rows: [
            { poster_id: "poster-1", field_key: "deadline_date" },
            { poster_id: "poster-1", field_key: "deadline_type" },
          ],
        },
        { id: "poster-2", rows: [] },
      ],
    }),
    [
      { poster_id: "poster-1", field_key: "deadline_date" },
      { poster_id: "poster-1", field_key: "deadline_type" },
    ],
  );
});

test("evidenceRowsFromPayload accepts direct evidence row arrays", () => {
  const rows = [{ poster_id: "poster-1", field_key: "deadline_date" }];

  assert.equal(evidenceRowsFromPayload(rows), rows);
  assert.equal(evidenceRowsFromPayload({ evidence_rows: rows }), rows);
  assert.equal(evidenceRowsFromPayload({ evidenceRows: rows }), rows);
  assert.deepEqual(evidenceRowsFromPayload({}), []);
});
