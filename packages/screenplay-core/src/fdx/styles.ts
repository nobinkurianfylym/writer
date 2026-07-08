import type { MarkKind, MarkRange } from "../model.js";

const STYLE_TOKENS: Record<MarkKind, string> = {
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strike: "Strikethrough",
  revision: "Revision",
};

const STYLE_TOKEN_TO_KIND = new Map<string, MarkKind>(
  Object.entries(STYLE_TOKENS).map(([kind, token]) => [token, kind as MarkKind]),
);

export interface FdxTextRun {
  text: string;
  /** e.g. "Bold+Italic"; undefined for a plain run. */
  style?: string;
  revisionColor?: string;
}

function sameKinds(a: MarkKind[], b: MarkKind[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/**
 * Splits `text` into FDX `<Text>` runs, one per maximal span with an
 * identical set of active marks — the inverse of MarkRange's
 * interval-per-kind model. Unlike Fountain's markup characters, FDX styles
 * are structural (a `Style` attribute per run), so this is a classic
 * interval-overlay rather than a bracket-insertion problem.
 */
export function encodeTextRuns(text: string, marks: MarkRange[]): FdxTextRun[] {
  if (text.length === 0) return [{ text: "" }];

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
    style: seg.kinds.length > 0 ? seg.kinds.map((k) => STYLE_TOKENS[k]).join("+") : undefined,
    revisionColor: seg.revisionColor,
  }));
}

/** The inverse of encodeTextRuns: concatenates runs into text, reconstructing each style's MarkRange. */
export function decodeTextRuns(runs: FdxTextRun[]): { text: string; marks: MarkRange[] } {
  let text = "";
  const marks: MarkRange[] = [];
  const open = new Map<MarkKind, { start: number; revisionColor?: string }>();

  for (const run of runs) {
    const runStart = text.length;
    text += run.text;

    const activeKinds = new Set<MarkKind>(
      (run.style ?? "")
        .split("+")
        .map((token) => STYLE_TOKEN_TO_KIND.get(token.trim()))
        .filter((k): k is MarkKind => k !== undefined),
    );

    for (const [kind, info] of [...open.entries()]) {
      if (!activeKinds.has(kind)) {
        marks.push({
          kind,
          start: info.start,
          end: runStart,
          ...(info.revisionColor !== undefined ? { revisionColor: info.revisionColor } : {}),
        });
        open.delete(kind);
      }
    }
    for (const kind of activeKinds) {
      if (!open.has(kind)) {
        open.set(kind, { start: runStart, revisionColor: kind === "revision" ? run.revisionColor : undefined });
      }
    }
  }

  for (const [kind, info] of open) {
    marks.push({
      kind,
      start: info.start,
      end: text.length,
      ...(info.revisionColor !== undefined ? { revisionColor: info.revisionColor } : {}),
    });
  }

  return { text, marks };
}
