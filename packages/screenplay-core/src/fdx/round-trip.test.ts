import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MARK_KINDS, type Block, type BlockAttrs, type BlockType, type MarkRange, type ScreenplayDocument } from "../model.js";
import { parseFdx } from "./parse.js";
import { serializeFdx } from "./serialize.js";

function newId(): string {
  return globalThis.crypto.randomUUID();
}

const FORBIDDEN_CHARS = /[\n\r]/g;

const safeText: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((s) => s.replace(FORBIDDEN_CHARS, " ").replace(/\s+/g, " ").trim())
  .filter((s) => s.length > 0 && /[A-Za-z0-9]/.test(s));

const STANDALONE_TYPES: BlockType[] = [
  "scene_heading",
  "action",
  "transition",
  "shot",
  "lyric",
  "centered",
  "section",
  "synopsis",
  "note",
  "page_break",
];

/** Multiple mark kinds may legitimately overlap on one block (FDX styles combine, e.g. "Bold+Italic") — unlike Fountain, there's no bracket-nesting limit, just at most one range per kind. */
function arbitraryMarksFor(text: string): fc.Arbitrary<MarkRange[]> {
  if (text.length === 0) return fc.constant([]);
  const maxIdx = text.length - 1;
  return fc
    .tuple(
      ...MARK_KINDS.map((kind) =>
        fc.option(
          fc
            .tuple(fc.nat({ max: maxIdx }), fc.nat({ max: maxIdx }), fc.constantFrom("Red", "Blue", "Green"))
            .map(([a, b, color]): MarkRange => ({
              kind,
              start: Math.min(a, b),
              end: Math.max(a, b) + 1,
              ...(kind === "revision" ? { revisionColor: color } : {}),
            })),
          { nil: undefined },
        ),
      ),
    )
    .map((maybeMarks) => maybeMarks.filter((m): m is MarkRange => m !== undefined));
}

const arbitraryStandaloneAttrs: fc.Arbitrary<BlockAttrs> = fc
  .record({
    sceneNumber: fc.option(fc.constantFrom("1", "2", "3A", "10"), { nil: undefined }),
    revision: fc.option(fc.constantFrom("1", "2", "3"), { nil: undefined }),
    locked: fc.option(fc.constant(true), { nil: undefined }),
  })
  .map((r) => {
    const attrs: BlockAttrs = {};
    if (r.sceneNumber !== undefined) attrs.sceneNumber = r.sceneNumber;
    if (r.revision !== undefined) attrs.revision = r.revision;
    if (r.locked !== undefined) attrs.locked = true;
    return attrs;
  });

function arbitraryStandaloneBlock(): fc.Arbitrary<Block[]> {
  return fc
    .tuple(fc.constantFrom(...STANDALONE_TYPES), safeText, arbitraryStandaloneAttrs)
    .chain(([type, text, attrs]) =>
      arbitraryMarksFor(type === "page_break" ? "" : text).map((marks): Block[] => [
        {
          id: newId(),
          type,
          text: type === "page_break" ? "" : text,
          marks,
          attrs,
        },
      ]),
    );
}

/** [character, optional parenthetical, optional dialogue] — at most one dialogue block per cue, mirroring the Fountain round-trip generator's exchange shape. */
function arbitraryDialogueExchange(column?: "left" | "right"): fc.Arbitrary<Block[]> {
  return fc
    .tuple(safeText, fc.boolean(), safeText, fc.boolean(), safeText)
    .chain(([cueText, hasParen, parenText, hasDialogue, dialogueText]) =>
      fc
        .tuple(arbitraryMarksFor(cueText), arbitraryMarksFor(parenText), arbitraryMarksFor(dialogueText))
        .map(([cueMarks, parenMarks, dialogueMarks]): Block[] => {
          const attrs: BlockAttrs = column ? { dualColumn: column } : {};
          const blocks: Block[] = [{ id: newId(), type: "character", text: cueText, marks: cueMarks, attrs: { ...attrs } }];
          if (hasParen) {
            blocks.push({ id: newId(), type: "parenthetical", text: parenText, marks: parenMarks, attrs: { ...attrs } });
          }
          if (hasDialogue) {
            blocks.push({ id: newId(), type: "dialogue", text: dialogueText, marks: dialogueMarks, attrs: { ...attrs } });
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

const arbitraryFdxDocument: fc.Arbitrary<ScreenplayDocument> = fc
  .array(fc.oneof(arbitraryStandaloneBlock(), arbitraryDialogueExchange(), arbitraryDualDialogueGroup()), {
    maxLength: 10,
  })
  .map((groups) => ({ blocks: groups.flat() }));

function sortedMarks(marks: MarkRange[]): MarkRange[] {
  return [...marks].sort((a, b) => a.kind.localeCompare(b.kind) || a.start - b.start || a.end - b.end);
}

/**
 * FDX has no persistent block identity across a save/reload cycle either —
 * only structural fields are compared. Marks are also compared as an
 * unordered set: FDX represents active marks per text run via a combined
 * Style string (e.g. "Revision+Strikethrough"), which has no concept of
 * "which mark was declared first" the way our MarkRange[] array order
 * implies, so that order isn't preserved through a round trip.
 */
function withoutIds(doc: ScreenplayDocument): unknown {
  return doc.blocks.map(({ id: _id, marks, ...rest }) => ({ ...rest, marks: sortedMarks(marks) }));
}

describe("FDX round-trip: parseFdx(serializeFdx(doc)) ≡ doc", () => {
  it("holds for a constrained generator of FDX-representable documents", () => {
    fc.assert(
      fc.property(arbitraryFdxDocument, (doc) => {
        const xml = serializeFdx(doc);
        const reparsed = parseFdx(xml);
        expect(withoutIds(reparsed)).toEqual(withoutIds(doc));
      }),
      { numRuns: 2000 },
    );
  });

  it("never throws for arbitrary (possibly malformed) XML text", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (source) => {
        expect(() => parseFdx(source)).not.toThrow();
      }),
      { numRuns: 2000 },
    );
  });
});

describe("FDX defensive parsing", () => {
  it("tolerates a missing Content element", () => {
    const doc = parseFdx('<?xml version="1.0"?><FinalDraft Version="1"></FinalDraft>');
    expect(doc.blocks).toEqual([]);
  });

  it("tolerates an unrecognized Paragraph Type", () => {
    const doc = parseFdx(
      '<?xml version="1.0"?><FinalDraft><Content><Paragraph Type="SomeFutureType"><Text>Hi</Text></Paragraph></Content></FinalDraft>',
    );
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]?.type).toBe("action");
    expect(doc.blocks[0]?.text).toBe("Hi");
  });

  it("preserves an unrecognized attribute and namespace-prefixed element via passthrough", () => {
    const doc = parseFdx(
      '<?xml version="1.0"?><FinalDraft SomeVendor:Extra="x"><Content><Paragraph Type="Action" acme:Custom="1"><Text>Hi</Text></Paragraph></Content></FinalDraft>',
    );
    expect(doc.blocks[0]?.attrs.passthrough?.fdxParagraph).toMatchObject({ "@_acme:Custom": "1" });
    expect(doc.passthrough?.fdxRootAttrs).toMatchObject({ "@_SomeVendor:Extra": "x" });

    const roundTripped = parseFdx(serializeFdx(doc));
    expect(roundTripped.blocks[0]?.attrs.passthrough?.fdxParagraph).toMatchObject({ "@_acme:Custom": "1" });
    expect(roundTripped.passthrough?.fdxRootAttrs).toMatchObject({ "@_SomeVendor:Extra": "x" });
  });

  it("tolerates a paragraph with no Text child", () => {
    const doc = parseFdx('<?xml version="1.0"?><FinalDraft><Content><Paragraph Type="Action"/></Content></FinalDraft>');
    expect(doc.blocks[0]?.text).toBe("");
  });

  it("round-trips a title page through passthrough", () => {
    const source =
      '<?xml version="1.0"?><FinalDraft><Content><Paragraph Type="Action"><Text>Body</Text></Paragraph></Content>' +
      '<TitlePage><Content><Paragraph Type="Text" Alignment="Center"><Text>MY SCRIPT</Text></Paragraph></Content></TitlePage></FinalDraft>';
    const doc = parseFdx(source);
    expect(doc.blocks[0]?.type).toBe("title_page");
    expect(doc.blocks[0]?.text).toBe("MY SCRIPT");

    const reparsed = parseFdx(serializeFdx(doc));
    expect(reparsed.blocks[0]?.type).toBe("title_page");
    expect(reparsed.blocks[0]?.text).toBe("MY SCRIPT");
  });

  it("round-trips real-shaped dual dialogue XML without the FylymDualColumn tiebreaker", () => {
    const source =
      "<?xml version=\"1.0\"?><FinalDraft><Content><Paragraph><DualDialogue>" +
      '<Paragraph Type="Character"><Text>BOB</Text></Paragraph>' +
      '<Paragraph Type="Dialogue"><Text>Hi</Text></Paragraph>' +
      '<Paragraph Type="Character"><Text>ALICE</Text></Paragraph>' +
      '<Paragraph Type="Dialogue"><Text>Hey</Text></Paragraph>' +
      "</DualDialogue></Paragraph></Content></FinalDraft>";
    const doc = parseFdx(source);
    expect(doc.blocks.map((b) => [b.type, b.attrs.dualColumn, b.text])).toEqual([
      ["dual_dialogue", undefined, ""],
      ["character", "left", "BOB"],
      ["dialogue", "left", "Hi"],
      ["character", "right", "ALICE"],
      ["dialogue", "right", "Hey"],
    ]);
  });
});
