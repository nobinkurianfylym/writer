# Golden corpus & conformance harness

A fixed set of hand-curated screenplay documents, each with committed
"golden" snapshots (expected Fountain, expected FDX, expected page-break
list) that every core screenplay-core function is checked against on every
CI run. This is a **regression guard**, not an independent correctness
oracle — see "What this corpus does and doesn't prove" below.

## Running it

```sh
pnpm test:golden       # just this suite
pnpm test              # runs it too, alongside everything else
pnpm golden:generate   # regenerates fixtures/ from corpus.ts
```

## Layout

- `corpus.ts` — the registry. Each `CorpusEntry` is `{ name, description,
  profile, build() }` plus optional `knownFountainLimitation` /
  `knownFdxLimitation` markers (see below).
- `builders.ts` — `DocBuilder`, a small fluent helper for constructing
  `ScreenplayDocument`s with deterministic `"b1"`, `"b2"`, ... ids (not
  random UUIDs — golden fixtures are committed text, so regenerating one
  must produce a byte-identical diff or none at all).
- `page-break-summary.ts` — reduces a `PageMap` to `{ pageNumber, lineCount,
  firstContentBlockId, lastContentBlockId }` per page: enough to catch
  pagination drift without being so granular that harmless internal changes
  break every fixture.
- `generate.ts` — a dev script (`pnpm golden:generate`) that runs the real,
  already property-tested `normalize`/`serializeFountain`/`serializeFdx`/
  `paginate` once per corpus entry and writes the result to
  `fixtures/<name>/`. **Not run automatically** — you run it deliberately
  after adding or changing an entry, then review the diff.
- `fixtures/<name>/` (generated, committed) —
  `description.txt`, `profile.txt`, `document.json` (canonical block JSON),
  `expected.fountain`, `expected.fdx`, `expected.pagebreaks.json`.
- `golden.test.ts` — the harness. For every entry: canonical JSON matches
  the committed snapshot; the document is structurally valid and
  `normalize()`-idempotent; `serializeFountain`/`serializeFdx` match their
  committed snapshots; `parseFountain`/`parseFdx` round-trip back to the
  canonical document; `paginate()` matches the committed page-break list and
  never drops a block's content.

## Adding a corpus entry

1. Add a `register({ name, description, profile, build })` call in
   `corpus.ts`, using `DocBuilder` to construct the document. Pick a
   `name` that doesn't collide with an existing entry (there's a test that
   checks this).
2. If the entry exercises something Fountain or FDX genuinely can't
   represent losslessly (see below), set `knownFountainLimitation` and/or
   `knownFdxLimitation` with a `reason` explaining *why* — not just that a
   test happened to fail.
3. Run `pnpm golden:generate`, then read the diff under `fixtures/<name>/`
   like you'd read a code review — this is the moment you're actually
   checking the output is correct, since generation doesn't validate
   anything on its own.
4. Run `pnpm test:golden` to confirm the harness passes against what you
   just generated.
5. Commit `corpus.ts`'s new `register(...)` call together with the new
   `fixtures/<name>/` directory in the same commit.

## Regenerating after an intentional behavior change

If you change something in `screenplay-core` that legitimately changes
Fountain/FDX/pagination output (not a regression — an intentional
improvement), `pnpm test:golden` will fail across every affected entry.
That's the suite doing its job. Run `pnpm golden:generate`, review the full
diff across `fixtures/` carefully (a one-line change to shared logic can
touch dozens of entries), and commit the regenerated fixtures alongside the
code change that caused them, in the same commit — a fixture diff with no
corresponding code change (or vice versa) should be treated as a red flag
in review.

## What this corpus does and doesn't prove

Fixture generation runs today's `screenplay-core` functions and commits
their output as "expected" — it does **not** independently derive the
correct answer from the Fountain/FDX spec or a real screenwriting
application. Correctness of the underlying logic is what the property-based
tests elsewhere in this package (fast-check, thousands of generated
documents per run) are for. What this corpus adds on top:

- **Specific, human-curated scenarios** property generators are unlikely to
  hit by chance (a 200-scene feature, a second parenthetical mid-speech,
  every element type adjacent to every other) — several genuine bugs were
  found this way while building this corpus (see git history for
  `fountain/parse.ts` and `fountain/serialize.ts` around this commit).
- **A regression guard**: if a future change silently alters Fountain
  output, FDX output, or where pages break for any of these 28 documents,
  `pnpm test:golden` fails immediately with an exact diff, without needing
  10,000 random property-test runs to get lucky enough to hit the same
  input shape.

It also does **not** include real public-domain screenplays. The build
plan calls for "public-domain screenplays reformatted" alongside
purpose-written stress fixtures; this corpus is entirely purpose-written —
fetching and reformatting actual scripts would mean pulling external text
into the repo without being able to verify its license status firsthand.
Every entry here is original, written to exercise the same structural
patterns real scripts would.

## Known Fountain/FDX limitations (not bugs)

A few entries are marked `knownFountainLimitation` or `knownFdxLimitation`
because the underlying format genuinely cannot represent something our
model can:

| Entry | Format | What's lost | Why |
|---|---|---|---|
| `shots-and-action`, `mixed-caps-elements` | Fountain | `shot` type | No dedicated shot syntax (§8) — round-trips as forced action |
| `revision-marks` | Fountain | revision-color marks | No revision-color syntax |
| `emphasis-heavy` | Fountain | strike marks | No standard strikethrough syntax |
| `empty-and-blank-heavy` | Fountain | whitespace-only text | Trimmed to empty by design — no meaningful content to preserve |
| `every-element-adjacency-pair` | Fountain | exact round-trip (skipped entirely) | Includes adjacencies with no Fountain representation at all (e.g. dialogue with no preceding character cue) — this fixture's job is exercising every transition without crashing, not lossless round-tripping |
| `title-page-present` | FDX | passthrough presence | A title page's FDX paragraphs are always captured as passthrough on first parse (for later round-trip fidelity), even when freshly synthesized — see `fdx/parse.ts`'s `parseTitlePage` |

If you hit a *new* mismatch while adding an entry, don't reach for
`knownFountainLimitation`/`knownFdxLimitation` by default — first check
whether it's actually a bug (most of the ones found while building this
corpus were). Only use these markers once you've confirmed the format
itself has no way to represent what you're testing.
