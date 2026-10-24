import assert from "node:assert/strict";
import test from "node:test";
import {
  withdrawalContact,
  withdrawalRequestHref,
  WITHDRAWAL_EMAIL_SUBJECT,
} from "./withdrawalContact";

test("unverified and invalid channels never become request links", () => {
  for (const value of [
    undefined,
    "",
    "mailto:qa@example.invalid",
    "https://example.invalid/request",
  ])
    assert.equal(withdrawalContact(value, "false"), null);
  for (const value of [
    "javascript:alert(1)",
    "http://example.invalid",
    "mailto:bad",
    "https://u:p@example.invalid",
    "https://example.invalid?token=private",
    "mailto:qa@example.invalid?body=private",
  ])
    assert.equal(withdrawalContact(value, "true"), null);
  assert.equal(withdrawalContact("", "true"), null);
});

test("only explicitly confirmed supported contacts are returned", () => {
  assert.deepEqual(withdrawalContact("mailto:qa@example.invalid", "true"), {
    href: "mailto:qa@example.invalid",
    label: "qa@example.invalid",
  });
  assert.deepEqual(
    withdrawalContact("https://example.invalid/request", "true"),
    {
      href: "https://example.invalid/request",
      label: "https://example.invalid/request",
    },
  );
});

test("approved temporary mailbox has the exact subject and no sensitive body", () => {
  const contact = withdrawalContact();
  assert.deepEqual(contact, {
    href: "mailto:maxmini@maxmini.co.kr",
    label: "maxmini@maxmini.co.kr",
  });
  const url = new URL(withdrawalRequestHref(contact)!);
  assert.equal(url.pathname, "maxmini@maxmini.co.kr");
  assert.equal(
    url.searchParams.get("subject"),
    "PosterLink 회원 탈퇴 및 개인정보 삭제 요청",
  );
  assert.equal(WITHDRAWAL_EMAIL_SUBJECT, url.searchParams.get("subject"));
  assert.deepEqual([...url.searchParams.keys()], ["subject"]);
  assert.equal(withdrawalRequestHref(null), null);
});
