// tests/dev-server.mjs
//
// Zero-dependency local server for development and e2e tests.
// Serves the repo's static files with correct MIME types (including .mjs,
// which Netlify handles via netlify.toml headers in production) and stubs
// every /.netlify/functions/* endpoint the front-end calls, so the app runs
// fully offline — no Supabase, no Google TTS, no network.
//
// Usage:
//   node tests/dev-server.mjs            # http://127.0.0.1:8888
//   PORT=3000 node tests/dev-server.mjs
//
// Stub behavior (kept faithful to the real functions' response shapes):
//   POST /.netlify/functions/checkAccess  {email} -> {allowed}
//        allowed=false when the email contains "noaccess" (lets tests cover
//        the rejection path); true otherwise.
//   POST /.netlify/functions/loadUser     {email} -> {user} from the
//        in-memory store (null when unknown, like a fresh account).
//   POST /.netlify/functions/saveUser     {email, user} -> {ok:true}; stores
//        the blob in memory so a later loadUser round-trips it.
//   POST /.netlify/functions/beacon       -> 204 (analytics sink).
//   POST /.netlify/functions/submitBug    -> {ok:true}.
//   GET  /.netlify/functions/tts          -> a tiny silent MP3 (audio/mpeg),
//        so <audio> playback resolves without hitting Google Cloud.
//   GET  /__devserver/users               -> the in-memory user store, so
//        tests can assert on what the app synced.

import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8888);
const HOST = "127.0.0.1";
const QUIET = process.env.DEV_SERVER_QUIET === "1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
};

// One silent MPEG-1 Layer III frame (~26ms of silence) — enough for
// Audio.play() to succeed in the browser without real synthesis.
const SILENT_MP3 = Buffer.concat([
  Buffer.from([0xff, 0xfb, 0x90, 0x64]),
  Buffer.alloc(413, 0),
]);

// email -> user blob, mirroring the Supabase `users.data` column.
const userStore = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function handleFunction(name, req, res, url) {
  const raw = req.method === "GET" ? "" : await readBody(req);
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // The real functions 400 on bad JSON; the front-end never sends it.
    return sendJson(res, 400, { error: "Invalid JSON" });
  }

  switch (name) {
    case "checkAccess": {
      const email = String(body.email || "").toLowerCase();
      return sendJson(res, 200, { allowed: !!email && !email.includes("noaccess") });
    }
    case "loadUser": {
      const email = String(body.email || "").toLowerCase().trim();
      return sendJson(res, 200, { user: userStore.get(email) ?? null });
    }
    case "saveUser": {
      const email = String(body.email || "").toLowerCase().trim();
      if (email && body.user) userStore.set(email, body.user);
      return sendJson(res, 200, { ok: true });
    }
    case "beacon": {
      res.writeHead(204);
      return res.end();
    }
    case "submitBug": {
      return sendJson(res, 200, { ok: true });
    }
    case "tts": {
      const text = url.searchParams.get("text") || body.text || "";
      if (!text) return sendJson(res, 400, { error: "Missing text" });
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      });
      return res.end(SILENT_MP3);
    }
    default:
      return sendJson(res, 404, { error: `No stub for function "${name}"` });
  }
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.join(ROOT, pathname);
  // Keep path traversal (/../..) inside the repo root.
  if (!filePath.startsWith(ROOT + path.sep)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  let data;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return sendJson(res, 404, { error: `Not found: ${pathname}` });
  }

  res.writeHead(200, {
    "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (!QUIET) console.log(`${req.method} ${url.pathname}`);

  try {
    const fnMatch = url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)$/);
    if (fnMatch) return await handleFunction(fnMatch[1], req, res, url);

    if (url.pathname === "/__devserver/users") {
      return sendJson(res, 200, Object.fromEntries(userStore));
    }

    // The repo ships no favicon; answer the browser's automatic request
    // quietly so test logs stay free of 404 noise.
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }

    return await serveStatic(req, res, url);
  } catch (err) {
    console.error("dev-server error:", err);
    return sendJson(res, 500, { error: String(err && err.message) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Zero to Hero dev server: http://${HOST}:${PORT} (root: ${ROOT})`);
});
