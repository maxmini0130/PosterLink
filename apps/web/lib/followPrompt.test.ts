import assert from "node:assert/strict";
import test from "node:test";
import {
  canOfferFollow,
  FOLLOW_PROMPT_KEY,
  markFollowPromptShown,
  newFollowPromptId,
  rememberFollowDecision,
} from "./followPrompt";
import { PROMPT_ID } from "./guestStore";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";

test("offered once per visit, only for an organiser", () => {
  const local = memory();
  const session = memory();
  assert.equal(canOfferFollow({ institutionId: null, local, session }), false);
  assert.equal(canOfferFollow({ institutionId: ORG, local, session }), true);
  assert.equal(markFollowPromptShown(session, "fp_abcdef01"), true);
  assert.equal(canOfferFollow({ institutionId: ORG, local, session }), false);
  assert.equal(
    canOfferFollow({ institutionId: ORG, local, session: memory() }),
    true,
  );
});

test("never again after a decision, or when already followed", () => {
  const local = memory();
  rememberFollowDecision(local, ORG, "dismissed");
  assert.equal(
    canOfferFollow({ institutionId: ORG, local, session: memory() }),
    false,
  );
  const other = "22222222-2222-4222-8222-222222222222";
  assert.equal(
    canOfferFollow({
      institutionId: other,
      followedIds: new Set([other]),
      local,
      session: memory(),
    }),
    false,
  );
});

test("broken or blocked storage keeps the prompt quiet rather than repeating", () => {
  const local = memory();
  local.data.set(FOLLOW_PROMPT_KEY, "{not json");
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(
    canOfferFollow({ institutionId: ORG, local, session: blocked }),
    false,
  );
  assert.equal(markFollowPromptShown(blocked, "fp_abcdef01"), false);
});

test("prompt ids are opaque tokens accepted by the event sanitizer", () => {
  const id = newFollowPromptId(() => 0.5);
  assert.match(id, PROMPT_ID);
  assert.match(id, /^[A-Za-z0-9_-]{1,64}$/);
});
