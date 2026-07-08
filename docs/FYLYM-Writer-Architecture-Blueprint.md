# FYLYM Writer — Technical Architecture Blueprint

**Version 1.0 · July 2026 · Status: Design baseline for implementation**

This document is the executable design for FYLYM Writer, a professional screenwriting SaaS intended to compete with Final Draft, Fade In, Arc Studio and WriterDuet. It is written so that an engineering team — or a single developer driving Claude Code — can build the system in the order specified without re-litigating foundational decisions. Where the product spec lists a feature, this document explains the data model, service boundary, and protocol that make it real. Where the spec is ambitious beyond a v1, the roadmap in Section 14 sequences it honestly.

Three decisions shape everything else in this document, so they are stated up front.

**Decision 1 — The screenplay is a typed block sequence, not rich text.** Every competitor that treats a script as styled paragraphs eventually fights its own editor. FYLYM's canonical document is an ordered list of typed blocks (`scene_heading`, `action`, `character`, `dialogue`, `parenthetical`, `transition`, `shot`, `lyric`, `centered`, `dual_dialogue`, `note`, `page_break`, `section`, `synopsis`). Formatting is a pure function of block type plus the active format profile (US Feature, UK Stage, BBC Radio, Multi-cam Sitcom, etc.). This one decision makes auto-formatting trivial, makes FDX/Fountain conversion lossless, makes pagination deterministic, and gives the AI layer structured input instead of prose soup.

**Decision 2 — ProseMirror over Lexical, because of Yjs.** The spec allows "ProseMirror if superior." For this product it is: `y-prosemirror` is the most battle-tested CRDT binding in existence (it powers WriterDuet-class collaboration in many products), ProseMirror's schema system maps one-to-one onto our typed block model, and its decoration system handles revision marks and locked pages cleanly. Lexical's Yjs binding is younger and its flat node model fights dual dialogue. The editor is therefore ProseMirror with a strict schema where every top-level node is one of our block types.

**Decision 3 — Yjs CRDT is the source of truth for script content; Postgres is the source of truth for everything else.** Script text lives as a Yjs document persisted as binary updates plus periodic snapshots. Relational data — projects, characters, beats, breakdown tags, comments anchored by stable block IDs — lives in Postgres. The two are joined by immutable `blockId`s (UUIDs stored as Yjs node attributes), which is what lets a comment, a breakdown tag, or an analytics datapoint survive any amount of collaborative editing.

---

## 1. System Architecture

The platform is five deployable services plus managed infrastructure. Service boundaries follow data-shape boundaries, not team-org-chart boundaries.

```
                        ┌─────────────────────────────────────────┐
                        │            Cloudflare (WAF, CDN,        │
                        │         bot detection, rate limit L1)   │
                        └────────────┬───────────────┬────────────┘
                                     │               │
                     HTTPS / REST    │               │  WSS
                                     ▼               ▼
   ┌──────────────┐        ┌────────────────┐  ┌────────────────┐
   │  Web Client   │        │   API Service  │  │  Realtime Svc  │
   │  Next.js PWA  │◄──────►│  NestJS (REST) │  │  Node + Yjs    │
   │  Tauri/Capac. │        │                │  │  (y-websocket  │
   └──────────────┘        └───┬────────┬───┘  │   + Hocuspocus)│
                                │        │      └───────┬────────┘
                                │        │              │
                    ┌───────────▼──┐  ┌──▼──────────┐   │
                    │  PostgreSQL  │  │    Redis     │◄──┘
                    │  (Prisma)    │  │ cache, queue,│
                    │              │  │ pub/sub, rate│
                    └───────┬──────┘  └──┬───────────┘
                            │            │ BullMQ jobs
                            │            ▼
                            │   ┌────────────────────┐     ┌─────────────┐
                            │   │   Worker Service    │     │  AI Service │
                            │   │ Node: export, PDF,  │────►│  FastAPI    │
                            │   │ import, pagination, │     │  provider   │
                            │   │ snapshots, email    │     │  abstraction│
                            │   └─────────┬──────────┘     └──────┬──────┘
                            │             │                        │
                            ▼             ▼                        ▼
                    ┌──────────────┐  ┌────────┐        ┌──────────────────┐
                    │  Audit store │  │   S3   │        │ Vector DB        │
                    │  (append-only│  │ files, │        │ (pgvector first, │
                    │   Postgres)  │  │ exports│        │  Pinecone later) │
                    └──────────────┘  └────────┘        └──────────────────┘
```

**API Service (NestJS).** Owns all relational reads/writes, auth, billing, permissions, and orchestration. Stateless; horizontally scalable behind the load balancer. Exposes versioned REST (`/v1`) and issues short-lived signed tokens that the Realtime Service validates.

**Realtime Service (Node + Hocuspocus).** A dedicated Yjs server (Hocuspocus is the production-grade y-websocket server) handling document sync, presence/awareness, and persistence hooks. Kept separate from the API service because its scaling profile (long-lived sockets, memory-resident documents) is opposite to the API's (short stateless requests). Documents are sharded across instances by `scriptId` using Redis pub/sub for cross-instance awareness.

**Worker Service (Node + BullMQ).** Everything slow or bursty: PDF typesetting, FDX/Fountain import-export, snapshot compaction, search indexing, scheduled backups, email, webhook delivery. Workers pull from Redis-backed queues so the API never blocks on heavy work.

**AI Service (Python FastAPI).** The only service that talks to model providers. Presents one internal API to the rest of the platform regardless of whether the request is served by Anthropic, OpenAI, or Gemini (Section 8). Owns prompt templates, RAG retrieval, cost accounting, and streaming.

**Vector storage.** Start with `pgvector` inside the primary Postgres — one less system to operate, and script-scale corpora (even a 100k-page project is small by embedding standards) fit comfortably. The AI service hides the store behind a `VectorStore` interface so a move to Pinecone/Weaviate at scale is a config change, not a rewrite.

**Clients.** One Next.js codebase serves web and PWA. Tauri wraps it for desktop (native menus, local file access for offline vaults, OS keychain for tokens). Capacitor wraps it for mobile. All three share the same offline-first sync engine because Yjs works identically in all of them.

## 2. Monorepo Layout

A pnpm + Turborepo monorepo keeps types shared end-to-end. The Python AI service lives in the same repo (uv-managed) so a single PR can change a prompt, its API contract, and the frontend that consumes it.

```
fylym/
├── apps/
│   ├── web/                 # Next.js 15 App Router, Tailwind, shadcn/ui
│   ├── api/                 # NestJS REST API
│   ├── realtime/            # Hocuspocus Yjs server
│   ├── worker/              # BullMQ workers (export, import, indexing)
│   ├── ai/                  # FastAPI AI service (Python)
│   ├── desktop/             # Tauri shell wrapping apps/web
│   └── mobile/              # Capacitor shell wrapping apps/web
├── packages/
│   ├── screenplay-core/     # THE crown jewel: block model, format
│   │                        #   profiles, pagination engine, FDX/Fountain
│   │                        #   parsers & serializers. Pure TS, zero deps
│   │                        #   on React/Node APIs → runs in browser,
│   │                        #   worker, server, and tests identically.
│   ├── editor/              # ProseMirror schema, plugins, y-prosemirror
│   ├── contracts/           # Zod schemas for every API request/response;
│   │                        #   OpenAPI generated from these
│   ├── db/                  # Prisma schema + client + seed
│   ├── ui/                  # shadcn-based design system
│   └── config/              # tsconfig, eslint, tailwind presets
├── infra/
│   ├── docker/              # Dockerfiles + compose for local dev
│   ├── terraform/           # AWS: VPC, ECS/Fargate, RDS, ElastiCache, S3
│   └── github/              # CI/CD workflows
└── docs/                    # ADRs, runbooks, this document
```

`screenplay-core` deserves emphasis: pagination, formatting, and format conversion are pure functions over the block model with golden-file tests (input blocks → expected page breaks / FDX XML / Fountain text). Because it has no platform dependencies, the exact same code paginates in a web worker while the writer types and in the worker service when rendering the final PDF — the page counts can never disagree.

## 3. Database Schema

The schema below is expressed in Prisma and is intentionally complete for v1 through v3 of the roadmap. Naming conventions: every table has `id` (UUID v7 — time-ordered, index-friendly), `createdAt`, `updatedAt`; soft deletes via `deletedAt` only where user-recoverable trash is a feature (projects, scripts); hard deletes elsewhere with audit trail.

```prisma
// ── Identity & Tenancy ────────────────────────────────────────────

model User {
  id             String   @id @default(uuid(7))
  email          String   @unique
  emailVerified  DateTime?
  name           String
  passwordHash   String?          // null for OAuth-only accounts
  totpSecret     String?          // encrypted at rest (app-layer AES-256-GCM)
  locale         String   @default("en")
  memberships    Membership[]
  passkeys       Passkey[]
  oauthAccounts  OAuthAccount[]
  sessions       Session[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model OAuthAccount {          // Google, Apple
  id           String @id @default(uuid(7))
  userId       String
  provider     String          // "google" | "apple"
  providerId   String
  user         User   @relation(fields: [userId], references: [id])
  @@unique([provider, providerId])
}

model Passkey {
  id           String @id @default(uuid(7))
  userId       String
  credentialId String @unique   // WebAuthn credential
  publicKey    Bytes
  counter      Int
  user         User   @relation(fields: [userId], references: [id])
}

model Session {               // refresh-token family, rotation tracked
  id           String   @id @default(uuid(7))
  userId       String
  familyId     String          // rotation family for reuse detection
  hashedToken  String   @unique
  ip           String?
  userAgent    String?
  expiresAt    DateTime
  revokedAt    DateTime?
  user         User     @relation(fields: [userId], references: [id])
  @@index([userId, familyId])
}

model Organization {
  id          String  @id @default(uuid(7))
  name        String
  slug        String  @unique
  plan        Plan    @default(FREE)      // FREE | PRO | STUDIO | ENTERPRISE
  stripeCustomerId     String? @unique
  stripeSubscriptionId String?
  seatLimit   Int     @default(1)
  memberships Membership[]
  projects    Project[]
  auditLogs   AuditLog[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Membership {
  id        String   @id @default(uuid(7))
  userId    String
  orgId     String
  role      OrgRole  // OWNER | ADMIN | MEMBER | GUEST
  user      User         @relation(fields: [userId], references: [id])
  org       Organization @relation(fields: [orgId], references: [id])
  @@unique([userId, orgId])
}

// ── Story Domain ──────────────────────────────────────────────────

model Project {
  id          String  @id @default(uuid(7))
  orgId       String
  title       String
  logline     String?
  genre       String[]
  format      ScriptFormat  // FEATURE | TV_ONE_HOUR | SITCOM | STAGE_PLAY
                            // | RADIO | PODCAST | ANIMATION | GAME | COMIC
                            // | DOCUMENTARY | COMMERCIAL | AUDIO_DRAMA ...
  org         Organization @relation(fields: [orgId], references: [id])
  scripts     Script[]
  characters  Character[]
  locations   Location[]
  beats       Beat[]
  boards      Board[]
  research    ResearchItem[]
  collaborators ProjectCollaborator[]
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model ProjectCollaborator {   // per-project ACL on top of org roles
  id        String @id @default(uuid(7))
  projectId String
  userId    String
  role      ProjectRole  // OWNER | WRITER | EDITOR | COMMENTER | READER
  project   Project @relation(fields: [projectId], references: [id])
  @@unique([projectId, userId])
}

model Script {                // one draft lineage; branches are Scripts
  id            String  @id @default(uuid(7))
  projectId     String
  title         String
  branchOfId    String?        // null = mainline; set = branch
  formatProfile String  @default("us-feature")
  revisionColor String?        // active production revision (White, Blue…)
  pagesLocked   Boolean @default(false)
  ydocState     Bytes?         // latest compacted Yjs snapshot
  ydocVector    Bytes?         // state vector for delta sync
  project       Project @relation(fields: [projectId], references: [id])
  scenes        SceneIndex[]
  snapshots     Snapshot[]
  comments      Comment[]
  deletedAt     DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// Read-model extracted from the Yjs doc by the worker on each save.
// Never written by users directly — it exists so SQL can answer
// "which scenes is INT. DINER in?" without parsing the document.
model SceneIndex {
  id           String @id            // == blockId of the scene_heading
  scriptId     String
  position     Int
  heading      String                // "INT. DINER — NIGHT"
  intExt       String?
  locationId   String?
  timeOfDay    String?
  sceneNumber  String?               // locked production numbers: "12A"
  pageStart    Decimal?
  pageEnd      Decimal?
  wordCount    Int    @default(0)
  characterIds String[]              // speaking characters in scene
  status       String?               // outline card status
  color        String?
  script       Script @relation(fields: [scriptId], references: [id])
  @@index([scriptId, position])
}

model Snapshot {              // named + automatic versions
  id          String   @id @default(uuid(7))
  scriptId    String
  label       String?         // "Producer Draft 3", null = autosnapshot
  kind        SnapshotKind    // AUTO | MANUAL | REVISION | LOCKED
  ydocState   Bytes           // full Yjs state at this point
  pdfKey      String?         // S3 key of frozen PDF, for LOCKED drafts
  createdById String
  createdAt   DateTime @default(now())
  script      Script   @relation(fields: [scriptId], references: [id])
  @@index([scriptId, createdAt])
}

model Character {
  id          String  @id @default(uuid(7))
  projectId   String
  name        String
  aliases     String[]
  bio         Json?           // structured: goal, need, want, lie, truth,
                              // fear, wound, arc, backstory, secrets,
                              // mbti, enneagram, bigFive — one JSONB doc,
                              // schema enforced by Zod in `contracts`
  voiceNotes  String?
  color       String?
  relationships CharacterRelationship[] @relation("from")
  project     Project @relation(fields: [projectId], references: [id])
  @@unique([projectId, name])
}

model CharacterRelationship {
  id        String @id @default(uuid(7))
  fromId    String
  toId      String
  kind      String          // "mentor", "rival", "spouse"…
  notes     String?
  from      Character @relation("from", fields: [fromId], references: [id])
}

model Location {
  id        String @id @default(uuid(7))
  projectId String
  name      String
  intExt    String?
  notes     String?
  imageKeys String[]        // S3 keys, mood/reference images
  project   Project @relation(fields: [projectId], references: [id])
}

model Beat {                 // structure templates instantiated per project
  id          String @id @default(uuid(7))
  projectId   String
  templateId  String?        // which StructureTemplate it came from
  slug        String         // "catalyst", "midpoint", "dark-night"
  title       String
  description String?
  position    Int
  actNumber   Int?
  targetPage  Decimal?
  sceneIds    String[]       // SceneIndex ids fulfilling this beat
  project     Project @relation(fields: [projectId], references: [id])
}

model StructureTemplate {    // Save the Cat, Harmon Circle, Kishōtenketsu…
  id        String  @id @default(uuid(7))
  orgId     String?          // null = built-in global template
  name      String
  format    ScriptFormat?
  beats     Json             // ordered beat definitions
  isPublic  Boolean @default(false)
}

model Board {                // plot board / mind map / timeline
  id        String @id @default(uuid(7))
  projectId String
  kind      BoardKind        // PLOT | TIMELINE | MINDMAP | RESEARCH | MOOD
  name      String
  layout    Json             // cards, lanes, edges, positions
  project   Project @relation(fields: [projectId], references: [id])
}

model ResearchItem {
  id        String @id @default(uuid(7))
  projectId String
  title     String
  body      String?
  url       String?
  fileKey   String?          // S3
  tags      String[]
  project   Project @relation(fields: [projectId], references: [id])
}

// ── Annotation & Production ───────────────────────────────────────

model Comment {
  id         String  @id @default(uuid(7))
  scriptId   String
  blockId    String           // stable anchor into the Yjs doc
  parentId   String?          // threading
  authorId   String
  body       String
  kind       CommentKind      // COMMENT | SUGGESTION | DIRECTOR_NOTE
                              // | PRODUCER_NOTE | PRIVATE
  status     String @default("open")   // open | resolved
  script     Script  @relation(fields: [scriptId], references: [id])
  @@index([scriptId, blockId])
}

model BreakdownTag {          // production breakdown: props, cast, VFX…
  id        String @id @default(uuid(7))
  scriptId  String
  sceneId   String            // SceneIndex id
  blockId   String?           // optionally anchored to exact block
  category  BreakdownCategory // CAST | EXTRA | PROP | VEHICLE | ANIMAL
                              // | WARDROBE | MAKEUP | SFX | VFX | STUNT
                              // | MUSIC | EQUIPMENT | SET_DRESSING …
  label     String
  quantity  Int?
  notes     String?
  @@index([scriptId, sceneId, category])
}

// ── Billing, AI accounting, Audit ─────────────────────────────────

model AiInteraction {
  id          String @id @default(uuid(7))
  orgId       String
  userId      String
  projectId   String?
  feature     String          // "dialogue-alts", "plot-holes", "coverage"
  provider    String          // "anthropic" | "openai" | "google"
  model       String
  tokensIn    Int
  tokensOut   Int
  costMicros  Int             // USD micro-cents for exact accounting
  latencyMs   Int
  createdAt   DateTime @default(now())
  @@index([orgId, createdAt])
}

model AuditLog {              // append-only; no update/delete grants
  id        BigInt   @id @default(autoincrement())
  orgId     String
  actorId   String?
  action    String            // "script.export", "member.role_change"…
  target    String?
  ip        String?
  metadata  Json?
  prevHash  Bytes?            // hash chain → tamper-evident
  hash      Bytes             // SHA-256(prevHash ‖ row content)
  createdAt DateTime @default(now())
  org       Organization @relation(fields: [orgId], references: [id])
  @@index([orgId, createdAt])
}
```

Points worth calling out. The `SceneIndex` read-model is the hinge between the CRDT world and the SQL world: the worker re-derives it from the Yjs document after each persistence cycle (debounced ~5s), and every analytics query, production report, and search facet reads from it — nothing ever parses the document at query time. Character psychology lives in one JSONB column rather than thirty nullable columns because the shape will evolve weekly during development; the Zod schema in `packages/contracts` is the real contract. The `AuditLog` hash chain gives the "immutable logs" requirement teeth: each row hashes the previous row, and a nightly job anchors the latest hash into S3 Object-Lock storage, making silent tampering detectable.

Postgres full-text search (a generated `tsvector` over `SceneIndex.heading`, dialogue extracts, and research items, GIN-indexed) covers global search at launch. Meilisearch can be added behind the same search API when typo-tolerance across million-word corpora becomes a differentiator.

## 4. Document Model & Formatting Engine

The canonical in-memory form of a script — identical in the editor, the worker, and every exporter — is:

```typescript
// packages/screenplay-core/src/model.ts
type BlockType =
  | "scene_heading" | "action" | "character" | "dialogue"
  | "parenthetical" | "transition" | "shot" | "lyric"
  | "centered" | "dual_dialogue" | "note" | "section"
  | "synopsis" | "page_break" | "title_page";

interface Block {
  id: string;                  // UUID, immutable for the block's lifetime
  type: BlockType;
  text: string;                // inline marks stored as ranges, not HTML
  marks: MarkRange[];          // bold/italic/underline/strike + revision
  attrs: {
    sceneNumber?: string;      // frozen when pages lock
    revision?: string;         // "blue", "pink" — colored revision marks
    locked?: boolean;
    dualColumn?: "left" | "right";
    elementNumber?: string;    // shots, etc.
  };
}

interface FormatProfile {      // us-feature, uk-stage, bbc-radio, sitcom…
  page: { width: number; height: number; margins: Margins };
  elements: Record<BlockType, ElementStyle>;  // indents, caps, spacing,
  pagination: PaginationRules;                // widow/orphan, MORE/CONT'D
}
```

**Formatting is automatic** because it is derived: the editor renders each block with the `ElementStyle` for its type; there is no per-character styling to get wrong. The Tab/Enter state machine (`character` + Enter → `dialogue`; `dialogue` + Tab → `parenthetical`; empty `dialogue` + Enter → `action`, etc.) is a pure transition table in `screenplay-core`, unit-tested exhaustively, shared by every client.

**Pagination** is the hardest correctness problem in screenwriting software and is solved once, in one place. `paginate(blocks, profile) → PageMap` implements the industry rules: never orphan a scene heading at page bottom, break dialogue with `(MORE)` / `CHARACTER (CONT'D)`, never separate a parenthetical from its first dialogue line, honor locked pages by emitting `A/B` pages instead of reflowing. It runs incrementally in a web worker (only re-paginating from the edited block forward) so the page ruler updates live without ever blocking typing — this is how "instant typing on 10,000-page projects" is actually achieved. The same function runs server-side for PDF export, guaranteeing the writer's page 87 is the producer's page 87.

**Revision workflow.** Entering "production mode" freezes scene numbers and pages (LOCKED snapshot). Subsequent edits carry a `revision` mark with the active color; changed pages render revision stars in the margin; a Revision Draft export emits only changed pages plus the revision title page. All of this is metadata over the same block model — no parallel document format.

## 5. CRDT & Realtime Collaboration Strategy

**Why Yjs.** The requirements — realtime co-editing, offline editing with automatic sync, branching and merge, infinite undo, no data loss — are exactly the CRDT problem, and Yjs is the mature answer: sub-millisecond local ops, binary encoding measured in bytes per keystroke, `y-prosemirror` binding, `y-indexeddb` for offline persistence, and awareness protocol for cursors/presence built in.

**Document topology.** One Yjs document per `Script`. Inside it: `Y.XmlFragment("content")` bound to ProseMirror (the block sequence), `Y.Map("meta")` for title-page fields and format profile, and `Y.PermanentUserData` mapping edit ranges to users (powering per-author attribution and revision marks). Character sheets, beats, and boards are *not* in the script CRDT — they're relational data edited through the API with standard optimistic concurrency, because they don't need character-level merging and keeping them in SQL keeps them queryable.

**Sync protocol.** Clients connect to the Realtime Service over WSS with a short-lived (60s) document token minted by the API service after a permission check — the socket server never touches the auth database. Hocuspocus handles the Yjs sync handshake (state-vector exchange → minimal diff), awareness broadcast (cursors, selections, "Maya is in Scene 12"), and server-side hooks:

```
onStoreDocument (debounced 4s):
  1. append incremental update  → yjs_updates table (append-only)
  2. every N updates or 5 MB    → compact into Script.ydocState,
                                   delete superseded rows
  3. enqueue "derive" job        → worker rebuilds SceneIndex,
                                   search vectors, analytics facts
onAuthenticate: verify doc token signature + expiry
onAwarenessUpdate → fan out via Redis pub/sub to sibling instances
```

**Offline & multi-device.** `y-indexeddb` persists every update locally; the PWA/Tauri/Capacitor clients are fully writable offline. On reconnect, state vectors exchange and only missing updates flow either way — merge is automatic and conflict-free by construction. The UI surfaces a subtle "synced / offline / syncing" indicator; there is no "resolve conflict" dialog because the data model makes one unnecessary.

**Undo.** `Y.UndoStack` scoped to the local user's origin, so undo reverts *your* changes, never a collaborator's — the only correct behavior in co-writing, and one Final Draft still gets wrong.

**Branching & merge.** A branch is a new `Script` row seeded from a snapshot's `ydocState` — cheap, instant, fully editable in isolation. Merge is deliberately *not* an automatic CRDT merge (silently interleaving two divergent drafts of a scene produces garbage prose). Instead the worker computes a scene-level diff between branch and mainline using stable `blockId`s: unchanged scenes pass through, scenes changed on only one side apply cleanly, scenes changed on both sides are presented side-by-side for a human pick/edit decision. This matches how writers actually think about merging drafts. The approval workflow (Producer Review) is a thin state machine over the same mechanism: a branch + a required approver before merge.

**Scale envelope.** A 300-page feature is ~50k Yjs ops ≈ 2–4 MB compacted; a memory-resident document per active script is trivial. Sharding by `scriptId` with consistent hashing across Realtime instances, plus Redis-relayed awareness, takes the design to tens of thousands of concurrent sessions before anything clever is needed.

## 6. API Contracts

All request/response shapes are defined once as Zod schemas in `packages/contracts`; NestJS validates against them at the edge, the OpenAPI spec is generated from them, and the frontend's React Query hooks are typed by them — one source of truth, drift impossible by construction.

REST, versioned at `/v1`, resource-oriented. The surface below is the v1 contract (representative bodies shown where the shape is non-obvious):

```
Auth
  POST /v1/auth/register • /login • /logout • /refresh
  POST /v1/auth/magic-link            { email }
  POST /v1/auth/oauth/:provider/callback
  POST /v1/auth/2fa/enroll • /verify  (TOTP)
  POST /v1/auth/passkeys/register • /authenticate   (WebAuthn)

Orgs & members
  GET/POST        /v1/orgs
  GET/PATCH/DELETE /v1/orgs/:orgId
  GET/POST        /v1/orgs/:orgId/members
  PATCH/DELETE    /v1/orgs/:orgId/members/:userId    { role }

Projects
  GET/POST        /v1/orgs/:orgId/projects
  GET/PATCH/DELETE /v1/projects/:id
  GET/POST/PATCH  /v1/projects/:id/collaborators

Scripts & versions
  POST /v1/projects/:id/scripts        { title, formatProfile }
  GET  /v1/scripts/:id                 → metadata + latest snapshot ref
  POST /v1/scripts/:id/branches        { fromSnapshotId?, title }
  POST /v1/scripts/:id/merge           { sourceBranchId }
                                       → { autoMerged[], conflicts[] }
  POST /v1/scripts/:id/merge/resolve   { resolutions: {sceneId, pick}[] }
  GET  /v1/scripts/:id/snapshots
  POST /v1/scripts/:id/snapshots       { label, kind }
  POST /v1/scripts/:id/lock            { revisionColor }   → locked pages
  POST /v1/scripts/:id/doc-token       → { token, wsUrl }  (realtime entry)

Story tools
  CRUD /v1/projects/:id/characters • /locations • /beats • /boards
       /v1/projects/:id/research
  GET  /v1/scripts/:id/scenes          → SceneIndex read-model
  PATCH /v1/scenes/:sceneId            { status, color, label }  (outliner)

Annotations & production
  GET/POST /v1/scripts/:id/comments    ?blockId= &status=
  PATCH    /v1/comments/:id            { status: "resolved" }
  CRUD     /v1/scripts/:id/breakdown   ?sceneId= &category=
  GET      /v1/scripts/:id/reports/:kind    kind ∈ breakdown-summary,
           character-scene-matrix, location-day-night, cast-day-out-of-days

Import / export  (async job pattern)
  POST /v1/projects/:id/imports        multipart file → { jobId }
  POST /v1/scripts/:id/exports         { format: "pdf"|"fdx"|"fountain"|
                                         "docx"|"epub"|"html"|"csv"|"json",
                                         options } → { jobId }
  GET  /v1/jobs/:jobId                 → { status, progress, resultUrl? }
       (clients may also subscribe to job events over the realtime socket)

AI  (proxied to AI service; all streaming via SSE)
  POST /v1/ai/assist        { feature, scriptId, scope, params } → SSE
  POST /v1/ai/analyze       { scriptId, analyses: [...] }        → jobId
  GET  /v1/ai/analytics/:scriptId      → cached analysis dashboard data
  GET  /v1/orgs/:orgId/ai-usage        → per-feature token/cost rollup

Billing & admin
  POST /v1/billing/checkout • /portal        (Stripe hosted surfaces)
  POST /v1/webhooks/stripe                   (signature-verified)
  GET  /v1/admin/*                           (platform-staff RBAC only)
Search
  GET  /v1/projects/:id/search        ?q= &types=scene,dialogue,character,
                                       prop,research &tags=
```

Error envelope everywhere: `{ error: { code, message, details? } }` with stable machine-readable `code` strings. Pagination: cursor-based (`?cursor=&limit=`) on every list. Idempotency: mutating endpoints accept an `Idempotency-Key` header (stored in Redis, 24h), which the offline-capable clients use on replay so a flaky reconnect can never double-create. Rate limits are enforced per-user and per-org in Redis (token bucket) beneath Cloudflare's coarser L1 limits, with headers (`RateLimit-Remaining`) on every response.

WebSocket traffic is deliberately narrow: the Yjs binary protocol plus a small JSON envelope for job-progress and comment-created events. Everything else is REST — sockets are for hot paths only.

## 7. AI Service & Provider Abstraction

The AI layer's design goals: no provider lock-in, structured outputs the product can render (not walls of prose), context assembly that respects a 100k-page project, streaming everywhere, and to-the-token cost accounting per org.

**Provider abstraction.** One internal interface, three adapters:

```python
# apps/ai/src/providers/base.py
class CompletionProvider(Protocol):
    async def complete(self, req: CompletionRequest) -> AsyncIterator[Delta]:
        """Streamed completion. CompletionRequest is provider-agnostic:
        system, messages, tools, response_schema, max_tokens, temperature."""

class AnthropicProvider: ...   # Claude models via Messages API
class OpenAIProvider: ...
class GeminiProvider: ...

# routing.py — policy, not code, decides who serves what
ROUTES: dict[Feature, RoutePolicy] = {
  "dialogue_alternatives": RoutePolicy(primary="anthropic", fallback="openai"),
  "plot_hole_scan":        RoutePolicy(primary="anthropic", fallback="google"),
  "grammar_pass":          RoutePolicy(primary="google",    fallback="openai",
                                       tier="fast"),   # cheap model class
  ...
}
```

Routing lives in config (hot-reloadable), chooses by feature + org plan + latency budget, and falls back automatically on provider errors with circuit-breaking per provider. Current model identifiers are configuration values checked against provider docs at deploy time (for Anthropic, https://docs.claude.com/en/api/overview), never hardcoded in logic — models change faster than code.

**Every feature returns typed JSON, never freeform text**, using each provider's structured-output/tool mechanism. Example contract:

```json
// feature: "plot_hole_scan" response
{ "findings": [ {
    "kind": "continuity" | "logic" | "timeline" | "setup_no_payoff",
    "severity": "info" | "warning" | "critical",
    "blockIds": ["…"],                // anchors → UI highlights exact lines
    "summary": "Maya's cast is on her left arm in Sc. 14, right in Sc. 31.",
    "suggestion": "…"
} ] }
```

Because findings are anchored to `blockId`s, the frontend renders them as inline decorations and a sidebar list — the same pattern serves plot holes, pacing flags, show-don't-tell notes, subtext analysis, and character-consistency warnings. One rendering system, N features.

**Context assembly (RAG).** The worker embeds every scene, character sheet, beat, and research item on change (per-project namespace in the vector store). A feature request assembles context deterministically: the target scene verbatim; retrieved nearest-neighbor scenes/facts; the relevant character sheets; the project "story bible" summary (an AI-maintained rolling digest, itself re-derived when the script changes materially). This is what makes "character consistency across 300 pages" feasible inside a model context window. All prompts are versioned Jinja templates in-repo; every AI response logs `prompt_version`, enabling offline eval of prompt changes against a golden set of scripts before rollout.

**The "modes"** (Festival, Hollywood Studio, Minimalist, Commercial, Oscar-level rewrite) are system-prompt overlays plus parameter presets over the same features — product surface, not new architecture.

**Analytics engine.** The dashboard metrics split by how they're computed. Deterministic metrics — dialogue/action ratio, scene length distribution, character screen time and balance, word frequency, act balance, pacing-by-page — are computed by the worker in pure TypeScript from `SceneIndex` + the block model: instant, free, always current. Model-scored metrics — emotion curve, tension/suspense curve, comedy timing, theme density, ending-satisfaction estimate — run scene-by-scene through a fast model tier, are cached per scene content-hash (only re-scored scenes you actually changed), and are explicitly labeled in the UI as *model estimates*, honest framing being both good ethics and good product. "Audience engagement prediction" ships as a directional curve with confidence bands, not a fake precision score.

**Cost control.** Every call writes an `AiInteraction` row; Redis maintains rolling per-org counters; plans enforce monthly token budgets with soft-warning at 80% and metered overage (Studio+) or hard stop (Free/Pro). Semantic caching (embedding-similarity lookup on recent identical asks) cuts repeat-cost on analysis reruns.

**AI safety posture.** User scripts are sent to providers under enterprise/no-training terms only; the org-level setting to disable third-party AI entirely (contractual requirement for some studios) flips all AI features off at the API gateway. AI never mutates the document directly — every suggestion is a proposal the writer explicitly applies, which both matches the "AI assists, never replaces" philosophy and keeps the CRDT history purely human-attributed.

## 8. Import / Export Engine

All conversion logic lives in `screenplay-core` as pure functions between external formats and the block model, executed by the Worker Service via the async job pattern (Section 6).

**FDX (Final Draft).** FDX is XML with `<Paragraph Type="Scene Heading">`-style elements — a near-1:1 mapping onto our block types, including dual dialogue, scene numbers, revisions, and title page. Import parses defensively (real-world FDX files violate their own schema constantly); export targets Final Draft 12/13 compatibility and is validated by a golden-file corpus of scripts round-tripped byte-for-semantic-equality. **Fountain** gets a full spec-compliant parser/serializer (sections, synopses, notes, boneyard, dual-dialogue `^`, forced elements) — Fountain is also FYLYM's plain-text interchange for git-inclined writers. **Celtx/Fade In/Highland/WriterDuet** all speak FDX and/or Fountain, so dedicated importers are thin wrappers plus quirk tables rather than new parsers. **PDF import** is honest heuristics: text extraction, then element classification by indentation/caps/position, flagged lines routed to a review screen — no tool does this perfectly, and pretending otherwise loses user trust. **DOCX/TXT/Markdown** import via the same classifier.

**PDF export** is the flagship output and uses the deterministic paginator (Section 4) driving a typesetting renderer (Courier metrics embedded, so output is identical across environments) — never HTML-to-PDF, which cannot honor screenplay pagination rules. Variants (production draft with scene numbers and revision stars, watermarked review copies with per-recipient diagonal watermarks burned in server-side, revision-pages-only drafts, title-page-signed pitch drafts) are option flags over the same pipeline. **Movie Magic compatibility** ships as the standard Scheduling export (a breakdown-tagged script export plus CSV/SEF-style scene tables from `BreakdownTag` + `SceneIndex`), alongside Excel breakdown workbooks, call-sheet-ready CSVs, DOCX, EPUB, HTML, JSON (the raw block model — the escape hatch that guarantees users are never locked in), and XML.

## 9. Security Model

**Authentication.** Email/password (argon2id), Google and Apple OAuth (PKCE), magic links (single-use, 10-min expiry, hashed at rest), TOTP 2FA, and WebAuthn passkeys as the promoted default. Sessions are JWT access tokens (10 min, asymmetric ES256 so the Realtime and AI services verify without a shared secret) plus rotating refresh tokens with family-reuse detection — a replayed refresh token revokes the whole family, the standard defense against token theft.

**Authorization** is two-layer RBAC: org roles (Owner/Admin/Member/Guest) gate billing, membership, and project creation; per-project roles (Owner/Writer/Editor/Commenter/Reader) gate content. Enforcement is a single NestJS guard evaluating a central policy table — one choke point to audit — and the Realtime service inherits the decision via scoped claims inside the 60-second document token, so a revoked collaborator loses socket access within a minute without the socket layer ever querying the DB. Guest review links are scoped, expiring capability tokens (Commenter or Reader only), optionally watermarking every page render with the guest's email.

**Encryption.** TLS 1.3 everywhere external; AES-256 at rest via RDS/S3/ElastiCache native encryption with KMS-managed keys; a second application layer of AES-256-GCM (per-org data keys, envelope-encrypted by KMS) over high-sensitivity columns — script snapshots, Yjs state, TOTP secrets — so even a raw database leak exposes ciphertext. Backups inherit encryption; S3 export artifacts are sealed with per-object keys and served only via short-lived signed URLs. **Zero-knowledge vaults** ship as a clearly-scoped optional tier: client-side XChaCha20-Poly1305 with keys derived from a user passphrase, at the documented cost of server-side search, AI features, and password-based recovery for those projects — the tradeoff is stated in the UI, not hidden.

**Application security.** OWASP ASVS L2 as the audit checklist: Prisma parameterization (no raw SQL without review), strict CSP with nonces, CSRF double-submit on cookie-authed routes, SSRF-safe fetch wrapper for any user-supplied URL (research imports), upload scanning + content-type sniffing on S3 ingest, dependency audit + Semgrep + secret-scanning in CI, and an internal admin panel on a separate origin with mandatory passkeys and full audit logging. Rate limiting: Cloudflare at the edge (bot detection, L7 rules), Redis token-buckets per user/org/IP at the app layer, and stricter budgets on auth and AI endpoints.

**Compliance path.** GDPR from day one: data-processing records, export-my-data (the JSON export doubles as DSAR fulfillment), hard-delete pipeline that also purges vector embeddings and S3 artifacts, EU data residency as a Studio/Enterprise deployment option. SOC 2 readiness is mostly the architecture already described — immutable audit chain, least-privilege IAM, change management via protected branches + required review, centralized logging — plus the organizational controls; target a Type I audit after six months of production operation.

**Durability.** Autosave is continuous by construction (every Yjs update persists within ~4 s; local IndexedDB persists instantly). RDS point-in-time recovery (35-day window) + nightly logical dumps to versioned, Object-Locked S3 + cross-region replica. Recovery objectives: RPO ≤ 5 minutes, RTO ≤ 1 hour, rehearsed quarterly via automated restore-and-verify jobs. "No data loss" is thus three independent layers — client IndexedDB, append-only update log, and PITR — any one of which can restore a session.

## 10. Performance Strategy

"Instant typing, zero lag" decomposes into keeping three things off the keystroke path. Typing itself touches only local structures: ProseMirror transaction → Yjs update → IndexedDB, all sub-millisecond; network sync, pagination, and derivation are asynchronous observers. Pagination runs incrementally in a web worker (re-flowing only from the edited block forward — median re-flow on a 300-page script is a few pages). Rendering uses block-level virtualization: the DOM holds only the viewport plus overscan, so a 100,000-page project renders the same number of DOM nodes as a 10-page short; the outline sidebar, scene list, and analytics all read from `SceneIndex`, never from the document. Search stays fast at scale via GIN-indexed tsvectors updated by the derive job (writers see new text searchable within seconds, and the editor's in-document find is instant because it scans the local block array). Infinite undo is native to `Y.UndoStack` with O(1) memory per op. Backend budgets, enforced by k6 tests in CI: p95 < 120 ms on hot REST reads, < 50 ms added latency on realtime relay, cold script open (snapshot fetch + hydrate) < 800 ms for a 300-page script.

## 11. Infrastructure & DevOps

Local development is one `docker compose up`: Postgres, Redis, MinIO (S3-compatible), all five services with hot reload, plus a seeded demo org. Production runs on AWS ECS Fargate (API, Realtime, Worker, AI as separate services with independent autoscaling — Realtime scales on connection count, Worker on queue depth, API on CPU/RPS), RDS Postgres Multi-AZ, ElastiCache Redis, S3, all behind Cloudflare with AWS ALB origin locked to Cloudflare IPs. Terraform owns every resource; environments (dev/staging/prod) are workspaces of the same modules.

CI/CD is GitHub Actions: on PR — typecheck, lint, unit + integration tests (Postgres/Redis service containers), `screenplay-core` golden-file suite, Playwright E2E against a compose stack, Semgrep + dependency audit, preview deploy; on main — build/push images, migrate-then-deploy to staging, smoke suite, one-click promote to prod with automatic rollback on health-check regression. Database migrations follow expand-and-contract so deploys are zero-downtime. Observability: OpenTelemetry traces across all five services (one trace ID from keystroke-triggered API call through worker job), Prometheus/Grafana metrics with SLO burn-rate alerts, Sentry for both frontend and backend errors with release tagging, structured JSON logs shipped to CloudWatch with PII scrubbing at the log layer.

## 12. Testing Strategy

The test pyramid is anchored by `screenplay-core`: property-based tests (fast-check) assert round-trip invariants — `parse(serialize(doc)) ≡ doc` for FDX and Fountain, pagination determinism, Tab/Enter state-machine totality — and a golden corpus of ~50 real-world scripts (varied formats, dual dialogue, locked revisions) pins expected page breaks and export bytes. Above that: NestJS integration tests per endpoint against real Postgres in containers (including RBAC matrix tests that assert every role × endpoint combination); multi-client CRDT simulation tests (two headless Yjs clients editing offline, reconnecting, asserting convergence and undo isolation); Playwright E2E for the golden paths (write a scene collaboratively, comment, export PDF, import FDX, upgrade plan); k6 load tests enforcing the Section 10 budgets and a 5,000-concurrent-socket realtime soak; axe-core + manual screen-reader passes for WCAG AA on the editor (a custom-editor accessibility problem that gets its own test suite, not an afterthought); and AI prompt evals — the golden-script corpus run through each analysis feature with scored expected findings — gating any prompt or routing change.

## 13. Key Risks

The four highest-risk items, named so they're staffed first: (1) **pagination correctness** — the single feature professional writers will judge in the first ten minutes; mitigated by building `screenplay-core` first with the golden corpus. (2) **FDX fidelity** — import that mangles a writer's Final Draft file is fatal to adoption; mitigated by the round-trip corpus and defensive parsing. (3) **Realtime durability under partition** — mitigated by the three-layer persistence design and CRDT simulation tests. (4) **AI cost blowout** — mitigated by per-org budgets, semantic caching, and tiered model routing from day one, not retrofitted.

## 14. Phased Delivery Roadmap

Each phase ships something a writer can use; nothing waits for "the platform" to be done.

**Phase 1 — The Core (≈ weeks 1–8).** `screenplay-core` complete with golden tests; ProseMirror editor with auto-formatting, all block types, dark/light/focus/typewriter modes; local persistence (IndexedDB); PDF + Fountain + FDX export; auth (email, Google, magic link); projects and scripts CRUD; deploy pipeline live. *Exit test: a screenwriter drafts a real feature start-to-finish and hands the PDF to a producer.*

**Phase 2 — Collaboration (≈ weeks 9–16).** Realtime service, presence, comments and suggestions, snapshots and version history, guest review links, offline sync across devices, FDX/Fountain/PDF import, Stripe billing with Free/Pro plans, autosave/no-data-loss hardened.

**Phase 3 — Story Intelligence (≈ weeks 17–26).** Structure template library + beat board + outliner with drag-drop cards; character system with sheets, relationship map, screen-time analytics; deterministic analytics dashboard; AI service with the first eight features (brainstorm, dialogue alternatives, plot-hole scan, pacing analysis, character consistency, rewrite assistant, grammar/continuity pass, logline/coverage) — each anchored to blockIds, each opt-in.

**Phase 4 — Production & Scale (≈ weeks 27–38).** Production mode: locked pages, colored revisions, scene numbering, revision drafts; breakdown tagging and production reports; branching/merge with producer approval workflow; Studio plan, teams and org admin; admin console; SOC 2 groundwork; Tauri desktop build.

**Phase 5 — Platform (≈ weeks 39+).** Remaining format profiles (stage, radio, comics, game narrative, interactive), model-scored analytics curves, mind map/timeline boards, research boards with images, public API + white label, Capacitor mobile, Enterprise tier (SSO/SAML, residency, zero-knowledge vaults), affiliate/referral system.

---

## Appendix A — Environment & Configuration Contract

Every service reads config exclusively from environment (12-factor), validated at boot by a Zod/Pydantic schema that fails fast with a named missing key. Secrets live in AWS Secrets Manager, injected at task launch, never in images or repo. Feature flags (analysis features, AI providers, plan gates) are served from a `feature_flags` table cached in Redis with a 30-second TTL, editable from the admin console — the mechanism behind safe incremental rollout of every AI feature.

## Appendix B — What Was Deliberately Cut From v1

Honesty about scope is part of the design. Not in v1: native mobile *editing* (mobile ships read/comment first — screenplay editing on phones needs its own interaction design), automatic CRDT merging of divergent branches (human-mediated scene merge is correct, not a compromise), zero-knowledge mode for collaborative projects (incompatible with server-side search/AI; single-writer vaults only), PDF import "perfection" (review-screen workflow instead), and Movie Magic native `.mmx` write (industry-standard interchange exports instead, pending format licensing investigation).

*End of blueprint. Companion documents to produce next, in order: `screenplay-core` API reference, the ProseMirror schema definition, and the Phase 1 ticket breakdown.*
