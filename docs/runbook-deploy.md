# Deploy Runbook (E6-4)

Operational guide for FYLYM's staging/prod infrastructure. Covers the normal
deploy flow, rollback, and migration hotfixes.

## Topology (§11)

Every environment is a Terraform **workspace** of the same modules
(`infra/terraform`):

- **ECS Fargate** cluster running three services — `api` (:3001), `worker`
  (queue consumer, no LB target), `web` (:3000, Next.js standalone).
- **RDS Postgres 16** (Multi-AZ in prod), **ElastiCache Redis 7**, **S3**
  exports bucket — all KMS-encrypted at rest.
- **ALB** behind **Cloudflare**; the ALB security group only admits
  Cloudflare edge ranges (origin lock). `api.<domain>` → api target group,
  everything else → web.
- Images live in **ECR** (`fylym/{api,worker,web}`), tagged with the git SHA.

Container images are built by `infra/docker/Dockerfile.{api,worker,web}`
(multi-stage, `turbo prune` per service).

## Prerequisites (one-time)

1. Bootstrap the Terraform state backend: an S3 bucket
   `fylym-terraform-state` and DynamoDB lock table `fylym-terraform-locks`.
2. Create the GitHub OIDC deploy role; set repo secret `AWS_DEPLOY_ROLE_ARN`.
3. Per env, populate Secrets Manager (JWT keypair, SMTP, Google OAuth) and set
   the `app_secret_arns` map in `*.tfvars`; set `STAGING_DB_PASSWORD` /
   `PROD_DB_PASSWORD` and `STAGING_DATABASE_URL` / `PROD_DATABASE_URL` repo
   secrets.
4. `cp staging.tfvars.example staging.tfvars` (and prod) and fill in domain +
   ACM cert ARN.

## Normal deploy (automatic)

Merging to `main` runs `.github/workflows/deploy.yml`:

1. **build** — build & push `api/worker/web` images to ECR, tag `= git SHA`.
2. **migrate** — `prisma migrate status` then `migrate deploy` against
   staging (see *Migrations* below).
3. **deploy-staging** — `terraform apply` the `staging` workspace with
   `image_tag = SHA`; wait for all services to reach steady state.
4. **smoke** — `infra/deploy/smoke.sh` hits api `/health`, the auth guard,
   the web login page, and the CORS header. Failure ⇒ automatic rollback.

No manual step reaches staging; a green pipeline == deployed.

## Promote to prod

Run the **Deploy** workflow via *workflow_dispatch* with
`promote_prod = true`. The `production` GitHub Environment requires a
reviewer approval before the job runs. It migrates the prod DB, applies the
`prod` workspace at the same SHA, and smokes prod. (Prod may stay dormant in
Phase 1 — the pipeline exists and is exercised regardless.)

## Rollback

Two layers, both automatic; a third manual:

1. **ECS deployment circuit breaker** (`rollback = true` on every service):
   if a new task set never passes its ALB health check, ECS reverts to the
   last healthy task definition on its own.
2. **Smoke-failure rollback**: if services come up but fail a behavioral
   smoke check, the `smoke` job forces each service back to its last
   `COMPLETED` task definition and fails the pipeline.
3. **Manual rollback** to a known-good SHA:
   ```
   cd infra/terraform
   terraform workspace select staging   # or prod
   terraform apply -var-file=staging.tfvars -var="image_tag=<good-sha>"
   ```
   Images are immutable and retained in ECR, so any prior SHA can be
   re-applied. If a bad **migration** is implicated, see below — code
   rollback alone won't undo a schema change.

## Migrations (expand-and-contract)

Migrations must be **zero-downtime**: the old and new code versions both run
against the DB during a rolling deploy, so a single migration may only *add*
(expand) — never drop or rename a column the currently-running code still
reads. Removal (contract) ships in a **later** deploy, after no running code
references the old shape.

- The pipeline runs `prisma migrate deploy` (forward-only) **before** the new
  tasks roll out, and `prisma migrate status` gates on a clean history.
- A destructive change is therefore split across two releases:
  1. Release N: add the new column/table; write to both; read old.
  2. Release N+1: switch reads to new; stop writing old.
  3. Release N+2: drop the old column.

### Migration hotfix (a migration failed mid-deploy)

1. The `migrate` job fails ⇒ new images are **not** rolled out; the running
   version is untouched. The site stays up on the old schema.
2. Inspect: `pnpm --filter @fylym/db exec prisma migrate status`.
3. If a migration is `failed`, resolve it explicitly (never edit applied
   migration files):
   ```
   # mark rolled-back if it did not apply, or applied if it did:
   pnpm --filter @fylym/db exec prisma migrate resolve --rolled-back <migration>
   ```
4. Fix the migration in a new PR (expand-only), merge, let the pipeline
   re-run. For data corruption, restore from RDS PITR (35-day window, RPO ≤
   5 min) per the durability plan.

## Health & references

- API health: `GET /health` → `{"status":"ok"}` (ALB health check path).
- Web health: `GET /login` (200).
- Smoke suite: `infra/deploy/smoke.sh <api-url> <web-url>`.
- Terraform: `infra/terraform` (`versions.tf`, `variables.tf`, `main.tf`,
  `modules/`). `terraform plan` before any manual apply.
