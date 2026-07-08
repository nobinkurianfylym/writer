# FYLYM Writer

Monorepo for FYLYM Writer. See [docs/FYLYM-Writer-Architecture-Blueprint.md](docs/FYLYM-Writer-Architecture-Blueprint.md)
and [docs/FYLYM-Phase1-Build-Plan.md](docs/FYLYM-Phase1-Build-Plan.md) for the architecture and ticket breakdown.

## Quickstart

```bash
pnpm install
pnpm docker:up                                    # Postgres, Redis, MinIO, mailpit
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
pnpm dev                                          # web:3000, api:3001, worker
```

## Common commands

```bash
pnpm build        # turbo run build across all packages
pnpm test         # turbo run test across all packages
pnpm lint         # turbo run lint across all packages
pnpm typecheck    # turbo run typecheck across all packages
pnpm docker:down  # stop local infra
```

## Layout

- `apps/web` — Next.js app (editor, dashboard)
- `apps/api` — NestJS API
- `apps/worker` — BullMQ worker (exports, derived read models)
- `apps/ai` — stub, Phase 5
- `packages/screenplay-core` — dependency-free formatting engine (block model, pagination, Fountain/FDX)
- `packages/editor` — ProseMirror `<ScriptEditor>`
- `packages/contracts` — Zod schemas, error envelope, OpenAPI codegen
- `packages/db` — Prisma schema + client
- `packages/ui` — shared design system (shadcn/ui-style primitives)
- `packages/config` — shared tsconfig/eslint/prettier presets, env validation helper
