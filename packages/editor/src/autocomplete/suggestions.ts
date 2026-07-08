import { tokenizeSceneHeading, type Block } from "@fylym/screenplay-core";

/** Common character-cue extensions (§4) — a fixed list, not derived from the document. */
const EXTENSIONS = ["V.O.", "O.S.", "O.C.", "CONT'D"];

function matchesPrefix(candidate: string, prefix: string): boolean {
  return candidate.toUpperCase().startsWith(prefix.trim().toUpperCase());
}

/**
 * Distinct character names used in `blocks[0..beforeIndex)`, ranked for
 * "who's likely speaking next." Plain last-appearance recency would put
 * whoever *just* spoke at rank 1 — rarely useful when starting a *new*
 * cue, since dialogue overwhelmingly alternates. Instead, the most recent
 * speaker is rotated to the *end* of the list and the next-most-recent
 * (i.e. whoever spoke before that) leads — which is exactly "the other
 * person" in the common two-character back-and-forth case (E2-3's
 * required one-keystroke scenario), and degrades sensibly for 3+
 * characters. Filtered by `prefix` if given.
 */
export function characterNameSuggestions(blocks: readonly Block[], beforeIndex: number, prefix = ""): string[] {
  const seen = new Set<string>();
  const byRecency: string[] = [];
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block?.type !== "character") continue;
    const name = block.text.trim();
    if (!name || seen.has(name.toUpperCase())) continue;
    seen.add(name.toUpperCase());
    byRecency.push(name);
  }

  const rotated = byRecency.length > 1 ? [...byRecency.slice(1), byRecency[0]!] : byRecency;
  return rotated.filter((name) => matchesPrefix(name, prefix));
}

/**
 * Distinct scene-heading locations (the part between the INT./EXT. prefix
 * and the time-of-day suffix — see `tokenizeSceneHeading`) used in
 * `blocks[0..beforeIndex)`, most-recently-used first, filtered by prefix.
 */
export function sceneLocationSuggestions(blocks: readonly Block[], beforeIndex: number, prefix = ""): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block?.type !== "scene_heading") continue;
    const location = tokenizeSceneHeading(block.text).location.trim();
    if (!location || seen.has(location.toUpperCase())) continue;
    seen.add(location.toUpperCase());
    ordered.push(location);
  }
  return ordered.filter((location) => matchesPrefix(location, prefix));
}

/** Character-cue extension suggestions (V.O., O.S., O.C., CONT'D), filtered by prefix. */
export function extensionSuggestions(prefix = ""): string[] {
  return EXTENSIONS.filter((ext) => matchesPrefix(ext, prefix));
}

/**
 * The two distinct character names in an established back-and-forth, if
 * `blocks[0..beforeIndex)` has used exactly two — the case E2-3 singles
 * out as needing a one-keystroke completion. `null` for zero, one, or
 * three-or-more distinct speakers (anything else is ambiguous enough that
 * the general `characterNameSuggestions` ranking is the best available
 * answer).
 */
export function twoCharacterAlternatingPair(blocks: readonly Block[], beforeIndex: number): [string, string] | null {
  const distinct = new Set<string>();
  for (let i = 0; i < beforeIndex; i++) {
    const block = blocks[i];
    if (block?.type !== "character") continue;
    const name = block.text.trim();
    if (name) distinct.add(name.toUpperCase());
  }
  if (distinct.size !== 2) return null;

  const ranked = characterNameSuggestions(blocks, beforeIndex);
  if (ranked.length < 2) return null;
  return [ranked[0]!, ranked[1]!];
}

/**
 * Walks backward from `blockIndex` (exclusive) over dialogue/parenthetical
 * blocks to find the character cue that opened the current exchange, if
 * any — used to decide whether "Enter on an empty dialogue block" is
 * inside an established exchange (worth offering a smart next-cue
 * suggestion) or genuinely just demoting to action.
 */
export function exchangeOpeningCharacter(blocks: readonly Block[], blockIndex: number): string | null {
  let i = blockIndex - 1;
  while (i >= 0 && (blocks[i]?.type === "dialogue" || blocks[i]?.type === "parenthetical")) i--;
  const opener = i >= 0 ? blocks[i] : undefined;
  return opener?.type === "character" ? opener.text.trim() : null;
}
