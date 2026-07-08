# FYLYM Writer — Phase 1 Build Plan & Ticket Breakdown

**Companion to:** Architecture Blueprint v1.0 · **Scope:** Phase 1, "The Core" (≈ weeks 1–8)
**Exit test:** A screenwriter drafts a real feature film start-to-finish in FYLYM and hands the exported PDF to a producer without apologizing for it.

This document decomposes Phase 1 into 52 tickets across 8 epics. Every ticket is written to be independently executable — each states what to build, where it lives in the monorepo, its acceptance criteria, and its dependencies. Section references (e.g. "§4") point into the Architecture Blueprint, which remains the authority on *how*; this document is the authority on *what and in what order*.

Sizing uses T-shirt estimates: **S** ≈ half a day, **M** ≈ 1–2 days, **L** ≈ 3–5 days, **XL** ≈ a week+ (XL tickets include their own internal checklist and should be the only thing in flight while active).

---

## 0. Sequencing at a Glance

The dependency spine of Phase 1 is:

```
E0 Foundation ──► E1 screenplay-core ──► E2 Editor ──► E3 Persistence ──► E7 Exit Test
                        │                                    ▲
                        └──► E5 Export pipeline ─────────────┤
E4 Backend & Auth ───────────────────────────────────────────┘
E6 Deploy/CI runs continuously from week 1
```

E1 (the pure-TypeScript core) is deliberately first and deliberately finished before the editor gets deep: pagination and format conversion are the highest-risk items in the whole product (§13), and they are 10× cheaper to get right as pure functions with golden tests than to retrofit under a live editor. E4 (backend) has no dependency on E1/E2 and runs in parallel from week 1.

**Week-by-week milestones**

| Week | Milestone (demoable) |
|---|---|
| 1 | Monorepo boots; `docker compose up` gives Postgres/Redis/MinIO; CI green on a hello-world test in every package |
| 2 | Block model + Tab/Enter state machine complete with property tests; Fountain round-trip passing |
| 3 | Pagination engine passing the first 20 golden scripts; FDX import/export round-trip passing |
| 4 | Editor: typing a correctly formatted scene in the browser with live page ruler |
| 5 | Auth end-to-end (email, Google, magic link); projects/scripts dashboard CRUD |
| 6 | Local persistence + autosave; document survives refresh, tab kill, offline |
| 7 | PDF/FDX/Fountain export via job pipeline; staging environment live |
| 8 | Hardening, a11y pass, exit test executed with a real writer; Phase 1 sign-off |

---

## Epic E0 — Repository & Tooling Foundation

Goal: a monorepo where every subsequent ticket has a home, tests run in one command, and local dev is one command. Everything here is boring on purpose; boring is what makes weeks 2–8 fast.

**E0-1 · Monorepo scaffold** — *M* — *Depends: none*
Initialize pnpm + Turborepo with the exact layout from §2: `apps/web`, `apps/api`, `apps/worker`, `apps/ai` (empty stub in Phase 1), `packages/screenplay-core`, `packages/editor`, `packages/contracts`, `packages/db`, `packages/ui`, `packages/config`. Shared `tsconfig` base (strict, `noUncheckedIndexedAccess`), ESLint + Prettier presets in `packages/config`, consistent `build/test/lint/typecheck` scripts wired through Turborepo pipelines with caching.
*Accept:* `pnpm build && pnpm test && pnpm lint` succeeds from a clean clone; adding a file in one package and importing it from another type-checks with go-to-definition working.

**E0-2 · Local dev environment** — *M* — *Depends: E0-1*
`infra/docker/compose.yml`: Postgres 16, Redis 7, MinIO (S3-compatible), mailpit (SMTP catcher for magic links). `.env.example` per app with every key documented; boot-time env validation (Zod) that fails fast with the missing key named (§Appendix A).
*Accept:* `docker compose up` then `pnpm dev` starts web + api + worker with hot reload; a missing env var produces a one-line named error, not a stack trace.

**E0-3 · CI pipeline v1** — *M* — *Depends: E0-1*
GitHub Actions on PR: typecheck, lint, unit tests, integration tests with Postgres/Redis service containers, Turborepo remote caching. Branch protection: required checks + review on `main`.
*Accept:* A PR breaking any package's tests cannot merge; CI wall-time under 8 minutes with warm cache.

**E0-4 · packages/ui design-system seed** — *M* — *Depends: E0-1*
shadcn/ui initialized with the FYLYM theme: type scale, spacing, dark/light tokens as CSS variables, Courier Prime bundled for script rendering. Ship only the primitives Phase 1 needs (button, input, dialog, dropdown, toast, tooltip, command palette shell).
*Accept:* Storybook (or a `/design` route) renders all primitives in both themes; script font renders with correct metrics (12pt Courier ⇒ 10 chars/inch verified visually against a ruler overlay).

**E0-5 · packages/contracts seed** — *S* — *Depends: E0-1*
Zod schema conventions, error envelope type (`{ error: { code, message, details? } }`), cursor pagination types, and the codegen script that emits OpenAPI from registered schemas (§6).
*Accept:* One example schema flows to OpenAPI JSON in CI artifacts; frontend can import the inferred TS type.

---

## Epic E1 — screenplay-core (the crown jewel)

Goal: the complete, dependency-free formatting brain (§4). No React, no Node APIs, no DOM. Every ticket lands with tests; this package's coverage gate is 95% and stays there forever.

**E1-1 · Block model & invariants** — *M* — *Depends: E0-1*
Implement `Block`, `BlockType` (all 15 types from §4), `MarkRange`, document container, and structural invariants (marks sorted/non-overlapping per kind, dual-dialogue pairing rules, ID immutability). Include `normalize(doc)` that repairs any violation deterministically, plus fast-check generators for arbitrary valid documents — these generators power every property test in the package.
*Accept:* Property test: `normalize(normalize(d)) ≡ normalize(d)` for 10k generated docs; illegal structures (unpaired dual dialogue, overlapping marks) are repaired, never thrown on.

**E1-2 · Format profiles** — *M* — *Depends: E1-1*
`FormatProfile` type and the two Phase 1 profiles: `us-feature` (the industry standard: 1.5" left margin, element indents, caps rules, spacing) and `us-tv-onehour`. Profiles are data, not code — a JSON-serializable object validated by Zod, so later profiles (§ Phase 5) are content additions.
*Accept:* Snapshot tests pin every element's indent/width/caps/spacing values against published industry-standard measurements; loading an invalid profile fails validation with the offending path.

**E1-3 · Tab/Enter element state machine** — *M* — *Depends: E1-1*
The complete transition table (§4): for every `(currentBlockType, key, isEmpty)` triple, the resulting block type and caret behavior — including the cycle order for repeated Tab, Enter-on-empty demotions, and auto-caps entry into `scene_heading`/`character`/`transition`. Pure function; no editor imports.
*Accept:* The transition table is total — an exhaustiveness test iterates every (type × key × emptiness) combination and asserts a defined result; behavior matches a written spec table committed alongside (the doc reviewers check against Final Draft behavior).

**E1-4 · Smart-type helpers** — *S* — *Depends: E1-3*
Scene-heading autocomplete tokenizer (INT./EXT./I-E. detection, location extraction, time-of-day extraction — this later feeds `SceneIndex`), character-name extension detection (`(V.O.)`, `(O.S.)`, `(CONT'D)`), transition detection (`CUT TO:` right-align trigger).
*Accept:* Tokenizer unit tests over a 200-line fixture of real-world headings including edge cases (`INT./EXT.`, hyphenated times, "LATER", nested locations with em-dashes).

**E1-5 · Pagination engine** — *XL* — *Depends: E1-1, E1-2*
`paginate(blocks, profile, opts) → PageMap` implementing the §4 rules: line-metric layout in Courier units; no orphaned scene headings; dialogue splits with `(MORE)`/`(CONT'D)`; parenthetical never separated from first dialogue line; action widow control; explicit `page_break` blocks; deterministic output (same input ⇒ byte-identical PageMap). Include the **incremental API**: `repaginate(prevPageMap, changedRange) → PageMap` re-flowing only from the first affected block.
Internal checklist: line breaker → element layout → keep-together constraint solver → MORE/CONT'D synthesis → incremental invalidation → determinism audit.
*Accept:* Full-vs-incremental equivalence property (10k random edits on generated docs ⇒ identical PageMap); golden corpus (E1-9) page breaks match hand-verified references; 300-page doc full paginate < 150 ms, incremental median < 10 ms (benchmarked in CI).

**E1-6 · Fountain parser & serializer** — *L* — *Depends: E1-1*
Full spec compliance (§8): all elements, forced elements (`!`, `@`, `~`, `>`), dual dialogue `^`, sections/synopses, notes `[[ ]]`, boneyard `/* */`, title page keys, emphasis marks.
*Accept:* Round-trip property `parse(serialize(doc)) ≡ normalize(doc)` on generated docs; the official Fountain sample files plus 10 real Fountain scripts parse to expected block sequences (fixtures committed).

**E1-7 · FDX parser & serializer** — *XL* — *Depends: E1-1*
Final Draft XML in and out (§8): all paragraph types, dual dialogue, title page, scene numbers, revision attributes, inline styles. Parser is defensive — unknown elements are preserved in a passthrough bag so re-export doesn't destroy data FYLYM doesn't model. Serializer targets FD 12/13 compatibility.
*Accept:* Round-trip semantic-equality on the golden corpus's FDX files; a deliberately malformed-FDX fixture set (real-world violations: stray namespaces, missing attributes) imports without throwing and with data preserved; exported files open in Final Draft 13 with zero element-type errors (manual verification checklist committed as a test doc).

**E1-8 · PDF typesetter** — *L* — *Depends: E1-5*
Render `PageMap` → PDF (§8): embedded Courier metrics, title page composition, headers with page numbers, scene numbers in margins (flag), watermark layer (diagonal text, per-render string), all driven by the paginator — the typesetter never makes layout decisions. Must run in Node (worker) and browser (later preview) — use a platform-neutral PDF lib and abstract file output.
*Accept:* Pixel-diff tests: rendered pages of 5 golden scripts compared against reference rasters at 2% tolerance; PDF page count always equals PageMap page count (property test); a watermarked render embeds the string on every page.

**E1-9 · Golden corpus & conformance harness** — *L* — *Depends: E1-5, E1-6, E1-7*
Assemble ≥ 25 scripts (public-domain screenplays reformatted + purpose-written stress fixtures: dual-dialogue-heavy, musical lyrics, 5-page single scene, 200-scene feature, every element adjacency pair). For each: canonical block JSON, expected Fountain, expected FDX, expected page-break list. One harness runs every core function against every corpus entry; this suite is a required CI check forever.
*Accept:* `pnpm test:golden` green; a README documents how to add a corpus entry; CI publishes a conformance report artifact per run.

**E1-10 · Core API docs** — *S* — *Depends: E1-1…E1-8*
TSDoc on every public symbol + typedoc build; a `docs/screenplay-core.md` narrative covering the block model, how to add a format profile, and pagination guarantees.
*Accept:* Typedoc builds warning-free in CI; the narrative doc reviewed against §4 for drift.

---

## Epic E2 — The Editor

Goal: a ProseMirror editor (§4, Decision 2) where a professional can type at full speed and never touch a formatting control. `packages/editor` exports a framework-thin `<ScriptEditor>` consumed by `apps/web`.

**E2-1 · ProseMirror schema from block model** — *M* — *Depends: E1-1, E1-2*
One top-level node type per `BlockType`; attrs mirror `Block.attrs`; marks for bold/italic/underline/strike plus a `revision` mark (dormant until Phase 4). Bidirectional lossless converters `pmDoc ⇄ Block[]` — the seam every other system (persistence, export, analytics) plugs into.
*Accept:* Property test: `toBlocks(toPmDoc(blocks)) ≡ blocks` over generated docs; schema rejects nesting violations (e.g. dialogue inside dialogue) at the transaction level.

**E2-2 · Element behavior plugin** — *L* — *Depends: E2-1, E1-3, E1-4*
Bind the E1-3 state machine to real keys: Tab cycles, Enter transitions, Backspace-at-start merges, auto-caps on entry to caps elements, smart-type triggers (typing `int.` at action start converts to scene heading). Element indicator in the gutter; explicit element switch via keyboard (⌘1–⌘9) and the element dropdown.
*Accept:* Playwright component tests script the exact keystroke sequences from the E1-3 spec table and assert resulting document structure; typing a full 2-page scene requires zero mouse interactions (scripted E2E proves it).

**E2-3 · Autocomplete surfaces** — *M* — *Depends: E2-2*
Scene-heading completion (known INT/EXT + locations previously used in this document), character-name completion (names used so far, most-recent-speaker first — the two-character alternating-dialogue case must be one keystroke), extension completion (V.O./O.S./CONT'D).
*Accept:* Alternating dialogue between two characters requires only Enter+Enter+Tab-free flow with first-letter acceptance; suggestions ranked by recency; fully keyboard-driven, Escape always dismisses.

**E2-4 · Live pagination & page ruler** — *L* — *Depends: E2-1, E1-5*
Run the incremental paginator in a Web Worker fed by transaction deltas; render page boundaries, page numbers, and `(MORE)/(CONT'D)` ghosts as decorations. Typing latency must never depend on pagination (§10) — the worker is an async observer.
*Accept:* Keystroke-to-paint p95 < 16 ms on a 120-page document while paginating (measured in an automated perf test); page indicators update within 200 ms of pause; killing the worker degrades gracefully (editor keeps working, ruler pauses).

**E2-5 · Block virtualization** — *L* — *Depends: E2-4*
Viewport-window rendering for large documents (§10): off-screen blocks rendered as measured placeholders; find/scroll/jump work across the whole doc.
*Accept:* A generated 5,000-page document opens in < 2 s and scrolls at 60 fps (automated perf budget in CI); DOM node count stays bounded (< 1,500) regardless of document length; ⌘F find hits off-screen matches.

**E2-6 · Title page editor** — *S* — *Depends: E2-1*
Structured form (title, credit, author, contact, draft date) stored in document meta; live preview using the E1-8 title-page layout.
*Accept:* Fields round-trip through FDX and Fountain title-page keys; preview matches PDF output.

**E2-7 · Writing modes & appearance** — *M* — *Depends: E2-2*
Dark/light (system-aware), Focus mode (dims all but active scene), Typewriter mode (active line vertically centered), Zen/fullscreen (chrome hidden, ambient page). Mode state per user, instant switching.
*Accept:* Playwright visual snapshots per mode; mode switches cause no document reflow or focus loss; preferences persist across sessions.

**E2-8 · In-document find & navigate** — *M* — *Depends: E2-5*
⌘F find with element-type filter (search only dialogue, only headings), match highlighting through virtualization, scene-jump palette (⌘K lists scene headings).
*Accept:* Find on a 300-page doc returns < 50 ms; scene palette navigates with keyboard only; matches inside virtualized regions scroll-and-highlight correctly.

**E2-9 · Editor accessibility pass** — *M* — *Depends: E2-2, E2-7*
WCAG AA for a custom editor (§12): ARIA roles for the document and gutter, screen-reader announcements on element-type change ("Now editing: Dialogue, Maya"), full keyboard operability audit, contrast tokens verified in both themes, reduced-motion compliance.
*Accept:* axe-core clean on the editor route; a committed manual SR test script (VoiceOver + NVDA) executed and checked off; every interactive control reachable and operable by keyboard alone.

---

## Epic E3 — Local Persistence & Autosave

Goal: the document is never lost, ever, before the network is even involved (§5, §9 durability layer 1). Phase 1 uses the full Yjs stack locally so Phase 2's realtime is an additive step, not a rewrite.

**E3-1 · Yjs document binding** — *M* — *Depends: E2-1*
`Y.Doc` per script; `y-prosemirror` binding on the content fragment; `Y.Map("meta")` for title page/format profile; local-origin `Y.UndoStack` wired to ⌘Z/⇧⌘Z (§5).
*Accept:* Undo/redo across 1,000 scripted random edits converges (property test); undo stack survives element-type conversions correctly; meta edits (title page) are undoable independently of content.

**E3-2 · IndexedDB persistence** — *M* — *Depends: E3-1*
`y-indexeddb` provider per script with a namespaced DB; load path hydrates from IndexedDB before any network call; storage pressure handling (quota errors surface a persistent warning, never silent loss).
*Accept:* Kill the tab mid-word ⇒ reopen shows the word (Playwright test with forced tab crash); airplane-mode editing session fully retained; corrupted DB entry falls back to server snapshot with a user-visible notice, not a blank editor.

**E3-3 · Server snapshot sync (Phase 1 protocol)** — *L* — *Depends: E3-2, E4-6*
Without the realtime service (Phase 2), persistence to server is debounced snapshot upload: every 15 s of activity or on blur, POST the compacted Yjs update to `PUT /v1/scripts/:id/state` with the client's state vector; server stores `ydocState/ydocVector` (§3) and returns authoritative vector. Conflict rule for Phase 1's single-writer world: Yjs merge on load (open on laptop after editing on desktop ⇒ merged, not clobbered). Sync status indicator (saved / saving / offline / error) in the chrome.
*Accept:* Two-device sequential editing merges without loss (integration test with two headless clients); server rejects stale-auth uploads; the indicator reflects each state transition within 500 ms; a 3 MB state uploads compressed (zstd) in one request.

**E3-4 · Local safety snapshots** — *S* — *Depends: E3-2*
Rolling local snapshots (every 10 min of active editing, max 30 retained) in IndexedDB with a minimal "Restore from this device" list — the last-resort layer beneath server history.
*Accept:* Snapshot list shows human timestamps + first scene heading; restore replaces the doc after an explicit confirm and is itself undoable via a pre-restore snapshot.

---

## Epic E4 — Backend, Auth & Project CRUD

Goal: the NestJS API (§1) with the §3 schema subset Phase 1 needs, and authentication that would pass a security review today (§9). Runs parallel to E1/E2 from week 1.

**E4-1 · NestJS scaffold + Prisma baseline** — *M* — *Depends: E0-2*
NestJS app with config validation, request logging (pino, PII-scrubbed), health endpoints, global error filter emitting the §6 envelope, Prisma schema for Phase 1 models: `User, OAuthAccount, Session, Organization, Membership, Project, ProjectCollaborator, Script, Snapshot, AuditLog` (+`SceneIndex` table created, populated in E5-3). Initial migration + seed (demo org, demo script from the golden corpus).
*Accept:* `pnpm --filter api test:int` runs against containerized Postgres; migration up/down clean; seed produces a loadable demo script.

**E4-2 · Email/password + session auth** — *L* — *Depends: E4-1*
Register (argon2id, email verification via mailpit-visible mail), login, logout; ES256 access JWTs (10 min) + rotating refresh tokens with family-reuse revocation (§9); secure cookie handling for web, bearer support for future native shells.
*Accept:* Integration tests: refresh rotation works; a replayed old refresh token revokes the entire family (test proves subsequent legit refresh fails); password hashing parameters meet OWASP current guidance; auth endpoints rate-limited (Redis token bucket) with `RateLimit-*` headers.

**E4-3 · Google OAuth + magic links** — *M* — *Depends: E4-2*
Google sign-in (PKCE), account linking by verified email; magic links (single-use, 10-min expiry, hashed at rest §9) with a plain, fast email template.
*Accept:* OAuth E2E against Google's OIDC test flow (mocked in CI, manual checklist for real); a magic link consumed twice fails the second time; links expire on schedule (clock-controlled test).

**E4-4 · Org bootstrap & RBAC guard** — *M* — *Depends: E4-2*
Personal org auto-created at signup (Free plan); the single policy-table authorization guard (§9) covering Phase 1 routes; `AuditLog` writes with the hash chain (§3) for auth and destructive events.
*Accept:* RBAC matrix test iterates role × endpoint and asserts allow/deny per the policy table; audit chain verifies (`hash_n = H(hash_{n-1} ‖ row)`) over seeded history; tampering a row makes verification fail (test).

**E4-5 · Projects & scripts CRUD** — *M* — *Depends: E4-4, E0-5*
The §6 project/script endpoints Phase 1 needs: create/list/get/patch/soft-delete projects; create/list/get/rename scripts; trash + restore (`deletedAt`); cursor pagination; contracts in `packages/contracts` with generated OpenAPI.
*Accept:* Every endpoint has a Zod contract, integration test, and appears in the OpenAPI artifact; soft-deleted projects invisible to list, restorable for 30 days (retention job in E5-1's worker).

**E4-6 · Script state & snapshot endpoints** — *M* — *Depends: E4-5*
`PUT /v1/scripts/:id/state` (E3-3's counterpart: store `ydocState/ydocVector`, size limits, zstd), `GET /v1/scripts/:id/state`, `POST /v1/scripts/:id/snapshots` (MANUAL label) and list — Phase 1's version history.
*Accept:* State upload enforces per-plan size ceiling with a clean 413 envelope; manual snapshot then continued editing then restore-from-snapshot round-trips correctly (integration test); snapshots list paginates.

---

## Epic E5 — Export Pipeline & Worker

Goal: the async job pattern (§6) established once, correctly, with the three exports that define professional credibility: PDF, FDX, Fountain.

**E5-1 · Worker service + job pattern** — *M* — *Depends: E4-1*
BullMQ worker app; `Job` lifecycle endpoints (`GET /v1/jobs/:id`); progress reporting; dead-letter queue with alerting hook; S3 (MinIO locally) result storage with short-lived signed URLs (§9).
*Accept:* A test job reports progress 0→100 observable via polling; a crashing job lands in DLQ and the job status reads `failed` with a safe message; result URLs expire (test with clock control).

**E5-2 · Export jobs: PDF / FDX / Fountain** — *L* — *Depends: E5-1, E1-7, E1-8*
`POST /v1/scripts/:id/exports` per §6: hydrate blocks from `ydocState`, run the shared `screenplay-core` pipeline, store artifact, return signed URL. Options: scene numbers on/off, watermark string, title page on/off.
*Accept:* Export of every golden-corpus script matches golden bytes (FDX/Fountain) and pixel-diff (PDF) — the same harness as E1-9, now through the full service path; a 300-page export completes < 10 s; watermark option embeds per-request text.

**E5-3 · SceneIndex derive job** — *M* — *Depends: E5-1, E1-4, E4-6*
The §3 read-model: on state upload, worker parses blocks → upserts `SceneIndex` rows (heading parse via E1-4 tokenizer, positions, word counts). Phase 1 consumer: the web app's scene list; Phase 3 analytics builds on it unchanged.
*Accept:* Editing a heading updates its index row within one derive cycle (integration test); scene reorder in the document reorders `position` correctly; a 200-scene script derives < 1 s.

---

## Epic E6 — Web App Shell & Deploy

**E6-1 · Next.js app shell + auth UI** — *L* — *Depends: E0-4, E4-3*
App Router shell: marketing-free authenticated app (login/register/magic-link/verify flows against E4), session handling, error boundaries, toasts, command-palette shell (⌘K) with navigation commands.
*Accept:* Full auth journey E2E (register → verify → login → logout → magic link) in Playwright; unauthenticated deep links redirect and return post-login; Lighthouse a11y ≥ 95 on auth pages.

**E6-2 · Dashboard: projects & scripts** — *M* — *Depends: E6-1, E4-5*
Project list/create/rename/trash; script list within project; open-in-editor; trash view with restore; empty states that teach ("Start from a blank feature or import — Phase 2 — coming").
*Accept:* React Query hooks typed from `contracts`; optimistic rename with rollback on failure (test); keyboard-navigable lists.

**E6-3 · Editor page integration** — *L* — *Depends: E6-2, E2-*, E3-**
The flagship route: `<ScriptEditor>` wired to load (IndexedDB-first, server-fallback), sync indicator, mode switcher, title-page sheet, snapshot menu, export dialog driving E5-2 with job progress and download.
*Accept:* The full loop — create script, write 3 scenes, refresh (persists), snapshot, export PDF, download — passes as one E2E; editor route holds the E2-4 latency budget under CI perf test.

**E6-4 · Staging deploy + CD** — *L* — *Depends: E0-3, all services existing*
Terraform for the §11 minimal footprint (ECS Fargate: api/worker/web, RDS, ElastiCache, S3, ALB behind Cloudflare); GitHub Actions CD: build → migrate (expand-and-contract check) → deploy staging → smoke suite; manual promote to prod (prod env may stay dormant in Phase 1 but the pipeline must exist).
*Accept:* Merge to `main` reaches staging automatically with green smoke tests; a failed smoke auto-rolls back; runbook in `docs/` covers deploy, rollback, migration hotfix.

**E6-5 · Observability baseline** — *M* — *Depends: E6-4*
OpenTelemetry traces API→worker (one trace ID across the export flow §11), Sentry web+api with release tags, structured logs to CloudWatch, uptime checks + a paging alert on API 5xx burn rate.
*Accept:* An export request produces a single connected trace across services; a thrown test error appears in Sentry attributed to the release; alert fires in a staged 5xx drill.

---

## Epic E7 — Hardening & Exit Test

**E7-1 · Security review sprint** — *M* — *Depends: E4-*, E6-1*
Execute the §9 Phase 1 checklist: CSP with nonces, CSRF double-submit, cookie flags, dependency + Semgrep gates enforced, secrets audit (nothing in images/repo — scripted check), rate-limit budgets on auth/export, upload/download content-type hardening.
*Accept:* Checklist committed with evidence links per item; ZAP baseline scan against staging shows no medium+ findings unaddressed.

**E7-2 · Performance validation** — *M* — *Depends: E6-3*
Codify §10 budgets in CI: k6 on hot API reads (p95 < 120 ms), editor perf tests (E2-4/E2-5 numbers), cold script open < 800 ms on staging hardware.
*Accept:* Budgets run as required CI checks with trend reporting; one week of staging soak shows no memory growth in worker or api.

**E7-3 · The exit test** — *M* — *Depends: everything*
Recruit two working screenwriters (one Final Draft native, one Fountain native). Each drafts ≥ 15 pages of real material over 3 sessions including one deliberately offline session, then exports PDF and FDX and opens the FDX in Final Draft. Structured observation notes; every friction point filed as a ticket; blockers fixed before sign-off.
*Accept:* Both writers complete without data loss or formatting apology; FDX opens clean in Final Draft; a written Phase 1 retro ranks the top 10 friction items feeding Phase 2 planning.

---

## Running This With Claude Code

This plan is shaped for agentic execution. Practical guidance: work **one ticket per session** with the Architecture Blueprint and this document in the repo (`docs/`) so every session can reference "§4" and "E1-5" precisely. Land E1's golden corpus early and make it a required check immediately — it is the guardrail that lets later sessions move fast on the editor without silently breaking pagination or FDX fidelity. Treat every *Accept* clause as the session's definition of done and have Claude Code write the acceptance test *first* where one is named. XL tickets (E1-5, E1-7) should be split into their internal checklist items across multiple sessions rather than attempted in one pass. Keep humans in the loop at three gates: the E1-2 measurement snapshots (verify against a real formatted script), the E1-7 manual Final Draft open test, and the E7-3 exit test — those are the places where "looks right to a model" and "right" can diverge.

**Phase 1 definition of done:** all 52 tickets accepted, golden corpus + perf budgets green in CI, staging live, exit test passed with both writers. Then Phase 2 (collaboration) begins on foundations that were built for it — the Yjs stack, the job pattern, and the auth model all already speak Phase 2's language.
