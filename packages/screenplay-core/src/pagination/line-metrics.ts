/** 12pt Courier Prime pitch: 10 fixed-width characters per inch. */
export const CHARS_PER_INCH = 10;

/** Standard screenplay line spacing: 6 single-spaced lines per inch. */
export const LINES_PER_INCH = 6;

export function maxCharsForWidth(widthInches: number): number {
  return Math.max(1, Math.floor(widthInches * CHARS_PER_INCH));
}

/** A wrapped output line plus the [start, end) it was drawn from in the original input text — the offset PDF typesetting (E1-8) needs to slice a block's MarkRanges onto the right wrapped line. */
export interface WrappedLine {
  text: string;
  start: number;
  end: number;
}

/**
 * Greedy word-wrap of a single hard line to `maxChars` columns, tracking
 * each output line's source offset range. A word longer than maxChars is
 * hard-broken rather than overflowing or being dropped — pagination must
 * never silently lose text. `lineOffset` is this hard line's own start
 * offset within the full original text (for offset translation across a
 * multi-line `\n`-split input).
 */
function wrapLineWithOffsets(line: string, lineOffset: number, maxChars: number): WrappedLine[] {
  const words: { word: string; start: number; end: number }[] = [];
  const wordRe = /\S+/g;
  for (const m of line.matchAll(wordRe)) {
    words.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  if (words.length === 0) return [{ text: "", start: lineOffset, end: lineOffset }];

  const wrapped: WrappedLine[] = [];
  let current = "";
  let currentStart = 0;
  let currentEnd = 0;

  const flush = () => {
    if (current) wrapped.push({ text: current, start: lineOffset + currentStart, end: lineOffset + currentEnd });
  };

  for (const w of words) {
    const candidate = current ? `${current} ${w.word}` : w.word;
    if (candidate.length <= maxChars) {
      if (!current) currentStart = w.start;
      current = candidate;
      currentEnd = w.end;
      continue;
    }

    flush();
    current = "";

    if (w.word.length <= maxChars) {
      current = w.word;
      currentStart = w.start;
      currentEnd = w.end;
      continue;
    }

    let remaining = w.word;
    let remainingStart = w.start;
    while (remaining.length > maxChars) {
      wrapped.push({
        text: remaining.slice(0, maxChars),
        start: lineOffset + remainingStart,
        end: lineOffset + remainingStart + maxChars,
      });
      remaining = remaining.slice(maxChars);
      remainingStart += maxChars;
    }
    current = remaining;
    currentStart = remainingStart;
    currentEnd = w.end;
  }

  flush();
  return wrapped.length > 0 ? wrapped : [{ text: "", start: lineOffset, end: lineOffset }];
}

/**
 * Wraps a block's text to `widthInches` at 12pt-Courier pitch, with each
 * output line's source offset range in the original text. Author hard
 * breaks ("\n", meaningful for lyrics/centered text) are preserved as
 * separate lines before word-wrapping is applied to each; runs of
 * whitespace within a line are normalized to single spaces, matching how
 * any typesetter reflows prose (the block's own `text` field is untouched —
 * this is purely a layout computation). `wrapText`/`lineCount` are thin
 * text-only projections of this — there is exactly one wrapping decision,
 * never two implementations that must be kept in sync.
 */
export function wrapTextWithOffsets(text: string, widthInches: number): WrappedLine[] {
  const maxChars = maxCharsForWidth(widthInches);
  const result: WrappedLine[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    result.push(...wrapLineWithOffsets(line, offset, maxChars));
    offset += line.length + 1;
  }
  return result;
}

export function wrapText(text: string, widthInches: number): string[] {
  return wrapTextWithOffsets(text, widthInches).map((l) => l.text);
}

export function lineCount(text: string, widthInches: number): number {
  return wrapTextWithOffsets(text, widthInches).length;
}
