import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Block, BlockType, MarkKind, MarkRange, ScreenplayDocument } from "../model.js";
import { normalize } from "../normalize.js";
import { parseFountain } from "./parse.js";
import { serializeFountain } from "./serialize.js";

function newId(): string {
  return globalThis.crypto.randomUUID();
}

// Structural/emphasis-syntax characters excluded entirely from generated
// text so content can never collide with Fountain markup while parsing it
// back — real prose obviously *can* contain these, but that's a matter of
// the parser's natural-detection heuristics (covered by parse.test.ts),
// not this round-trip property, which is about screenplay-core's own
// forced-marker serialization being unambiguously reversible. "/" is
// excluded too: combined with the "**"/"*" this generator's marks insert,
// a "/" in the raw text can accidentally spell "/*" or "*/" — Fountain's
// boneyard delimiter — which is a genuine ambiguity in the format itself
// (it has no escape mechanism for boneyard/note delimiters), not a parser
// bug; a real editor would need to prevent authoring such a sequence
// in the first place, same as it would for the other excluded characters.
const FORBIDDEN_CHARS = /[<>()~@!.#=[\]*_\\^/\n\r]/g;

const safeText: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((s) => s.replace(FORBIDDEN_CHARS, " ").replace(/\s+/g, " ").trim())
  .filter((s) => s.length > 0 && /[A-Za-z0-9]/.test(s));

const STANDALONE_TYPES: BlockType[] = [
  "scene_heading",
  "action",
  "transition",
  "lyric",
  "centered",
  "section",
  "synopsis",
  "note",
  "page_break",
];

const FOUNTAIN_MARK_KINDS: MarkKind[] = ["bold", "italic", "underline"];

/** At most one mark per block — sidesteps partial-overlap representability limits (see emphasis.ts). */
function arbitraryMarksFor(text: string): fc.Arbitrary<MarkRange[]> {
  if (text.length === 0) return fc.constant([]);
  return fc.option(
    fc
      .tuple(fc.nat({ max: text.length - 1 }), fc.nat({ max: text.length - 1 }), fc.constantFrom(...FOUNTAIN_MARK_KINDS))
      .map(([a, b, kind]): MarkRange => ({ kind, start: Math.min(a, b), end: Math.max(a, b) + 1 })),
    { nil: undefined },
  ).map((m) => (m ? [m] : []));
}

function arbitraryStandaloneBlock(): fc.Arbitrary<Block[]> {
  return fc
    .tuple(fc.constantFrom(...STANDALONE_TYPES), safeText)
    .chain(([type, text]) =>
      arbitraryMarksFor(type === "page_break" ? "" : text).map((marks): Block[] => [
        {
          id: newId(),
          type,
          text: type === "page_break" ? "" : text,
          marks,
          attrs: {},
        },
      ]),
    );
}

/** [character, optional parenthetical, optional dialogue] — at most one dialogue block, so Fountain's positional (not id-based) dialogue grammar round-trips exactly. */
function arbitraryDialogueExchange(column?: "left" | "right"): fc.Arbitrary<Block[]> {
  return fc
    .tuple(safeText, fc.boolean(), safeText, fc.boolean(), safeText)
    .chain(([cueText, hasParen, parenText, hasDialogue, dialogueText]) =>
      fc
        .tuple(
          arbitraryMarksFor(cueText),
          arbitraryMarksFor(parenText),
          arbitraryMarksFor(dialogueText),
        )
        .map(([cueMarks, parenMarks, dialogueMarks]): Block[] => {
          const attrs = column ? { dualColumn: column } : {};
          const blocks: Block[] = [
            { id: newId(), type: "character", text: cueText, marks: cueMarks, attrs: { ...attrs } },
          ];
          if (hasParen) {
            blocks.push({
              id: newId(),
              type: "parenthetical",
              text: parenText,
              marks: parenMarks,
              attrs: { ...attrs },
            });
          }
          if (hasDialogue) {
            blocks.push({
              id: newId(),
              type: "dialogue",
              text: dialogueText,
              marks: dialogueMarks,
              attrs: { ...attrs },
            });
          }
          return blocks;
        }),
    );
}

function arbitraryDualDialogueGroup(): fc.Arbitrary<Block[]> {
  return fc
    .tuple(arbitraryDialogueExchange("left"), arbitraryDialogueExchange("right"))
    .map(([left, right]) => [
      { id: newId(), type: "dual_dialogue", text: "", marks: [], attrs: {} } satisfies Block,
      ...left,
      ...right,
    ]);
}

const arbitraryFountainDocument: fc.Arbitrary<ScreenplayDocument> = fc
  .array(
    fc.oneof(arbitraryStandaloneBlock(), arbitraryDialogueExchange(), arbitraryDualDialogueGroup()),
    { maxLength: 10 },
  )
  .map((groups) => ({ blocks: groups.flat() }));

/**
 * Fountain is a plain-text interchange format with no concept of persistent
 * block identity — re-parsing always mints fresh ids, the same way a real
 * export-then-reimport cycle would. "≡" in the accept criterion means
 * structurally equivalent (type/text/marks/attrs, in order), not
 * id-for-id identical; this strips ids from both sides before comparing.
 */
function withoutIds(doc: ScreenplayDocument): unknown {
  return doc.blocks.map(({ id: _id, ...rest }) => rest);
}

describe("Fountain round-trip: parse(serialize(doc)) === normalize(doc)", () => {
  it("holds for a constrained generator of Fountain-representable documents", () => {
    fc.assert(
      fc.property(arbitraryFountainDocument, (doc) => {
        const serialized = serializeFountain(doc);
        const reparsed = parseFountain(serialized);
        expect(withoutIds(reparsed)).toEqual(withoutIds(normalize(doc)));
      }),
      { numRuns: 5000 },
    );
  });

  it("never throws for arbitrary (non-empty) source text", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (source) => {
        expect(() => parseFountain(source)).not.toThrow();
      }),
      { numRuns: 2000 },
    );
  });
});
