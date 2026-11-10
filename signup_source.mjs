// First-touch signup source tagging (Dan, Nekh-approved, 2026-11-08).
//
// A learner may land on the app from a YouTube link, a Facebook post, the
// expo QR, a newsletter, or a bare URL. The tag lives in `?source=` (or
// `utm_source=` as a fallback) on that first URL. Once captured, it goes
// into localStorage with first-touch wins — a later load with a different
// source (e.g. a friend clicks a different link into the same browser)
// never overwrites what is already there. The stored value then survives
// the Google OAuth round-trip, and the trial-row creation in
// netlify/functions/checkAccess.js reads it back for the insert.
//
// Only accepts `[a-z0-9_-]{1,40}` lowercase. Anything else — overlong,
// upper-case, spaces, punctuation, a bare "?source=" — is dropped and the
// row ends up NULL (unknown), which is better than storing noise.

export const STORAGE_KEY = "zth_signup_source";
const PATTERN = /^[a-z0-9_-]{1,40}$/;

// Lowercases and trims; anything that still doesn't match the pattern
// returns null. Null means "no usable source on this URL", which keeps
// the stored first-touch value untouched.
export function sanitiseSignupSource(raw) {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  return PATTERN.test(trimmed) ? trimmed : null;
}

// Pulls `?source=` or `?utm_source=` out of a URL query string. `source`
// wins when both are set. A missing or malformed param returns null.
export function sourceFromSearch(search) {
  if (!search) return null;
  let params;
  try {
    params = new URLSearchParams(String(search));
  } catch {
    return null;
  }
  const direct = sanitiseSignupSource(params.get("source"));
  if (direct) return direct;
  return sanitiseSignupSource(params.get("utm_source"));
}

// Returns the already-stored first-touch source, or null when the storage
// is empty or unreachable (private window, cleared data, storage throws).
export function readStoredSignupSource(storage) {
  if (!storage) return null;
  try {
    const stored = storage.getItem(STORAGE_KEY);
    return sanitiseSignupSource(stored);
  } catch {
    return null;
  }
}

// Read the source off the URL and persist it on first touch. A value
// already in storage is kept as-is (first-touch wins); a URL with no
// usable source leaves the stored value alone. Returns whatever is now
// stored (the first-touch value, or null when nothing was ever captured).
// Fail-soft: any storage error short-circuits to null without throwing.
export function captureSignupSource(storage, search) {
  if (!storage) return null;
  try {
    const existing = sanitiseSignupSource(storage.getItem(STORAGE_KEY));
    if (existing) return existing;
    const incoming = sourceFromSearch(search);
    if (!incoming) return null;
    storage.setItem(STORAGE_KEY, incoming);
    return incoming;
  } catch {
    return null;
  }
}
