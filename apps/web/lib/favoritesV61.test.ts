import assert from "node:assert/strict";
import test from "node:test";

import { groupFavorites } from "./favoritesV61";

// Monday 2026-11-09 12:00 KST.
const NOW = new Date("2026-11-09T03:00:00Z");

const verified = {
  deadlineStatus: "verified" as const,
  deadlineTimeVerified: true,
  receptionVerified: true,
};

function card(id: string, deadline: string | null, extra = {}) {
  return {
    id,
    deadline: deadline ?? undefined,
    deadlineType: deadline ? "fixed" : "ongoing",
    ...extra,
  };
}

test("four groups in order; applied and closed left out of the counts", () => {
  const groups = groupFavorites(
    [
      {
        card: card("soon", "2026-11-12T18:00:00+09:00", {
          deadlineVerification: verified,
        }),
        applied: false,
      },
      {
        card: card("later", "2026-11-26T13:00:00+09:00", {
          deadlineVerification: verified,
        }),
        applied: false,
      },
      {
        card: card("label", null, {
          deadlineVerification: { deadlineLabel: "정원 마감 때까지" },
        }),
        applied: false,
      },
      { card: card("unverified", "2026-11-20T23:59:59+09:00"), applied: false },
      {
        card: card("done", "2026-11-11T23:59:00+09:00", {
          deadlineVerification: verified,
        }),
        applied: true,
      },
      {
        card: card("over", "2026-11-01T18:00:00+09:00", {
          deadlineVerification: verified,
        }),
        applied: false,
      },
    ],
    NOW,
  );
  const ids = (list: Array<{ card: { id: string } }>) =>
    list.map((item) => item.card.id);
  assert.deepEqual(ids(groups.confirmed), ["soon", "later"]);
  assert.deepEqual(ids(groups.noAlert), ["label", "unverified"]);
  assert.deepEqual(ids(groups.applied), ["done"]);
  assert.deepEqual(ids(groups.closed), ["over"]);
  assert.equal(groups.openCount, 4);
  // 11.12(목) is this week (Mon–Sun); 11.26 is not.
  assert.equal(groups.dueThisWeek, 1);
});

test("rows within D-3 expand with their buttons; applied rows read 신청했어요", () => {
  const groups = groupFavorites(
    [
      {
        card: card("soon", "2026-11-12T18:00:00+09:00", {
          deadlineVerification: verified,
        }),
        applied: false,
      },
      {
        card: card("later", "2026-11-26T13:00:00+09:00", {
          deadlineVerification: verified,
        }),
        applied: false,
      },
      {
        card: card("done", "2026-11-11T23:59:00+09:00", {
          deadlineVerification: verified,
        }),
        applied: true,
      },
    ],
    NOW,
  );
  assert.equal(groups.confirmed[0].expanded, true);
  assert.equal(groups.confirmed[1].expanded, false);
  assert.equal(
    groups.confirmed[1].presentation.row,
    "11.26(목) 오후 1시까지 · D-17",
  );
  assert.equal(groups.applied[0].presentation.tone, "applied");
});
