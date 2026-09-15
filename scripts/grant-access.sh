#!/usr/bin/env bash
#
# Grant app access to a user by upserting their email into the Supabase
# `users` table. Used for manual grants ("Nekh got a sale email, add this
# person") until a webhook-based automation is in place.
#
# Usage:
#   scripts/grant-access.sh jane@example.com            # app access only
#   scripts/grant-access.sh jane@example.com 4          # + Anna for 4 months
#   scripts/grant-access.sh jane@example.com forever    # + Anna, permanent
#   scripts/grant-access.sh "  Jane@Example.COM "       # whitespace + case OK
#
# The second argument sets users.access_until (the Anna subscription window,
# see migrations/users_access_until.sql). Without it an existing row keeps
# its window and a new row gets none (Anna greyed out). The learner then
# signs in with a password or Google; the row is what grants access.
#
# Reads SUPABASE_URL from netlify/functions/supabase.js and the key from $SUPABASE_PUBLISHABLE_KEY
# (same anon key the rest of the app already uses — no new secrets needed).
# The same key has insert permission on the users table, since saveUser.js
# already writes to it on every session save.

set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ] || [ -z "${1// /}" ]; then
  echo "Usage: $0 <email> [months|forever]" >&2
  exit 2
fi

# Anna subscription window → JSON fragment for the access_until column.
access_json=""
if [ $# -eq 2 ]; then
  case "$2" in
    forever) access_json=',"access_until":"infinity"' ;;
    ''|*[!0-9]*) echo "Refusing: second argument must be a number of months or 'forever'" >&2; exit 2 ;;
    *) until_ts="$(date -u -d "+$2 months" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+"$2"m +%Y-%m-%dT%H:%M:%SZ)"
       access_json=",\"access_until\":\"$until_ts\"" ;;
  esac
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
SUPABASE_URL="$(grep -oE 'https://[a-z0-9]+\.supabase\.co' "$ROOT/netlify/functions/supabase.js" | head -n1)"
# The key is never in the repo: export SUPABASE_PUBLISHABLE_KEY (the
# sb_publishable_ key from Supabase → Settings → API Keys) before running.
SUPABASE_KEY="${SUPABASE_PUBLISHABLE_KEY:-}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "Set SUPABASE_PUBLISHABLE_KEY in your environment (and keep netlify/functions/supabase.js's URL intact)" >&2
  exit 1
fi

response=$(curl -sS -o /tmp/grant-access.body -w '%{http_code}' \
  -X POST "$SUPABASE_URL/rest/v1/users" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  --data "{\"email\":\"$email\"$access_json}")

if [ "$response" != "201" ] && [ "$response" != "200" ]; then
  echo "Failed (HTTP $response):" >&2
  cat /tmp/grant-access.body >&2
  echo >&2
  exit 1
fi

echo "Granted access: $email${access_json:+ (Anna window set)}"
