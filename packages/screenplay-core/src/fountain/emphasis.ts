import type { MarkKind, MarkRange } from "../model.js";

/**
 * Fountain's emphasis syntax: *italic*, **bold**, ***bold italic***,
 * _underline_. There's no standard syntax for strikethrough or revision
 * marks — those are silently dropped on serialization (they simply never
 * arise from parsing, since nothing produces them).
 */
const KIND_SYNTAX: Partial<Record<MarkKind, string>> = {
  bold: "**",
  italic: "*",
  underline: "_",
};

/** Canonical nesting order for opening tags when several start at the same position (closes use the reverse). */
const KIND_ORDER: MarkKind[] = ["bold", "italic", "underline"];

/**
 * Inserts Fountain emphasis syntax into `text` at each mark's boundaries.
 * Assumes marks are, across kinds, either disjoint, identical, or properly
 * nested — Fountain's markup (like Markdown's) has no way to represent
 * arbitrary partial overlap between different emphasis kinds.
 */
export function encodeEmphasis(text: string, marks: MarkRange[]): string {
  const supported = marks.filter((m) => KIND_SYNTAX[m.kind]);
  const opens = new Map<number, MarkRange[]>();
  const closes = new Map<number, MarkRange[]>();
  for (const m of supported) {
    (opens.get(m.start) ?? opens.set(m.start, []).get(m.start)!).push(m);
    (closes.get(m.end) ?? closes.set(m.end, []).get(m.end)!).push(m);
  }

  let result = "";
  for (let i = 0; i <= text.length; i++) {
    const closing = [...(closes.get(i) ?? [])].sort(
      (a, b) => KIND_ORDER.indexOf(b.kind) - KIND_ORDER.indexOf(a.kind),
    );
    for (const m of closing) result += KIND_SYNTAX[m.kind];

    const opening = [...(opens.get(i) ?? [])].sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
    );
    for (const m of opening) result += KIND_SYNTAX[m.kind];

    if (i < text.length) result += text[i];
  }
  return result;
}

interface StackEntry {
  kinds: MarkKind[];
  cleanStart: number;
}

function sameKinds(a: MarkKind[], b: MarkKind[]): boolean {
  return a.length === b.length && a.every((k) => b.includes(k));
}

/**
 * Strips Fountain emphasis syntax from `raw`, returning the clean text and
 * the MarkRanges it implied. A toggle/stack scanner: the first occurrence of
 * a token opens it, a later matching occurrence (same kind-set, since
 * `***` toggles bold+italic together) closes it — which correctly handles
 * proper nesting of different kinds and identical-range combinations.
 * `\` escapes the next character (a literal marker, no emphasis).
 */
export function decodeEmphasis(raw: string): { text: string; marks: MarkRange[] } {
  const marks: MarkRange[] = [];
  const stack: StackEntry[] = [];
  let clean = "";
  let i = 0;

  while (i < raw.length) {
    if (raw[i] === "\\" && i + 1 < raw.length) {
      clean += raw[i + 1];
      i += 2;
      continue;
    }

    if (raw.startsWith("***", i)) {
      const top = stack.at(-1);
      if (top && sameKinds(top.kinds, ["bold", "italic"])) {
        marks.push({ kind: "bold", start: top.cleanStart, end: clean.length });
        marks.push({ kind: "italic", start: top.cleanStart, end: clean.length });
        stack.pop();
      } else {
        stack.push({ kinds: ["bold", "italic"], cleanStart: clean.length });
      }
      i += 3;
      continue;
    }

    if (raw.startsWith("**", i)) {
      const top = stack.at(-1);
      if (top && sameKinds(top.kinds, ["bold"])) {
        marks.push({ kind: "bold", start: top.cleanStart, end: clean.length });
        stack.pop();
      } else {
        stack.push({ kinds: ["bold"], cleanStart: clean.length });
      }
      i += 2;
      continue;
    }

    if (raw[i] === "*") {
      const top = stack.at(-1);
      if (top && sameKinds(top.kinds, ["italic"])) {
        marks.push({ kind: "italic", start: top.cleanStart, end: clean.length });
        stack.pop();
      } else {
        stack.push({ kinds: ["italic"], cleanStart: clean.length });
      }
      i += 1;
      continue;
    }

    if (raw[i] === "_") {
      const top = stack.at(-1);
      if (top && sameKinds(top.kinds, ["underline"])) {
        marks.push({ kind: "underline", start: top.cleanStart, end: clean.length });
        stack.pop();
      } else {
        stack.push({ kinds: ["underline"], cleanStart: clean.length });
      }
      i += 1;
      continue;
    }

    clean += raw[i];
    i += 1;
  }

  // Any markers left unclosed (e.g. a lone "*" in "3 * 4 = 12") were never
  // valid emphasis. Their syntax characters were withheld from `clean`
  // while we hoped for a match — flush them back in as literal text, innermost
  // (highest cleanStart) first so each splice's position math stays simple,
  // and shift any already-recorded marks that fall at or after it.
  for (let s = stack.length - 1; s >= 0; s--) {
    const entry = stack[s]!;
    const syntax =
      entry.kinds.length === 2 ? "***" : entry.kinds[0] === "bold" ? "**" : entry.kinds[0] === "italic" ? "*" : "_";
    clean = clean.slice(0, entry.cleanStart) + syntax + clean.slice(entry.cleanStart);
    for (const m of marks) {
      if (m.start >= entry.cleanStart) m.start += syntax.length;
      if (m.end >= entry.cleanStart) m.end += syntax.length;
    }
  }

  marks.sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind));
  return { text: clean, marks };
}
