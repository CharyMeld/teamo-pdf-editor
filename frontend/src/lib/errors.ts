/** Pulls the backend's real `{error:{message}}` envelope out of an axios
 * error, falling back to a generic message only when the response genuinely
 * doesn't carry one (a network failure, not a rejected request). Mirrors
 * useOpenDocument's local copy of the same logic (Phase 2) — kept as a
 * shared util here so Phase 3's operation hooks don't duplicate it inline. */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object"
  ) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data as { error?: { message?: string } } | undefined;
    if (data?.error?.message) return data.error.message;
  }
  return fallback;
}
