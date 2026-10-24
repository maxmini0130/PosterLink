// Temporary company mailbox confirmed by the operator on 2026-10-24.
// A future dedicated mailbox requires confirmation and an explicit config change.
export const WITHDRAWAL_EMAIL_SUBJECT =
  "PosterLink 회원 탈퇴 및 개인정보 삭제 요청";

/** Explicit empty/false overrides still disable the operator-confirmed default. */
export function withdrawalContact(
  raw = process.env.NEXT_PUBLIC_WITHDRAWAL_REQUEST_URL ??
    "mailto:maxmini@maxmini.co.kr",
  verified = process.env.NEXT_PUBLIC_WITHDRAWAL_CONTACT_VERIFIED ?? "true",
): { href: string; label: string } | null {
  if (verified !== "true" || !raw?.trim() || /[%\r\n]/.test(raw)) return null;
  try {
    const url = new URL(raw.trim());
    if (url.search || url.hash || url.username || url.password) return null;
    if (
      url.protocol === "mailto:" &&
      /^[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]+$/.test(url.pathname)
    ) {
      return { href: url.href, label: url.pathname };
    }
    if (
      url.protocol === "https:" &&
      url.hostname.includes(".") &&
      url.hostname !== "localhost"
    ) {
      return { href: url.href, label: url.href };
    }
  } catch {
    /* Invalid configuration must not become a request link. */
  }
  return null;
}

export function withdrawalRequestHref(
  contact = withdrawalContact(),
): string | null {
  if (!contact) return null;
  return contact.href.startsWith("mailto:")
    ? `${contact.href}?subject=${encodeURIComponent(WITHDRAWAL_EMAIL_SUBJECT)}`
    : contact.href;
}
