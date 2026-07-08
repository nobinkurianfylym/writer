import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Block, MarkRange, ScreenplayDocument } from "../model.js";
import { normalize } from "../normalize.js";
import { isValid } from "../validate.js";
import { serializeFountain } from "../fountain/serialize.js";
import { parseFountain } from "../fountain/parse.js";
import { serializeFdx } from "../fdx/serialize.js";
import { parseFdx } from "../fdx/parse.js";
import { STRUCTURAL_MARKER_TYPES } from "../pagination/layout.js";
import { paginate } from "../pagination/solver.js";
import { CORPUS } from "./corpus.js";
import { summarizePageMap } from "./page-break-summary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

function readFixture(name: string, file: string): string {
  return readFileSync(join(FIXTURES_DIR, name, file), "utf8");
}

function sortedMarks(marks: MarkRange[]): MarkRange[] {
  return [...marks].sort((a, b) => a.kind.localeCompare(b.kind) || a.start - b.start || a.end - b.end);
}

/**
 * Structural comparison ignoring ids (a round-trip through a text format
 * never preserves them — see the Fountain/FDX round-trip tests' own
 * withoutIds helpers) and ignoring mark order within a block (both Fountain
 * and FDX represent a block's marks as an unordered set of active ranges
 * per span, not an ordered list — see fdx/round-trip.test.ts).
 */
function withoutIds(doc: ScreenplayDocument): unknown {
  return doc.blocks.map(({ id: _id, marks, ...rest }: Block) => ({ ...rest, marks: sortedMarks(marks) }));
}

/**
 * Applies the SAME normalization for every entry with
 * `knownFountainLimitation.mode === "insensitive"` — collapses shot→action
 * (Fountain has no shot syntax), drops revision and strike marks (Fountain
 * has no revision-color or strikethrough syntax — see emphasis.ts), and
 * collapses whitespace-only text to "" (Fountain trims it). Applied to both
 * sides of the comparison so it only masks the documented gap, not a real
 * regression elsewhere in the same entry.
 */
function applyKnownFountainLimitation(doc: ScreenplayDocument): ScreenplayDocument {
  return {
    blocks: doc.blocks.map((b) => ({
      ...b,
      type: b.type === "shot" ? "action" : b.type,
      text: b.text.trim() === "" ? "" : b.text,
      marks: b.marks.filter((m) => m.kind !== "revision" && m.kind !== "strike"),
    })),
  };
}

/**
 * Applies the normalization for every entry with
 * `knownFdxLimitation.mode === "insensitive"` — strips a title_page block's
 * `fdxTitlePageParagraphs` passthrough. That passthrough is *always*
 * captured on first FDX parse (even for paragraphs that are exactly what
 * our own from-scratch synthesis would produce) so a later parse-then-
 * serialize round trip stays byte-exact — see fdx/parse.ts's parseTitlePage.
 * A document authored fresh (not re-imported) therefore gains this
 * passthrough the first time it's round-tripped through FDX; that's
 * expected, not a regression signal.
 */
function applyKnownFdxLimitation(doc: ScreenplayDocument): ScreenplayDocument {
  return {
    blocks: doc.blocks.map((b) => {
      if (b.type !== "title_page" || b.attrs.passthrough === undefined) return b;
      const { fdxTitlePageParagraphs: _dropped, ...restPassthrough } = b.attrs.passthrough;
      const passthrough = Object.keys(restPassthrough).length > 0 ? restPassthrough : undefined;
      return { ...b, attrs: { ...b.attrs, passthrough } };
    }),
  };
}

describe("golden corpus conformance harness", () => {
  it("has at least 25 entries covering the required stress categories", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(25);
    const names = new Set(CORPUS.map((e) => e.name));
    for (const required of [
      "dual-dialogue-heavy",
      "musical-lyrics",
      "five-page-single-scene",
      "two-hundred-scene-feature",
      "every-element-adjacency-pair",
    ]) {
      expect(names.has(required)).toBe(true);
    }
  });

  it("has no duplicate entry names", () => {
    const names = CORPUS.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const entry of CORPUS) {
    describe(`entry: ${entry.name}`, () => {
      const canonical = normalize(entry.build());

      it("matches the committed canonical document.json", () => {
        const expected = JSON.parse(readFixture(entry.name, "document.json")) as ScreenplayDocument;
        expect(canonical).toEqual(expected);
      });

      it("is structurally valid", () => {
        expect(isValid(canonical)).toBe(true);
      });

      it("normalize() is idempotent on the canonical document", () => {
        expect(normalize(canonical)).toEqual(canonical);
      });

      it("serializeFountain matches the committed expected.fountain", () => {
        expect(serializeFountain(canonical)).toBe(readFixture(entry.name, "expected.fountain"));
      });

      const limitation = entry.knownFountainLimitation;

      if (limitation?.mode === "skip") {
        it(`parseFountain(expected.fountain) never throws (exact round-trip skipped: ${limitation.reason})`, () => {
          const fountain = readFixture(entry.name, "expected.fountain");
          expect(() => parseFountain(fountain)).not.toThrow();
          expect(parseFountain(fountain).blocks.length).toBeGreaterThan(0);
        });
      } else {
        it("parseFountain(expected.fountain) round-trips back to the canonical document (mod ids)", () => {
          const reparsed = normalize(parseFountain(readFixture(entry.name, "expected.fountain")));
          const expected = limitation ? applyKnownFountainLimitation(canonical) : canonical;
          const actual = limitation ? applyKnownFountainLimitation(reparsed) : reparsed;
          expect(withoutIds(actual)).toEqual(withoutIds(expected));
        });
      }

      it("serializeFdx matches the committed expected.fdx", () => {
        expect(serializeFdx(canonical)).toBe(readFixture(entry.name, "expected.fdx"));
      });

      it("parseFdx(expected.fdx) round-trips back to the canonical document (mod ids)", () => {
        const reparsed = parseFdx(readFixture(entry.name, "expected.fdx"));
        const fdxLimitation = entry.knownFdxLimitation;
        const expected = fdxLimitation ? applyKnownFdxLimitation(canonical) : canonical;
        const actual = fdxLimitation ? applyKnownFdxLimitation(reparsed) : reparsed;
        expect(withoutIds(actual)).toEqual(withoutIds(expected));
      });

      it("paginate() matches the committed expected.pagebreaks.json", () => {
        const pageMap = paginate(canonical, entry.profile);
        const expected = JSON.parse(readFixture(entry.name, "expected.pagebreaks.json")) as unknown;
        expect(summarizePageMap(pageMap)).toEqual(expected);
      });

      it("paginate() never throws and conserves every non-blank body block's content", () => {
        const pageMap = paginate(canonical, entry.profile);
        const seenBlockIds = new Set(pageMap.pages.flatMap((p) => p.lines.map((l) => l.blockId)));
        for (const block of canonical.blocks) {
          // Structural markers (dual_dialogue, page_break, title_page) never
          // contribute body-page lines by design — see layout.ts.
          if (block.text.length > 0 && !STRUCTURAL_MARKER_TYPES.has(block.type)) {
            expect(seenBlockIds.has(block.id)).toBe(true);
          }
        }
      });
    });
  }
});
