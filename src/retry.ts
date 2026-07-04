/**
 * Retry helpers for transient HTTP errors.
 *
 * Used by `streamChatResponse` to retry on rate limits (429), server errors
 * (5xx), and transient 400s (overloaded, timeout, "try again").
 */

/**
 * Whether an HTTP status + body combination is worth retrying.
 *
 * Retryable:
 *   - 429 (rate limited)
 *   - 500, 502, 503, 504 (server errors)
 *   - 400 with transient keywords (overloaded, timeout, try again)
 *
 * Non-retryable (fail fast):
 *   - 401 (bad API key)
 *   - 402 (insufficient credits)
 *   - 404 (model not found)
 *   - 400 without transient keywords (malformed request)
 */
export function shouldRetryHttp(status: number, responseText: string): boolean {
  // Rate limited — always retry (caller should honor Retry-After).
  if (status === 429) return true;

  // Server errors — retry.
  if (status >= 500 && status <= 599) return true;

  // Transient 400 errors — retry only if body contains transient keywords.
  if (status === 400) {
    const lower = responseText.toLowerCase();
    return (
      lower.includes("timeout") ||
      lower.includes("overloaded") ||
      lower.includes("try again") ||
      lower.includes("temporarily") ||
      lower.includes("capacity")
    );
  }

  return false;
}

/**
 * Exponential backoff delay with jitter.
 *
 * Returns: ~1s, ~2s, ~4s, capped at 8s (with ±25% jitter).
 *
 * @param attempt Zero-based attempt number (0 = first retry).
 */
export function retryDelayMs(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 8000);
  const jitter = base * 0.25 * (Math.random() * 2 - 1); // ±25%
  return Math.max(100, Math.round(base + jitter));
}

/**
 * Parse the `Retry-After` HTTP header (seconds or HTTP date).
 * Returns delay in milliseconds, or `undefined` if not parseable.
 */
export function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header) return undefined;

  // Numeric = seconds.
  const seconds = parseInt(header, 10);
  if (!Number.isNaN(seconds) && /^\d+$/.test(header.trim())) {
    return Math.min(seconds * 1000, 60_000);
  }

  // HTTP date format.
  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    const diff = date.getTime() - Date.now();
    return diff > 0 ? Math.min(diff, 60_000) : undefined;
  }

  return undefined;
}
