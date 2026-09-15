// auth.mjs — the app's one door to Supabase Auth (Nekh 2026-09-15).
//
// Every learner signs in with an email + password or with Google; the
// resulting Supabase session is what the Netlify functions verify (see
// netlify/functions/auth.js). This module wraps the vendored supabase-js
// UMD build (vendor/supabase-js-*.umd.js, exposed as window.supabase) so
// app.js, tutor.js and auth.html share one client and one storage key.
//
// Configuration (project URL + publishable key) is fetched once from
// /.netlify/functions/authConfig and cached in localStorage; nothing about
// the Supabase project lives in this file.
//
// e2e seam: the offline dev server answers authConfig with { stub: true }.
// In that mode this module keeps a fake session in localStorage and issues
// `stub-token:<email>` bearer tokens that the dev server's function stubs
// accept. Production never returns stub:true, and the real functions
// reject such tokens.

const CONFIG_KEY = "zth_auth_config";
const STUB_SESSION_KEY = "zth_auth_stub_session";
const STUB_GOOGLE_EMAIL_KEY = "zth_auth_stub_google_email";
export const AUTH_STORAGE_KEY = "zth_auth";

let configPromise = null;
let adapterPromise = null;

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the session still works for this page load.
  }
}

function validConfig(cfg) {
  return !!cfg && (cfg.stub === true || (typeof cfg.url === "string" && typeof cfg.publishableKey === "string"));
}

async function fetchConfig() {
  const res = await fetch("/.netlify/functions/authConfig", { cache: "no-store" });
  if (!res.ok) throw new Error(`authConfig failed (${res.status})`);
  const cfg = await res.json();
  if (!validConfig(cfg)) throw new Error("authConfig returned an unusable payload");
  writeJson(CONFIG_KEY, cfg);
  return cfg;
}

// The auth configuration: the cached copy when there is one (a fresh copy
// is fetched in the background for the next boot), otherwise a live fetch.
export function loadAuthConfig() {
  if (!configPromise) {
    const cached = readJson(CONFIG_KEY);
    if (validConfig(cached)) {
      configPromise = Promise.resolve(cached);
      fetchConfig().catch(() => {});
    } else {
      configPromise = fetchConfig().catch((err) => {
        configPromise = null;
        throw err;
      });
    }
  }
  return configPromise;
}

// --- Real adapter (supabase-js) --------------------------------------------

function realAdapter(cfg) {
  const lib = globalThis.supabase;
  if (!lib || typeof lib.createClient !== "function") {
    throw new Error("supabase-js is not loaded (vendor/supabase-js-*.umd.js)");
  }
  const client = lib.createClient(cfg.url, cfg.publishableKey, {
    auth: {
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      // Implicit flow: the recovery / OAuth links carry the session in the
      // URL hash, so an email link opened in another browser still works.
      detectSessionInUrl: true,
      flowType: "implicit",
    },
  });

  function toSession(session) {
    const email = String(session?.user?.email || "").toLowerCase().trim();
    if (!email || !session?.access_token) return null;
    return { email, accessToken: session.access_token, provider: session.user?.app_metadata?.provider || "email" };
  }

  return {
    kind: "supabase",
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return toSession(data?.session);
    },
    async signInWithPassword(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return toSession(data?.session);
    },
    async signInWithGoogle() {
      // Identity scopes only (Supabase's Google defaults: openid, email,
      // profile). Never request Gmail or other data scopes here.
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // The browser is navigating to Google; nothing else to do.
    },
    async sendPasswordEmail(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth.html`,
      });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    onAuthStateChange(cb) {
      const { data } = client.auth.onAuthStateChange((event, session) => cb(event, toSession(session)));
      return () => data?.subscription?.unsubscribe();
    },
  };
}

// --- Stub adapter (offline dev server / e2e) --------------------------------

function stubAdapter() {
  const read = () => {
    const s = readJson(STUB_SESSION_KEY);
    const email = String(s?.email || "").toLowerCase().trim();
    return email ? { email, accessToken: `stub-token:${email}`, provider: s?.provider || "email" } : null;
  };
  return {
    kind: "stub",
    async getSession() { return read(); },
    async signInWithPassword(email, password) {
      const normalized = String(email || "").toLowerCase().trim();
      if (!normalized || !password || /wrongpassword/i.test(password)) {
        throw new Error("Invalid login credentials");
      }
      writeJson(STUB_SESSION_KEY, { email: normalized, provider: "email" });
      return read();
    },
    async signInWithGoogle() {
      const email = localStorage.getItem(STUB_GOOGLE_EMAIL_KEY) || "google-user@example.com";
      writeJson(STUB_SESSION_KEY, { email: email.toLowerCase().trim(), provider: "google" });
      location.assign("/");
    },
    async sendPasswordEmail(email) {
      if (!email) throw new Error("Email required");
    },
    async updatePassword(password) {
      if (!password || password.length < 8) throw new Error("Password should be at least 8 characters");
    },
    async signOut() { writeJson(STUB_SESSION_KEY, null); },
    onAuthStateChange() { return () => {}; },
  };
}

async function adapter() {
  if (!adapterPromise) {
    adapterPromise = loadAuthConfig()
      .then((cfg) => (cfg.stub ? stubAdapter() : realAdapter(cfg)))
      .catch((err) => {
        adapterPromise = null;
        throw err;
      });
  }
  return adapterPromise;
}

// --- Public API --------------------------------------------------------------

// The signed-in learner: { email, accessToken, provider } or null. Never
// throws: when the auth backend cannot be reached the caller sees "no
// session" and the app shows the sign-in screen.
export async function getSession() {
  try {
    return await (await adapter()).getSession();
  } catch (err) {
    console.warn("auth: no session available:", err && err.message);
    return null;
  }
}

// Headers for a Netlify function call on the learner's behalf. Empty when
// nobody is signed in (the function then answers 401).
export async function authHeaders(extra = {}) {
  const session = await getSession();
  return session ? { ...extra, Authorization: `Bearer ${session.accessToken}` } : { ...extra };
}

// fetch() with the session token attached.
export async function authFetch(url, init = {}) {
  const headers = await authHeaders(init.headers || {});
  return fetch(url, { ...init, headers });
}

export async function signInWithPassword(email, password) {
  return (await adapter()).signInWithPassword(email, password);
}

export async function signInWithGoogle() {
  return (await adapter()).signInWithGoogle();
}

// "Set or reset your password": make sure the account exists for a learner
// who bought access before the app had passwords (authProvision), then let
// Supabase send the email. Both answer the same for unknown addresses.
export async function sendPasswordEmail(email) {
  const normalized = String(email || "").toLowerCase().trim();
  if (!normalized) throw new Error("Email required");
  const provision = await fetch("/.netlify/functions/authProvision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalized }),
  });
  if (!provision.ok) throw new Error(`Account setup failed (${provision.status})`);
  await (await adapter()).sendPasswordEmail(normalized);
}

export async function updatePassword(password) {
  return (await adapter()).updatePassword(password);
}

export async function signOut() {
  try {
    await (await adapter()).signOut();
  } catch (err) {
    console.warn("auth: sign-out failed:", err && err.message);
  }
}

export async function onAuthStateChange(cb) {
  return (await adapter()).onAuthStateChange(cb);
}

// Strip the tokens supabase-js consumed from the URL hash (OAuth / recovery
// return) so a reload or a copied link never replays them.
export function cleanAuthUrl() {
  try {
    if (/access_token=|refresh_token=|type=recovery|error_description=/.test(location.hash)) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch {
    // history API unavailable: harmless.
  }
}

// A human-readable line for an auth error.
export function describeAuthError(err) {
  const msg = String((err && err.message) || err || "");
  if (/invalid login credentials/i.test(msg)) return "Wrong email or password. New here, or bought access before passwords existed? Use “Set or reset your password”.";
  if (/email not confirmed/i.test(msg)) return "This email hasn't been confirmed yet — check your inbox.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts — wait a minute and try again.";
  if (/password should be|at least/i.test(msg)) return "Passwords need at least 8 characters.";
  if (/failed to fetch|network/i.test(msg)) return "Could not reach the sign-in service — check your connection and try again.";
  return msg || "Something went wrong — please try again.";
}
