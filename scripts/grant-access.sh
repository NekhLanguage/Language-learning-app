#!/usr/bin/env bash
#
# Grant app access to a user by upserting their email into the Supabase
# `users` table. Used for manual grants ("Nekh got a sale email, add this
# person") until a webhook-based automation is in place.
#
# Usage:
#   scripts/grant-access.sh jane@example.com
#   scripts/grant-access.sh "  Jane@Example.COM "   # whitespace + case OK
#
# Reads SUPABASE_URL and SUPABASE_KEY from netlify/functions/checkAccess.js
# (same anon key the rest of the app already uses — no new secrets needed).
# The same key has insert permission on the users table, since saveUser.js
# already writes to it on every session save.

set -euo pipefail

if [ $# -ne 1 ] || [ -z "${1// /}" ]; then
  echo "Usage: $0 <email>" >&2
  exit 2
fi

# Normalise: lowercase + trim. Supabase already enforces uniqueness on email,
# so the upsert ('Prefer: resolution=merge-duplicates') is idempotent — safe
# to re-run for an existing user.
email="$(echo "$1" | tr '[:upper:]' '[:lower:]' | xargs)"

if ! [[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "Refusing: '$email' doesn't look like an email" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUPABASE_URL="$(grep -oE 'https://[a-z0-9]+\.supabase\.co' "$ROOT/netlify/functions/checkAccess.js" | head -n1)"
SUPABASE_KEY="$(grep -oE '"eyJ[^"]+"' "$ROOT/netlify/functions/checkAccess.js" | head -n1 | tr -d '"')"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "Could not extract Supabase credentials from netlify/functions/checkAccess.js" >&2
  exit 1
fi

response=$(curl -sS -o /tmp/grant-access.body -w '%{http_code}' \
  -X POST "$SUPABASE_URL/rest/v1/users" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  --data "{\"email\":\"$email\",\"data\":null}")

if [ "$response" != "201" ] && [ "$response" != "200" ]; then
  echo "Failed (HTTP $response):" >&2
  cat /tmp/grant-access.body >&2
  echo >&2
  exit 1
fi

echo "Granted access: $email"
