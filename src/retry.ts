/**
 * Minimal retry helper for transient HTTP errors.
 */

export function shouldRetryHttp400(status: number, responseText: string): boolean {
  // Retry on transient 400 errors (e.g., malformed request that might succeed on retry)
  if (status !== 400) return false;
  const lower = responseText.toLowerCase();
  return lower.includes("timeout") || lower.includes("overloaded") || lower.includes("try again");
}

export function retryDelayMs(attempt: number): number {
  // Exponential backoff: 1s, 2s, 4s
  return Math.min(1000 * Math.pow(2, attempt), 8000);
}
