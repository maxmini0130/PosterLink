/** Only an operator-confirmed channel may be shown as a working request path. */
export function withdrawalContact(
  raw = process.env.NEXT_PUBLIC_WITHDRAWAL_REQUEST_URL,
  verified = process.env.NEXT_PUBLIC_WITHDRAWAL_CONTACT_VERIFIED,
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
