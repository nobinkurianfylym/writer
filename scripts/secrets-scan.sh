#!/usr/bin/env bash
# Fails if a likely secret is committed to the repo. Runs in CI as a gate and
# is safe to run locally. Scans tracked files only (respects .gitignore, so
# local .env files are never flagged). Not a replacement for gitleaks in CI —
# a fast, dependency-free first line of defense (§9 secrets audit).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# High-signal patterns: private keys, cloud creds, and provider tokens.
patterns=(
  '-----BEGIN (RSA|EC|OPENSSH|PGP|DSA) PRIVATE KEY-----'
  'AKIA[0-9A-Z]{16}'                       # AWS access key id
  'aws_secret_access_key\s*=\s*[A-Za-z0-9/+]{40}'
  'sk_live_[0-9a-zA-Z]{24,}'               # Stripe live secret
  'ghp_[0-9A-Za-z]{36}'                    # GitHub PAT
  'xox[baprs]-[0-9A-Za-z-]{10,}'           # Slack token
  'https://hooks.slack.com/services/[A-Za-z0-9/]+'
)

# Files that legitimately contain example/placeholder secrets.
allowlist='(\.example$|/fixtures/|secrets-scan\.sh$|security-checklist\.md$)'

found=0
while IFS= read -r file; do
  [[ "$file" =~ $allowlist ]] && continue
  # Skip binary files.
  git grep -I -q "" -- "$file" 2>/dev/null || continue
  for pat in "${patterns[@]}"; do
    if git grep -nE "$pat" -- "$file" >/dev/null 2>&1; then
      echo "✗ potential secret in $file (pattern: $pat)"
      git grep -nE "$pat" -- "$file" | sed 's/^/    /'
      found=1
    fi
  done
done < <(git ls-files)

# The committed API .env must never exist (only .env.example is tracked).
if git ls-files --error-unmatch apps/api/.env >/dev/null 2>&1; then
  echo "✗ apps/api/.env is tracked — env files must stay gitignored"
  found=1
fi

if [ "$found" -ne 0 ]; then
  echo "Secrets scan FAILED."
  exit 1
fi
echo "Secrets scan clean."
