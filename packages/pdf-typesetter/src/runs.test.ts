import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MARK_KINDS, type MarkKind, type MarkRange } from "@fylym/screenplay-core";
import { splitIntoRuns } from "./runs.js";

describe("splitIntoRuns", () => {
  it("returns a single plain run for text with no marks", () => {
    expect(splitIntoRuns("hello world", [])).toEqual([{ text: "hello world", kinds: new Set() }]);
  });

  it("returns a single empty run for empty text, ignoring any marks", () => {
    expect(splitIntoRuns("", [{ kind: "bold", start: 0, end: 5 }])).toEqual([{ text: "", kinds: new Set() }]);
  });

  it("splits at a single mark's boundaries", () => {
    const marks: MarkRange[] = [{ kind: "bold", start: 6, end: 11 }];
    expect(splitIntoRuns("hello world", marks)).toEqual([
      { text: "hello ", kinds: new Set() },
      { text: "world", kinds: new Set(["bold"]) },
    ]);
  });

  it("merges two overlapping marks of different kinds into one run with both kinds active", () => {
    const marks: MarkRange[] = [
      { kind: "bold", start: 0, end: 11 },
      { kind: "italic", start: 6, end: 11 },
    ];
    const runs = splitIntoRuns("hello world", marks);
    expect(runs).toEqual([
      { text: "hello ", kinds: new Set(["bold"]) },
      { text: "world", kinds: new Set(["bold", "italic"]) },
    ]);
  });

  it("carries revisionColor only on the run where the revision mark is active", () => {
    const marks: MarkRange[] = [{ kind: "revision", start: 0, end: 5, revisionColor: "Blue" }];
    const runs = splitIntoRuns("hello world", marks);
    expect(runs[0]).toEqual({ text: "hello", kinds: new Set(["revision"]), revisionColor: "Blue" });
    expect(runs[1]?.revisionColor).toBeUndefined();
  });

  describe("property: reassembly and coverage", () => {
    it("concatenated run text always reconstructs the original text, in order", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 60 }),
          fc.array(
            fc.tuple(fc.nat({ max: 59 }), fc.nat({ max: 59 }), fc.constantFrom(...MARK_KINDS)),
            { maxLength: 5 },
          ),
          (text, rawMarks) => {
            const marks: MarkRange[] = rawMarks
              .map(([a, b, kind]): MarkRange => ({ kind, start: Math.min(a, b), end: Math.max(a, b) + 1 }))
              .filter((m) => m.end <= text.length);

            const runs = splitIntoRuns(text, marks);
            expect(runs.map((r) => r.text).join("")).toBe(text);
          },
        ),
        { numRuns: 2000 },
      );
    });

    it("every mark kind active at a character position appears in that character's run", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 60 }),
          fc.array(
            fc.tuple(fc.nat({ max: 59 }), fc.nat({ max: 59 }), fc.constantFrom(...MARK_KINDS)),
            { maxLength: 5 },
          ),
          (text, rawMarks) => {
            const maxIdx = text.length - 1;
            const marks: MarkRange[] = rawMarks
              .map(([a, b, kind]): MarkRange => ({
                kind,
                start: Math.min(Math.min(a, b), maxIdx),
                end: Math.min(Math.max(a, b) + 1, text.length),
              }))
              .filter((m) => m.start < m.end);

            const runs = splitIntoRuns(text, marks);

            // Walk character-by-character; find which run covers position i,
            // and check its kinds match exactly the marks active at i.
            let pos = 0;
            for (const run of runs) {
              const runStart = pos;
              const runEnd = pos + run.text.length;
              for (let i = runStart; i < runEnd; i++) {
                const activeKinds = new Set<MarkKind>(marks.filter((m) => m.start <= i && i < m.end).map((m) => m.kind));
                expect(run.kinds).toEqual(activeKinds);
              }
              pos = runEnd;
            }
          },
        ),
        { numRuns: 2000 },
      );
    });
  });
});
