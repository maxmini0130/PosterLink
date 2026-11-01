import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryScopeIds,
  interestCategories,
  isInterestCategory,
} from "./categoryTaxonomy";

const LIST = [
  { id: "welfare", code: "CAT_WELFARE" },
  { id: "edu", code: "CAT_EDUCATION" },
  { id: "culture", code: "CAT_CULTURE" },
  { id: "other", code: "CAT_OTHER" },
  { id: "support", code: "CAT_SUPPORT_PROGRAM" },
  { id: "course", code: "CAT_COURSE" },
  { id: "job", code: "CAT_RECRUITMENT" },
  { id: "event", code: "CAT_EVENT_RECRUIT" },
  { id: "life", code: "CAT_LIFE_INFO" },
  { id: "child", code: "CAT_NEW", parent_id: "welfare" },
];

test("only the main categories are offered, never 교육강좌 beside 교육/취업", () => {
  assert.deepEqual(
    interestCategories(LIST).map((category) => category.id),
    ["welfare", "edu", "culture", "other"],
  );
  assert.equal(isInterestCategory({ id: "course", code: "CAT_COURSE" }), false);
  // A list read without codes is left as it is.
  const bare = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(interestCategories(bare), bare);
});

test("a main category searches the content types folded into it", () => {
  assert.deepEqual(categoryScopeIds("edu", LIST), ["edu", "course", "job"]);
  assert.deepEqual(categoryScopeIds("culture", LIST), ["culture", "event"]);
  assert.deepEqual(categoryScopeIds("welfare", LIST), [
    "welfare",
    "support",
    "child",
  ]);
  assert.deepEqual(categoryScopeIds("other", LIST), ["other", "life"]);
  // A content type picked directly searches only itself.
  assert.deepEqual(categoryScopeIds("course", LIST), ["course"]);
  assert.deepEqual(categoryScopeIds("missing", LIST), ["missing"]);
  assert.deepEqual(categoryScopeIds(null, LIST), []);
});
