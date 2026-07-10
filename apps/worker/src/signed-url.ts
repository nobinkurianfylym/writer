/**
 * Helpers for reasoning about the expiry of AWS SigV4 presigned URLs.
 *
 * A presigned URL embeds `X-Amz-Date` (ISO8601 basic, e.g. 20260710T120000Z)
 * and `X-Amz-Expires` (seconds). The absolute expiry is their sum. We parse
 * these back out so callers (and tests) can reason about expiry with a
 * controllable clock rather than trusting wall time.
 */

export function parseAmzDate(amzDate: string): number {
  // Format: YYYYMMDDTHHMMSSZ
  const match =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate);
  if (!match) {
    throw new Error(`Malformed X-Amz-Date: ${amzDate}`);
  }
  const [, y, mo, d, h, mi, s] = match;
  return Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
}

export interface PresignExpiry {
  signedAt: number;
  expiresAt: number;
}

export function getPresignedUrlExpiry(url: string): PresignExpiry {
  const params = new URL(url).searchParams;
  const amzDate = params.get("X-Amz-Date");
  const expiresIn = params.get("X-Amz-Expires");
  if (!amzDate || !expiresIn) {
    throw new Error("URL is not an AWS SigV4 presigned URL");
  }
  const signedAt = parseAmzDate(amzDate);
  return {
    signedAt,
    expiresAt: signedAt + Number(expiresIn) * 1000,
  };
}

export function isPresignedUrlExpired(
  url: string,
  now: number = Date.now(),
): boolean {
  return now >= getPresignedUrlExpiry(url).expiresAt;
}
