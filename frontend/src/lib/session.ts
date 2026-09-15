import { ensureDevSession } from "./api";

/**
 * Fired once at module load (app start) so every component that needs an
 * authenticated request can `await devSessionReady` instead of each
 * re-triggering the dev-login bootstrap independently. See
 * ensureDevSession's docblock — this is a local-development-only stand-in
 * for a real login flow, not used for anything beyond establishing the
 * session cookie.
 */
export const devSessionReady: Promise<void> = ensureDevSession().catch((error) => {
  console.error("Failed to establish dev session:", error);
  throw error;
});
