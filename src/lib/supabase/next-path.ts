/**
 * Sanitizes a `?next=` redirect target.
 *
 * Auth flows accept a `next` parameter so users land back where they were
 * headed (e.g. /account/login?next=/account/orders). Accepting it blindly is
 * an open-redirect vulnerability — an attacker could point it at a phishing
 * page. This only allows same-origin paths and falls back to `fallback`
 * otherwise. (Pattern carried over from the proven v1 implementation.)
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/account",
): string {
  if (!value) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  // Same-origin path only: starts with "/", but not "//" (protocol-relative)
  // and contains no backslashes (some browsers treat "\evil.com" as a host).
  if (
    decoded.startsWith("/") &&
    !decoded.startsWith("//") &&
    !decoded.includes("\\")
  ) {
    return decoded;
  }

  return fallback;
}
