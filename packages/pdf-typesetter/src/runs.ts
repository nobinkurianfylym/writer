import type { MarkKind, MarkRange } from "@fylym/screenplay-core";

export interface TextRun {
  text: string;
  kinds: ReadonlySet<MarkKind>;
  revisionColor?: string;
}

function sameKinds(a: MarkKind[], b: MarkKind[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/**
 * Splits `text` into maximal spans of identical active marks — the
 * interval-overlay a renderer needs to pick a font/color per span, since
 * PDF drawing is span-based rather than the bracket-insertion Fountain uses.
 * Mirrors screenplay-core's fdx/styles.ts encodeTextRuns (same algorithm,
 * different output shape: a MarkKind set per run instead of a joined FDX
 * Style string), duplicated rather than imported since that function is an
 * internal of the FDX module, not part of screenplay-core's public API.
 */
export function splitIntoRuns(text: string, marks: MarkRange[]): TextRun[] {
  if (text.length === 0) return [{ text: "", kinds: new Set() }];

  const boundaries = [...new Set([0, text.length, ...marks.flatMap((m) => [m.start, m.end])])]
    .filter((b) => b >= 0 && b <= text.length)
    .sort((a, b) => a - b);

  interface Segment {
    start: number;
    end: number;
    kinds: MarkKind[];
    revisionColor?: string;
  }
  const segments: Segment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    if (start >= end) continue;
    const active = marks.filter((m) => m.start <= start && m.end >= end);
    const kinds = active.map((m) => m.kind).sort();
    const revisionMark = active.find((m) => m.kind === "revision");
    segments.push({ start, end, kinds, revisionColor: revisionMark?.revisionColor });
  }

  const merged: Segment[] = [];
  for (const seg of segments) {
    const last = merged.at(-1);
    if (last && last.end === seg.start && sameKinds(last.kinds, seg.kinds) && last.revisionColor === seg.revisionColor) {
      last.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged.map((seg) => ({
    text: text.slice(seg.start, seg.end),
    kinds: new Set(seg.kinds),
    revisionColor: seg.revisionColor,
  }));
}
