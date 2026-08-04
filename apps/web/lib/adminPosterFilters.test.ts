import assert from "node:assert/strict";
import test from "node:test";

import {
  countAdminPosterConditions,
  getAdminPosterSortOrders,
  isAdminPosterDeadlineFilter,
  isAdminPosterSort,
  isAdminPosterVerificationFilter,
} from "./adminPosterFilters";

test("admin poster filter URL values accept only supported enums", () => {
  assert.equal(isAdminPosterDeadlineFilter("ongoing"), true);
  assert.equal(isAdminPosterDeadlineFilter("always"), false);
  assert.equal(isAdminPosterVerificationFilter("needs_review"), true);
  assert.equal(isAdminPosterVerificationFilter("review"), false);
  assert.equal(isAdminPosterSort("deadline_asc"), true);
  assert.equal(isAdminPosterSort("random"), false);
});

test("deadline and verification sorting stays stable", () => {
  assert.deepEqual(getAdminPosterSortOrders("deadline_asc", "published"), [
    { column: "application_end_at", ascending: true, nullsFirst: false },
    { column: "created_at", ascending: false },
  ]);
  assert.deepEqual(
    getAdminPosterSortOrders("verification_status", "review"),
    [
      { column: "verification_status", ascending: true, nullsFirst: false },
      { column: "created_at", ascending: true },
    ],
  );
});

test("condition count ignores the default sort", () => {
  const base = {
    text: "",
    org: "",
    categoryId: "",
    regionId: "",
    media: "",
    deadlineType: "",
    verificationStatus: "",
    sort: "default" as const,
  };

  assert.equal(countAdminPosterConditions(base), 0);
  assert.equal(
    countAdminPosterConditions({
      ...base,
      deadlineType: "fixed",
      verificationStatus: "needs_review",
      sort: "deadline_asc",
    }),
    3,
  );
});
