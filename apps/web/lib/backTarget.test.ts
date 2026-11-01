import assert from "node:assert/strict";
import test from "node:test";

import { canGoBackInSite, type BackContext } from "./backTarget";

const base: BackContext = {
  historyLength: 3,
  pagesInDocument: 1,
  cameByHistory: false,
  referrer: "",
  origin: "https://posterlink.kr",
  earlierDocumentInTab: false,
  firstPageOfTab: false,
};

test("a shared link opened in a new tab goes to the home", () => {
  assert.equal(
    canGoBackInSite({ ...base, historyLength: 1, firstPageOfTab: true }),
    false,
  );
  assert.equal(
    canGoBackInSite({
      ...base,
      referrer: "https://search.example.com/",
      firstPageOfTab: true,
    }),
    false,
  );
});

test("the same detail opened again from a search goes back to the search (Codex P2-5)", () => {
  // Shared detail → 검색 → same detail by full page loads: the referrer is
  // the search, although the detail is the tab's first page.
  assert.equal(
    canGoBackInSite({
      ...base,
      referrer: "https://posterlink.kr/posters?q=review-navigation",
      firstPageOfTab: true,
    }),
    true,
  );
  // The same with the URLs typed in the address bar: no referrer, but the
  // tab showed PosterLink before.
  assert.equal(
    canGoBackInSite({
      ...base,
      earlierDocumentInTab: true,
      firstPageOfTab: true,
    }),
    true,
  );
  // The same by links inside the app (no new document).
  assert.equal(
    canGoBackInSite({ ...base, pagesInDocument: 3, firstPageOfTab: true }),
    true,
  );
});

test("back/forward to a detail goes back only when it was not the tab's first page", () => {
  assert.equal(
    canGoBackInSite({
      ...base,
      pagesInDocument: 3,
      cameByHistory: true,
      firstPageOfTab: true,
    }),
    false,
  );
  assert.equal(
    canGoBackInSite({ ...base, pagesInDocument: 3, cameByHistory: true }),
    true,
  );
});
