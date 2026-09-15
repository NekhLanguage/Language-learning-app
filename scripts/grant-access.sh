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
# Reads SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from the shell environment.
# The publishable key has insert permission on the users table via RLS, since
# saveUser.js already writes to it on every session save.
#
# Export before running:
#   export SUPABASE_URL=https://<project-ref>.supabase.co
#   export SUPABASE_PUBLISHABLE_KEY=sb_publishable_default_...

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

SUPABASE_KEY="${SUPABASE_PUBLISHABLE_KEY:-}"

if [ -z "${SUPABASE_URL:-}" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in your shell environment before running." >&2
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
