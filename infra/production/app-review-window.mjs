export const APP_REVIEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// One clock reading for both boundaries: two Date.now() calls can produce a
// duration slightly greater than the database's strict 30-day maximum.
export function createAppReviewWindow(now = Date.now()) {
  if (!Number.isFinite(now)) throw new Error('Invalid review window start');
  return {startsAt: new Date(now).toISOString(), expiresAt: new Date(now + APP_REVIEW_WINDOW_MS).toISOString()};
}
