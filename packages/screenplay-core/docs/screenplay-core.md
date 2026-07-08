# screenplay-core

The formatting brain of FYLYM Writer: a dependency-light, platform-neutral
TypeScript package with no React, no Node APIs, and no DOM. Everything in
here is a pure function over plain data, which is what makes it possible to
test exhaustively with property-based tests and reuse identically in the
editor, the worker, and (for the PDF typesetter) the browser.

This document is a narrative companion to the generated API reference
(`pnpm docs`, output to `docs/api/`) — it explains the shape of the system;
the API reference is the source of truth for exact signatures.

> This narrative was written from, and should be kept in sync with, the
> actual shipped implementation. It has not been independently checked
> against the full Architecture Blueprint §4 text by an automated process —
> that comparison (call out in the E1-10 accept criteria) is a manual review
> step for whoever holds the blueprint document.

## The block model

Everything in a screenplay is a flat, ordered list of `Block`s
(`ScreenplayDocument.blocks`). There is no tree — no nested "scene" or
"page" containers. A `Block` is:

```ts
interface Block {
  id: string;           // UUID, stable for the block's lifetime
  type: BlockType;       // one of 15 kinds — see BLOCK_TYPES
  text: string;          // plain text, no markup
  marks: MarkRange[];    // inline emphasis over `text`
  attrs: BlockAttrs;     // optional, mostly format-specific metadata
}
```

The 15 `BlockType`s are: `scene_heading`, `action`, `character`, `dialogue`,
`parenthetical`, `transition`, `shot`, `lyric`, `centered`, `dual_dialogue`,
`note`, `section`, `synopsis`, `page_break`, `title_page`.

**Marks** are half-open ranges (`[start, end)` over `text`) tagged with a
`MarkKind` (`bold`, `italic`, `underline`, `strike`, `revision`). Multiple
marks of *different* kinds can overlap on the same span (bold+italic is
common); the model doesn't allow two overlapping marks of the *same* kind on
one block — `normalize()` repairs that if it happens.

**Dual dialogue** has no dedicated block type of its own for the left/right
columns — instead, a `dual_dialogue` marker block (empty text, purely
structural) is immediately followed by one or more blocks tagged
`attrs.dualColumn === "left"`, then one or more tagged `"right"`. A block
tagged `dualColumn` anywhere else is a structural violation. This flat
encoding (rather than a nested "DualDialogueGroup" container) is what keeps
the whole document a single flat array, which every downstream consumer
(layout, pagination, Fountain/FDX serialization) can iterate linearly
without special-casing a tree shape.

**`normalize(doc)`** is the single structural-repair function: given *any*
`ScreenplayDocument` — including ones with duplicate ids, out-of-bounds or
overlapping marks, or dual-dialogue blocks missing their pairing — it
returns a document satisfying every invariant, deterministically, without
ever changing the id of a block that was already valid. **`validate(doc)`**
/ **`isValid(doc)`** report violations without repairing them, for callers
(like the golden corpus harness) that want to assert a document is already
clean.

**`BlockAttrs.passthrough`** (and the matching
`ScreenplayDocument.passthrough`) is the escape hatch for import-format
metadata screenplay-core doesn't model directly — an FDX paragraph's
unrecognized attributes, for instance. It's opaque, untouched by
`normalize()`, and only guaranteed to round-trip through a direct
parse-then-serialize of the *same* format (see the FDX section below).

## Format profiles

A `FormatProfile` is the complete, declarative description of "what a page
looks like": physical dimensions, per-`BlockType` measure/indent/spacing
(`ElementStyle`), and the rules governing where pages break
(`PaginationRules`). Two are shipped: `usFeatureProfile` (standard US
feature format, no acts) and `usTvOneHourProfile` (same page geometry, but
`honorsActBreaks: true` for act-break page forcing).

```ts
interface FormatProfile {
  id: string;
  name: string;
  page: PageDimensions;                    // width/height/margins, inches
  elements: Record<BlockType, ElementStyle>; // one entry per BlockType, no exceptions
  pagination: PaginationRules;
}
```

Profiles are **data, not code** — `parseFormatProfile(data)` validates a
plain object against a Zod schema and throws a single-line error naming the
offending path on failure. This is deliberate: a malformed profile should
fail loudly and immediately, not produce silently-wrong pagination three
functions later.

### Adding a new format profile

1. Build a plain object matching `FormatProfile`'s shape — every one of the
   15 `BlockType`s needs an `ElementStyle` entry, even ones with no visual
   footprint (`page_break`, `title_page`, `dual_dialogue` — give them
   `indent: 0, width: 0, spaceBefore: 0, spaceAfter: 0` and move on).
2. Call `parseFormatProfile(raw)` and export the result — see
   `profiles/us-feature.ts` for the reference shape.
3. If the new profile changes the *pagination rules* (not just page
   geometry), read `pagination/solver.ts`'s top-of-file comments first —
   `honorsActBreaks`, `sceneHeadingMinLinesBeforeBreak`, and
   `minOrphanLines` all interact with the keep-together solver in ways
   that aren't independent of each other.
4. Add it to the golden corpus (`packages/screenplay-core/src/golden/`) if
   it's meant to be a permanent, user-facing profile — every shipped
   profile should have at least one corpus entry exercising it.

## Pagination guarantees

`paginate(doc, profile)` turns a `ScreenplayDocument` into a `PageMap`: an
ordered list of `Page`s, each a flat array of `LayoutLine`s (one row of the
physical page grid — either wrapped content or a blank spacer). This is the
single source of layout truth every downstream renderer (the PDF
typesetter, a future editor pagination display) consumes without making its
own layout decisions.

The pipeline, in order:

1. **`layoutDocument`** wraps every block's text to its `ElementStyle`'s
   measure width (12pt Courier, 10 chars/inch, 6 lines/inch — the one fixed
   typographic assumption this whole package makes), producing spacer +
   content lines per block, with each line's `MarkRange`s sliced and
   rebased onto that line's own local offsets (`LayoutLine.marks`).
2. **The keep-together solver** (`pagination/solver.ts`) groups lines into
   chunks that must be decided about as a unit — a scene heading pulls
   forward enough of what follows that it's never orphaned at the bottom of
   a page; a character/parenthetical cue is never left as the last thing on
   a page; `action`/`dialogue`/`lyric` are the only types allowed to split
   mid-block across a page boundary (respecting `minOrphanLines` on both
   sides). Everything else is kept whole.
3. **MORE/CONT'D synthesis** reserves budget for the split marker *inside*
   the split decision itself — a dialogue block is never split at a point
   that would leave no room for the `(MORE)`/`(CONT'D)` pair.
4. **`repaginate(prevPageMap, doc, profile, changedRange)`** is the
   incremental path: given a previous `PageMap` and a `ChangedRange`
   (`fromBlockIndex` — everything before it is guaranteed identical to what
   the previous PageMap was computed from), it recomputes only the pages
   that could possibly have changed, verified equivalent to a full
   `paginate()` call by property test (10,000 random single-edit trials
   against both shipped profiles). The core invariant it has to get right:
   a "kept" page from the previous PageMap is only trusted as immutable if
   it's *provably* at full `linesPerPage` capacity — a page that happened
   to end early (an act break, an explicit `page_break`, or simply because
   the old document ended there) is never assumed to have no room for new
   content.

**What's guaranteed**, backed by property tests in
`pagination/*.test.ts`: `paginate()` never throws and never drops a line of
content, for any structurally-valid document; `repaginate()` always
produces output identical to a full `paginate()` of the edited document;
pagination is fully deterministic (same input, same profile → byte-identical
output, always) — verified directly and relied on by the CI performance
budget (`pagination/determinism.test.ts`), which times a full `paginate()`
of a ~300-page document.

## Interchange: Fountain and FDX

`parseFountain`/`serializeFountain` and `parseFdx`/`serializeFdx` convert
between `ScreenplayDocument` and the two plain-text/XML interchange formats
real screenwriting tools use. Both directions are round-trip tested with
fast-check (thousands of generated documents) *and* against the hand-curated
golden corpus (`src/golden/`) — the golden corpus's README documents the
small set of permanent, documented format limitations (Fountain has no
shot/strikethrough/revision-color syntax, for instance) that are expected
lossy conversions, not bugs.

## Where to look next

- `src/golden/README.md` — the conformance corpus: what it proves, how to
  add an entry, and the documented Fountain/FDX limitations.
- `pagination/solver.ts` — the keep-together rules, in full, with the
  reasoning for each one in its own comment.
- `format-profile.ts` — every field of `FormatProfile`/`ElementStyle` and
  what it means physically.
- `packages/pdf-typesetter` — the one real consumer of `PageMap` outside
  this package's own tests, useful as a worked example of "how do I read a
  PageMap without making my own layout decisions."
