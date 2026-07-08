/** 12pt Courier Prime pitch: 10 fixed-width characters per inch. */
export const CHARS_PER_INCH = 10;

/** Standard screenplay line spacing: 6 single-spaced lines per inch. */
export const LINES_PER_INCH = 6;

export function maxCharsForWidth(widthInches: number): number {
  return Math.max(1, Math.floor(widthInches * CHARS_PER_INCH));
}

/**
 * Greedy word-wrap of a single hard line to `maxChars` columns. A word
 * longer than maxChars is hard-broken rather than overflowing or being
 * dropped — pagination must never silently lose text.
 */
function wrapLine(line: string, maxChars: number): string[] {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      wrapped.push(current);
      current = "";
    }

    if (word.length <= maxChars) {
      current = word;
      continue;
    }

    let remaining = word;
    while (remaining.length > maxChars) {
      wrapped.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }
    current = remaining;
  }

  if (current) wrapped.push(current);
  return wrapped.length > 0 ? wrapped : [""];
}

/**
 * Wraps a block's text to `widthInches` at 12pt-Courier pitch. Author hard
 * breaks ("\n", meaningful for lyrics/centered text) are preserved as
 * separate lines before word-wrapping is applied to each; runs of
 * whitespace within a line are normalized to single spaces, matching how
 * any typesetter reflows prose (the block's own `text` field is untouched —
 * this is purely a layout computation).
 */
export function wrapText(text: string, widthInches: number): string[] {
  const maxChars = maxCharsForWidth(widthInches);
  return text.split("\n").flatMap((line) => wrapLine(line, maxChars));
}

export function lineCount(text: string, widthInches: number): number {
  return wrapText(text, widthInches).length;
}
