import assert from "node:assert/strict";
import test from "node:test";

import { homeChipOf, readHomeChip, visibleHomeChips } from "./homeChips";

test("recruitment and contests are their own chips", () => {
  assert.equal(homeChipOf(["CAT_RECRUITMENT", "CAT_EDUCATION"]), "jobs");
  assert.equal(homeChipOf(["CAT_CONTEST"]), "contest");
  assert.equal(homeChipOf(["CAT_COURSE"]), "education");
  assert.equal(homeChipOf(["CAT_EVENT_RECRUIT"]), "culture");
  assert.equal(homeChipOf(["CAT_HOUSING"]), "support");
  assert.equal(homeChipOf(["CAT_OTHER"]), null);
  assert.equal(homeChipOf([]), null);
});

test("a chip under five open posters in the region is hidden", () => {
  assert.deepEqual(
    visibleHomeChips({
      support: 91,
      education: 133,
      culture: 104,
      jobs: 4,
      contest: 5,
    }).map((chip) => chip.label),
    ["지원·혜택", "교육·강좌", "문화·행사", "공모전"],
  );
});

test("only known chip ids are read from a request", () => {
  assert.equal(readHomeChip("jobs"), "jobs");
  assert.equal(readHomeChip("all"), null);
  assert.equal(readHomeChip(undefined), null);
});
