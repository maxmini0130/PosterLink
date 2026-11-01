/**
 * Where the detail's 뒤로 가기 goes (screen plan v1.0, 06). The phone tab bar
 * is hidden on the detail, so the button must never take the user out of
 * PosterLink: it goes back only when the previous history entry is a page of
 * this site, otherwise to the home.
 */
export type BackContext = {
  /** window.history.length */
  historyLength: number;
  /** Pages shown in this document so far, the current one included. */
  pagesInDocument: number;
  /** The current page was reached with the browser's back/forward. */
  cameByHistory: boolean;
  /** document.referrer and the site origin, for a full page load. */
  referrer: string;
  origin: string;
  /** An earlier document of this tab was a PosterLink page. */
  earlierDocumentInTab: boolean;
  /** The current page is the first page opened in this tab. */
  firstPageOfTab: boolean;
};

export function canGoBackInSite(context: BackContext) {
  if (context.historyLength <= 1) return false;
  // Back/forward: the entry before this one is not known; only the first
  // page of the tab is sure to have something outside the site before it.
  if (context.cameByHistory) return !context.firstPageOfTab;
  // A link inside this document brought the user here.
  if (context.pagesInDocument > 1) return true;
  // A full page load: the previous page is the referrer; with none (a URL
  // typed in the address bar) it was this site only if this tab showed it.
  if (!context.referrer) return context.earlierDocumentInTab;
  try {
    return new URL(context.referrer).origin === context.origin;
  } catch {
    return false;
  }
}
