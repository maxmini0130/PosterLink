import assert from "node:assert/strict";
import test from "node:test";

import {
  DEADLINE_OFFSETS,
  deadlineCopy,
  getKstDayBounds,
  parseExpoResult,
} from "../../../supabase/functions/_shared/notification-logic.mjs";

test("deadline runs include D-7 and D-1 once", () => {
  assert.deepEqual(DEADLINE_OFFSETS, [7, 1]);
});

test("getKstDayBounds uses the Asia/Seoul calendar date around UTC rollover", () => {
  const now = new Date("2026-09-23T16:30:00.000Z"); // 2026-09-24 01:30 KST

  assert.deepEqual(getKstDayBounds(1, now), {
    start: "2026-09-24T15:00:00.000Z",
    end: "2026-09-25T14:59:59.999Z",
  });
  assert.deepEqual(getKstDayBounds(7, now), {
    start: "2026-09-30T15:00:00.000Z",
    end: "2026-10-01T14:59:59.999Z",
  });
});

test("deadlineCopy distinguishes D-7 and D-1 messages", () => {
  assert.match(deadlineCopy(7, "테스트 공고").body, /7일 뒤/);
  assert.match(deadlineCopy(1, "테스트 공고").body, /내일/);
});

test("parseExpoResult records success ticket details", () => {
  assert.deepEqual(
    parseExpoResult(true, {
      data: [{ status: "ok", id: "ticket-1" }],
    }),
    {
      status: "sent",
      ticketId: "ticket-1",
      errorCode: null,
      errorMessage: null,
      invalidToken: false,
    },
  );
});

test("parseExpoResult records failed and invalid Expo tokens", () => {
  assert.deepEqual(
    parseExpoResult(true, {
      data: [
        {
          status: "error",
          message: "Device is not registered",
          details: { error: "DeviceNotRegistered" },
        },
      ],
    }),
    {
      status: "failed",
      ticketId: null,
      errorCode: "DeviceNotRegistered",
      errorMessage: "Device is not registered",
      invalidToken: true,
    },
  );
});
