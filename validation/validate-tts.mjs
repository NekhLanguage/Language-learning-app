#!/usr/bin/env node
// validate-tts.mjs
// Sends sample words from each supported language to the TTS endpoint and
// verifies the response is a valid, non-silent MP3.
//
// Language list is sourced from languages.js at run time. Registering a new
// language in that file makes it automatically included here — no separate
// register-and-forget list.
//
// Requirements:
//   - Netlify dev server running locally (netlify dev) OR live URL via env
//   - Google TTS credentials in the environment (same as production)
//
// Usage:
//   node validation/validate-tts.mjs
//   TTS_BASE_URL=https://your-site.netlify.app node validation/validate-tts.mjs
//
// The script exits 0 on full pass, 1 on any failure.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, '..');
const LANG_DIR   = path.join(ROOT, 'lang');

// Base URL — default to local Netlify dev server
const BASE_URL     = (process.env.TTS_BASE_URL || 'http://localhost:8888').replace(/\/$/, '');
const TTS_ENDPOINT = `${BASE_URL}/.netlify/functions/tts`;

// Minimum MP3 body size in bytes. A real word should be well over 2KB.
// Anything below this is likely silence or a Google TTS error tone.
const MIN_MP3_BYTES = 1500;

// Timeout per request in milliseconds
const REQUEST_TIMEOUT_MS = 10000;

// Sample concept IDs to test per language.
// Chosen to exercise: a basic noun, a body noun, a verb (base form),
// an adjective, and a question word.
const SAMPLE_CONCEPTS = ['WATER', 'HAND', 'EAT', 'GOOD', 'WHAT'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadLanguageRegistry() {
  const url = pathToFileURL(path.join(ROOT, 'languages.js')).href;
  const mod = await import(url);
  return mod.AVAILABLE_LANGUAGES;
}

function getFormString(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry))     return entry[0] || null;
  if (typeof entry === 'object') return entry.form || entry.base || null;
  return null;
}

function loadSampleWords(langCode) {
  const filePath = path.join(LANG_DIR, `${langCode}.json`);
  if (!fs.existsSync(filePath)) return [];
  const data  = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const forms = data.forms || {};
  const words = [];
  for (const cid of SAMPLE_CONCEPTS) {
    const str = getFormString(forms[cid]);
    if (str) words.push({ concept: cid, text: str });
  }
  return words;
}

// Validate MP3 magic bytes.
// MP3 files start with: FF FB, FF F3, FF F2 (MPEG frames) or 49 44 33 (ID3 tag)
function isValidMp3(buffer) {
  if (!buffer || buffer.length < 4) return false;
  const b0 = buffer[0], b1 = buffer[1];
  // ID3 tag
  if (b0 === 0x49 && b1 === 0x44 && buffer[2] === 0x33) return true;
  // MPEG sync
  if (b0 === 0xFF && (b1 === 0xFB || b1 === 0xF3 || b1 === 0xF2 || b1 === 0xFA)) return true;
  return false;
}

async function testWord(ttsCode, text) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(TTS_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text, lang: ttsCode }),
      signal:  controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, reason: `HTTP ${res.status} — ${body.slice(0, 120)}` };
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer   = Buffer.from(arrayBuf);

    if (buffer.length < MIN_MP3_BYTES) {
      return {
        ok:     false,
        reason: `Response only ${buffer.length} bytes (min ${MIN_MP3_BYTES}) — probable silence`,
        bytes:  buffer.length,
      };
    }

    if (!isValidMp3(buffer)) {
      return {
        ok:     false,
        reason: `Invalid MP3 header (bytes: ${buffer[0].toString(16)} ${buffer[1].toString(16)} ${buffer[2].toString(16)})`,
        bytes:  buffer.length,
      };
    }

    return { ok: true, bytes: buffer.length };

  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return { ok: false, reason: `Timeout after ${REQUEST_TIMEOUT_MS}ms` };
    }
    return { ok: false, reason: err.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const LANGUAGES = await loadLanguageRegistry();

  console.log('=== validate-tts.mjs ===\n');
  console.log(`Endpoint : ${TTS_ENDPOINT}`);
  console.log(`Languages: ${LANGUAGES.length} from languages.js (${LANGUAGES.map(l => l.code).join(', ')})`);
  console.log(`Samples  : ${SAMPLE_CONCEPTS.join(', ')}`);
  console.log(`Timeout  : ${REQUEST_TIMEOUT_MS}ms per request\n`);

  // Quick connectivity check
  console.log('Checking endpoint reachability...');
  try {
    const probe = await fetch(TTS_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: 'test', lang: 'en-US' }),
      signal:  AbortSignal.timeout(5000),
    });
    // Any response (even 500) means the server is up
    console.log(`Endpoint reachable (HTTP ${probe.status}).\n`);
  } catch (e) {
    console.error(`ERROR: Cannot reach ${TTS_ENDPOINT}`);
    console.error(`       ${e.message}`);
    console.error('\nIs the Netlify dev server running? Try: netlify dev');
    console.error('Or set TTS_BASE_URL to the live site URL.\n');
    process.exit(1);
  }

  let anyFailed = false;
  const summary = [];

  for (const lang of LANGUAGES) {
    const words = loadSampleWords(lang.code);

    if (words.length === 0) {
      console.log(`[${lang.ttsCode}] SKIP — no sample words found in ${lang.code}.json`);
      summary.push({ ttsCode: lang.ttsCode, status: 'SKIP', passed: 0, total: 0 });
      continue;
    }

    process.stdout.write(`[${lang.ttsCode}] Testing ${words.length} words...`);

    const results = [];
    for (const word of words) {
      const result = await testWord(lang.ttsCode, word.text);
      results.push({ ...word, ...result });
    }

    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);
    const avgBytes = Math.round(
      results.filter(r => r.ok && r.bytes).reduce((s, r) => s + r.bytes, 0) /
      Math.max(results.filter(r => r.ok).length, 1)
    );

    if (failed.length === 0) {
      console.log(` PASS (${passed}/${words.length}, avg ${(avgBytes / 1024).toFixed(1)}KB)`);
      summary.push({ ttsCode: lang.ttsCode, status: 'PASS', passed, total: words.length });
    } else {
      anyFailed = true;
      console.log(` FAILED (${passed}/${words.length} passed)`);
      for (const f of failed) {
        console.log(`         FAIL [${f.concept}] "${f.text}" — ${f.reason}`);
      }
      summary.push({ ttsCode: lang.ttsCode, status: 'FAILED', passed, total: words.length });
    }
  }

  // Summary table
  console.log('\n──────────────────────────────────────────────────');
  console.log('TTS CODE  STATUS    PASSED / TOTAL');
  console.log('──────────────────────────────────────────────────');
  for (const row of summary) {
    const code   = row.ttsCode.padEnd(9);
    const status = row.status.padEnd(8);
    const score  = row.status === 'SKIP' ? '–' : `${row.passed} / ${row.total}`;
    console.log(`${code} ${status}  ${score}`);
  }
  console.log('──────────────────────────────────────────────────');

  if (anyFailed) {
    console.log('\nRESULT: FAILED — TTS issues must be resolved before launch.\n');
    process.exit(1);
  } else {
    console.log('\nRESULT: PASSED TTS check.\n');
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
