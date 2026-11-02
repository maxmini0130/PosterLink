"use client";

/**
 * How the current page of this document was reached, for the detail's
 * 뒤로 가기 (lib/backTarget.ts). Updated by InSiteHistoryTracker in the root
 * layout on every page.
 */
let pagesInDocument = 0;
let popPending = false;
let cameByHistory = false;
let earlierDocumentInTab = false;

const TAB_DOCUMENTS_KEY = "pl:tab-documents";

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    popPending = true;
  });
  let navigationType: string | undefined;
  try {
    const [navigation] = performance.getEntriesByType("navigation");
    navigationType = (navigation as PerformanceNavigationTiming | undefined)
      ?.type;
  } catch {
    /* no navigation timing */
  }
  // A page restored with back/forward is a history move too.
  popPending = navigationType === "back_forward";
  // sessionStorage is per tab and per site: a count above zero means this
  // tab showed a PosterLink page in an earlier document. A reload counted
  // itself before, so it relies on the referrer alone.
  try {
    const seen = Number(sessionStorage.getItem(TAB_DOCUMENTS_KEY) ?? "0");
    earlierDocumentInTab = seen > 0 && navigationType !== "reload";
    sessionStorage.setItem(TAB_DOCUMENTS_KEY, String(seen + 1));
  } catch {
    /* storage blocked */
  }
}

export function notePageShown() {
  pagesInDocument += 1;
  cameByHistory = popPending;
  popPending = false;
}

export function currentArrival() {
  return { pagesInDocument, cameByHistory, earlierDocumentInTab };
}
