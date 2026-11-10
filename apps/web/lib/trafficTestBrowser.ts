// Local to this browser/origin; never an account setting or an authorization signal.
export const TRAFFIC_TEST_BROWSER_KEY = "posterlink.traffic_test_browser.v1";
export const MANUAL_TEST_SOURCE = "manual-test";

export function readTrafficTestBrowser(storage: Pick<Storage, "getItem">) {
  return storage.getItem(TRAFFIC_TEST_BROWSER_KEY) === "1";
}

export function writeTrafficTestBrowser(
  storage: Pick<Storage, "setItem" | "removeItem">,
  enabled: boolean,
) {
  if (enabled) storage.setItem(TRAFFIC_TEST_BROWSER_KEY, "1");
  else storage.removeItem(TRAFFIC_TEST_BROWSER_KEY);
}
