# §9 Security Checklist — Phase 1 (E7-1)

Each item lists its status and the evidence (file / mechanism) implementing
it. "Verified" means exercised locally in this repo; "staging" means it needs
the deployed environment (tracked for the ZAP/drill pass).

## Transport & headers

| Item | Status | Evidence |
|---|---|---|
| CSP with per-request nonce (web) | ✅ verified | `apps/web/src/middleware.ts` — strict `script-src 'self' 'nonce-…'`; root layout `force-dynamic` so the nonce is stamped. Loaded `/login` with **0 CSP violations**. |
| API security headers | ✅ verified | `apps/api/src/main.ts` — helmet: CSP `default-src 'none'`, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy`, HSTS in prod; `x-powered-by` disabled (confirmed via `curl -D-`). |
| Web security headers | ✅ verified | `middleware.ts` — `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. |
| TLS 1.3 + Cloudflare origin lock | ✅ staging | `infra/terraform/main.tf` (ALB TLS13 policy), `modules/network` ALB SG admits only Cloudflare ranges. |

## Auth, sessions & CSRF

| Item | Status | Evidence |
|---|---|---|
| Password hashing (argon2id, OWASP params) | ✅ verified | `apps/api/src/auth/auth.service.ts` (m=19456,t=2,p=1); tested in `auth.integration.spec.ts`. |
| ES256 access JWT + rotating refresh, family-reuse revoke | ✅ verified | `auth/jwt.service.ts`, `auth.service.ts`; reuse-detection test in `auth.integration.spec.ts`. |
| Refresh cookie flags | ✅ verified | `auth.controller.ts` `setRefreshCookie`: `httpOnly`, `secure` (prod), `sameSite: "strict"`, `path: "/auth"`. |
| CSRF | ✅ verified | All mutations authenticate with `Authorization: Bearer` (not an ambient cookie), so no cross-site request can forge them. The only cookie-authed route, `POST /auth/refresh`, is `SameSite=Strict` + path-scoped and returns only a short-lived token — not a state change. No classic double-submit token is needed given the Bearer model; documented here as the design decision. |
| Magic links single-use, hashed at rest, 10-min TTL | ✅ verified | `auth.service.ts` (SHA-256 in Redis); `auth.integration.spec.ts`. |

## Authorization & audit

| Item | Status | Evidence |
|---|---|---|
| Single policy-table RBAC guard | ✅ verified | `apps/api/src/rbac/` — `policy-table.ts` + `rbac.guard.ts`; role×endpoint matrix test `rbac.spec.ts`. |
| Tamper-evident audit hash chain | ✅ verified | `apps/api/src/audit/audit.service.ts`; chain-verify + tamper test in `audit.integration.spec.ts`. |
| Prisma parameterization (no raw SQL) | ✅ verified | No `$queryRaw`/`$executeRaw` in `apps/api`/`apps/worker`. |

## Rate limiting & abuse

| Item | Status | Evidence |
|---|---|---|
| Rate-limit budget on auth | ✅ verified | `RateLimitGuard` on `AuthController` (Redis sliding window, `RateLimit-*` headers). |
| Rate-limit budget on export | ✅ verified | `RateLimitGuard` on `ExportsController`; asserted in `jobs/exports.security.spec.ts`. |
| Cloudflare L7 + per-user/org buckets | ✅ staging | Cloudflare (edge) + Redis token buckets; edge rules configured in Cloudflare. |

## Upload / download hardening

| Item | Status | Evidence |
|---|---|---|
| Upload content-type / size hardening | ✅ verified | State upload validates base64 + zstd decode and enforces a per-plan ceiling with a clean 413 (`scripts/script-state.service.ts`, tested). `nosniff` on all responses. |
| Download via short-lived signed URLs | ✅ verified | Export artifacts served only via S3 presigned URLs minted per request (`jobs/s3.service.ts`, worker `signed-url.ts`); expiry test in worker. |
| Encryption at rest (KMS) | ✅ staging | `infra/terraform/modules/data` — RDS/S3 KMS encryption; S3 bucket blocks public access. |

## CI gates & audits

| Item | Status | Evidence |
|---|---|---|
| Dependency audit gate | ✅ verified | `.github/workflows/security.yml` → `pnpm audit --audit-level high`. |
| Semgrep SAST gate | ✅ CI | `.github/workflows/security.yml` (p/typescript, p/react, p/nodejs, p/owasp-top-ten, p/secrets). |
| Committed-secrets scan | ✅ verified | `scripts/secrets-scan.sh` — runs clean locally; gated in CI. `.env` files gitignored (only `*.env.example` tracked). |
| ZAP baseline scan (no medium+ unaddressed) | ⏳ staging | Runs against the deployed staging URL; wire into the deploy pipeline once staging is live. |

## Notes

- The two staging-only items (ZAP baseline, live 5xx/CSP scans) require the
  deployed environment from E6-4/E6-5 and are the remaining gate before Phase
  1 security sign-off.
