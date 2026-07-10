/**
 * Sanitizes a post-login redirect target: only same-origin, absolute in-app
 * paths are allowed, so a crafted `?next=https://evil.example` can never turn
 * the login form into an open redirect.
 */
export function safeNext(
  next: string | null | undefined,
  fallback = "/",
): string {
  if (!next) return fallback;
  // Must be a root-relative path, and not a protocol-relative "//host" URL.
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
