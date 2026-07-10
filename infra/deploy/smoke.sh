#!/usr/bin/env bash
# Post-deploy smoke suite. Fails (non-zero) if any check fails, which the CD
# pipeline treats as a bad deploy and rolls back.
#
# Usage: smoke.sh https://api.staging.fylym.app https://staging.fylym.app
set -euo pipefail

API_URL="${1:?api base url required}"
WEB_URL="${2:?web base url required}"

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1" >&2; exit 1; }

check_status() {
  local url="$1" expected="$2" desc="$3"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo 000)"
  [ "$code" = "$expected" ] && pass "$desc ($code)" || fail "$desc: expected $expected got $code"
}

echo "Smoke: API $API_URL"
check_status "$API_URL/health" 200 "api health"
# Unauthenticated protected route must 401 (auth wired), not 500/404.
check_status "$API_URL/auth/me" 401 "api auth guard"

echo "Smoke: Web $WEB_URL"
check_status "$WEB_URL/login" 200 "web login page"

# The API must advertise credentialed CORS for the web origin.
acao="$(curl -sS -o /dev/null -D - --max-time 15 \
  -H "Origin: $WEB_URL" -X POST "$API_URL/auth/login" \
  | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
[ "$acao" = "$WEB_URL" ] && pass "cors origin ($acao)" || fail "cors origin: expected $WEB_URL got '${acao:-none}'"

echo "Smoke passed."
