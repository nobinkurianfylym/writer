# Deploy the backend to Railway (make the live app work)

The web app is on Cloudflare Workers (`web.nobinkurian.workers.dev`). It needs
a reachable API. This deploys **api + worker + Postgres + Redis** to Railway,
then repoints the web at it. Exports (S3) are an optional last step.

Split-origin note: web (`*.workers.dev`) and API (`*.railway.app`) are
different sites, so the refresh cookie must be `SameSite=None; Secure` — set
`COOKIE_SAMESITE=none` on the API (handled by the code, off by default).

---

## 1. Railway project + data stores

In a new Railway project (connect the GitHub repo `nobinkurianfylym/writer`):

1. **+ New → Database → PostgreSQL**. It exposes `DATABASE_URL`.
2. **+ New → Database → Redis**. It exposes `REDIS_URL`.

## 2. API service

**+ New → GitHub Repo → the repo**, then in the service **Settings**:

- **Config-as-code path**: `apps/api/railway.json`
  (this pins the Dockerfile + runs `prisma migrate deploy` before each deploy
  and health-checks `/health`).
- **Variables** (use Railway "reference" vars for the DB/Redis URLs):

  ```
  DATABASE_URL   = ${{Postgres.DATABASE_URL}}
  REDIS_URL      = ${{Redis.REDIS_URL}}
  NODE_ENV       = production
  APP_URL        = https://web.nobinkurian.workers.dev
  CORS_ORIGIN    = https://web.nobinkurian.workers.dev
  COOKIE_SAMESITE = none
  JWT_PRIVATE_KEY = <paste the private PEM below>
  JWT_PUBLIC_KEY  = <paste the public PEM below>
  ```

  Railway injects `PORT` automatically; the API listens on it.

  A fresh throwaway ES256 keypair (rotate later if you like — paste each PEM
  verbatim, multi-line is fine):

  ```
  JWT_PRIVATE_KEY:
  -----BEGIN PRIVATE KEY-----
  MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQggF4qUJMm8thFN3HJ
  C+znAmmn1D41OO9Ck0cPZF6uy02hRANCAARfy1VzvhdwpFi6TXmVQTFdv/ikXgBH
  UfHsuLrrT0rfaEYNaYfoAbhGXozidPlqvKL+mMcDDVaYooZ7TEwlwxSx
  -----END PRIVATE KEY-----

  JWT_PUBLIC_KEY:
  -----BEGIN PUBLIC KEY-----
  MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEX8tVc74XcKRYuk15lUExXb/4pF4A
  R1Hx7Li6609K32hGDWmH6AG4Rl6M4nT5aryi/pjHAw1WmKKGe0xMJcMUsQ==
  -----END PUBLIC KEY-----
  ```

  To generate your own instead:
  ```
  openssl ecparam -genkey -name prime256v1 -noout | openssl pkcs8 -topk8 -nocrypt   # JWT_PRIVATE_KEY
  # then derive the public key from that private key:
  openssl ec -pubout <<< "$THAT_PRIVATE_PEM"                                          # JWT_PUBLIC_KEY
  ```

- Deploy. Once healthy, **Settings → Networking → Generate Domain**. Note the
  URL, e.g. `https://fylym-api-production.up.railway.app`.

Email (magic links + verification) needs SMTP; without it, **password signup
and login still work** — the verification email is best-effort. To enable
magic links, add `SMTP_HOST` / `SMTP_PORT` (e.g. a Resend/Mailgun SMTP).

## 3. Worker service (enables exports + scene index)

**+ New → GitHub Repo → same repo**, **Settings**:

- **Config-as-code path**: `apps/worker/railway.json`
- **Variables**: `DATABASE_URL`, `REDIS_URL` (same reference vars) and the
  S3/R2 block from step 5. The worker needs no public domain.

The core app (auth, projects, editor, autosave) works **without** the worker —
it only powers PDF/FDX/Fountain exports and the scene-index read-model.

## 4. Point the web at the API and redeploy

Set the API origin at **both** build time (client fetch is inlined) and as a
Worker var (the middleware CSP `connect-src` reads it at runtime):

1. In `apps/web/wrangler.jsonc`, add:
   ```jsonc
   "vars": { "NEXT_PUBLIC_API_URL": "https://fylym-api-production.up.railway.app" }
   ```
2. Rebuild + redeploy (from `apps/web`):
   ```
   NEXT_PUBLIC_API_URL=https://fylym-api-production.up.railway.app \
     npx @opennextjs/cloudflare@latest build
   npx wrangler deploy
   ```

## 5. Exports storage — Cloudflare R2 (optional)

R2 is S3-compatible. Create a bucket `fylym-exports` and an R2 API token, then
set on **both api and worker**:

```
S3_ENDPOINT          = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION            = auto
S3_BUCKET            = fylym-exports
S3_ACCESS_KEY_ID     = <R2 access key>
S3_SECRET_ACCESS_KEY = <R2 secret>
S3_FORCE_PATH_STYLE  = true
```

## 6. Smoke test

```
API=https://fylym-api-production.up.railway.app
WEB=https://web.nobinkurian.workers.dev
bash infra/deploy/smoke.sh "$API" "$WEB"
```

Then in the browser: open `$WEB/register`, create an account, make a project,
open a script, type — the sync indicator should reach **Saved**, and a reload
should keep your text. That's the full loop live.

---

### Why not deploy the API to Cloudflare Workers too?

The Workers runtime has no persistent Node process, no long-lived TCP to
Postgres/Redis (Prisma/ioredis), no native addons (argon2), and no place for a
long-running BullMQ consumer. Railway (or any container host) runs the Nest
API and the worker as-is from the existing `infra/docker/Dockerfile.{api,worker}`.

---

## Auto-deploy the web on every push

`.github/workflows/deploy-web.yml` rebuilds + redeploys the web to Cloudflare
whenever you push to `main` (touching `apps/web/**` or `packages/**`), so you
never rebuild by hand. Set these once in the GitHub repo:

- **Settings → Secrets and variables → Actions → Variables**
  - `NEXT_PUBLIC_API_URL` = your Railway API URL (e.g. `https://fylym-api-production.up.railway.app`)
- **Settings → Secrets and variables → Actions → Secrets**
  - `CLOUDFLARE_API_TOKEN` — a token with the *Workers Scripts: Edit* permission
  - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account id

After the API is live on Railway, set `NEXT_PUBLIC_API_URL` and push (or run
the workflow manually via **Actions → Deploy Web → Run workflow**) — the app
goes live pointing at the real backend, with the CSP allowing it.

## Auto-deploy the API + worker

Two options:

1. **Railway-native (simplest):** with the GitHub repo connected to each
   service, Railway auto-builds + deploys on every push to `main` — no
   workflow needed. It runs the api's `prisma migrate deploy` pre-deploy and
   the `/health` check from `railway.json`.
2. **CI-gated (`.github/workflows/deploy-api.yml`):** deploys api + worker via
   the Railway CLI, then runs `infra/deploy/smoke.sh` against the live API +
   web so a bad deploy is caught. Requires secret `RAILWAY_TOKEN` and
   variables `RAILWAY_API_SERVICE`, `RAILWAY_WORKER_SERVICE`,
   `NEXT_PUBLIC_API_URL`. Turn off the native auto-deploy on those services if
   you use this, so they don't both fire.
