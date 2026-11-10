import assert from "node:assert/strict";
import test from "node:test";

import { getDeadlinePresentation } from "./deadlinePresentation";
import {
  cardDeadlineInput,
  deadlineVerificationFromRow,
} from "./posterDeadlineFields";

const NOW = new Date("2026-11-10T03:00:00Z"); // 11.10(화) 12:00 KST

test("rows without the v6.1 columns claim nothing", () => {
  assert.deepEqual(deadlineVerificationFromRow({}), {
    deadlineStatus: "unverified",
    deadlineTimeVerified: false,
    receptionVerified: false,
    sessionRuleText: null,
    sessionRuleVerified: false,
    lastSessionDeadlineDate: null,
    deadlineLabel: null,
    deadlineNote: null,
  });
  assert.equal(
    deadlineVerificationFromRow({ deadline_status: "maybe" }).deadlineStatus,
    "unverified",
  );
});

test("a card with a verified time shows that time, the stamp and the D-day", () => {
  const presentation = getDeadlinePresentation(
    cardDeadlineInput(
      {
        deadline: "2026-11-12T18:00:00+09:00",
        deadlineType: "fixed",
        deadlineVerification: deadlineVerificationFromRow({
          deadline_status: "verified",
          deadline_time_verified: true,
          reception_verified: true,
        }),
      },
      NOW,
    ),
  );
  assert.equal(presentation.card, "11.12(목) 오후 6시까지");
  assert.equal(presentation.stamp, "D-2");
});

test("the same card without the columns is shown as unconfirmed, not as a date", () => {
  const presentation = getDeadlinePresentation(
    cardDeadlineInput(
      { deadline: "2026-11-12T18:00:00+09:00", deadlineType: "fixed" },
      NOW,
    ),
  );
  assert.equal(presentation.stamp, null);
  assert.equal(presentation.tone, "muted");
});

test("an operator-closed card and an applied card", () => {
  const closed = getDeadlinePresentation(
    cardDeadlineInput({ contentState: "closed", deadlineType: "ongoing" }, NOW),
  );
  assert.equal(closed.state, "closed");
  const applied = getDeadlinePresentation(
    cardDeadlineInput(
      {
        deadline: "2026-11-11T23:59:59+09:00",
        deadlineType: "fixed",
        applied: true,
        deadlineVerification: deadlineVerificationFromRow({
          deadline_status: "verified",
        }),
      },
      NOW,
    ),
  );
  assert.equal(applied.tone, "applied");
  assert.equal(applied.stamp, null);
});
