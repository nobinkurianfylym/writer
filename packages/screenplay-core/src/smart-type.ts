export type SceneType = "INT" | "EXT" | "INT/EXT";

export interface SceneHeadingTokens {
  sceneType: SceneType | null;
  /** The nested-location text, with any internal separators normalized to " - ". */
  location: string;
  time: string | null;
  raw: string;
}

// Ordered longest-first so "INT./EXT." isn't swallowed by the bare "INT." branch.
const SCENE_TYPE_RE =
  /^\s*(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?)\s*[-–—.]?\s*/i;

function normalizeSceneType(matched: string): SceneType {
  const compact = matched.toUpperCase().replace(/[.\s]/g, "");
  if (compact === "I/E" || compact === "INT/EXT" || compact === "EXT/INT") return "INT/EXT";
  return compact === "INT" ? "INT" : "EXT";
}

const TIME_KEYWORDS = new Set([
  "DAY",
  "NIGHT",
  "MORNING",
  "EVENING",
  "AFTERNOON",
  "DAWN",
  "DUSK",
  "SUNSET",
  "SUNRISE",
  "CONTINUOUS",
  "LATER",
  "NOON",
  "MIDNIGHT",
]);

const TIME_MULTI_WORD_KEYWORDS = new Set(["SAME TIME", "MAGIC HOUR"]);

/**
 * Heuristic, not exhaustive (screenplay time-of-day phrasing is open-ended):
 * matches the well-known single keywords, two-word phrases, natural
 * qualifiers ("MOMENTS LATER", "THE NEXT MORNING"), and hyphenated compounds
 * ("PRE-DAWN") by keying off the final word(s).
 */
function looksLikeTimeOfDay(segment: string): boolean {
  const normalized = segment.trim().toUpperCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  if (TIME_MULTI_WORD_KEYWORDS.has(normalized)) return true;

  const words = normalized.split(" ");
  const last = words[words.length - 1] ?? "";
  const lastTwo = words.slice(-2).join(" ");
  if (TIME_MULTI_WORD_KEYWORDS.has(lastTwo)) return true;
  if (TIME_KEYWORDS.has(last)) return true;

  const hyphenParts = last.split("-");
  const lastHyphenPart = hyphenParts[hyphenParts.length - 1] ?? "";
  return hyphenParts.length > 1 && TIME_KEYWORDS.has(lastHyphenPart);
}

/**
 * Splits a scene heading into scene type, location, and time-of-day.
 * Only " - " / " – " / " — " surrounded by whitespace is treated as a
 * separator, so hyphenated words (e.g. "TWENTY-FIRST FLOOR") are left
 * intact. Nested locations ("HOUSE - KITCHEN") are supported by only
 * treating the *last* segment as a time candidate; if it isn't recognized,
 * the whole remainder is returned as location, unmodified.
 */
export function tokenizeSceneHeading(raw: string): SceneHeadingTokens {
  const match = SCENE_TYPE_RE.exec(raw);
  if (!match?.[1]) {
    return { sceneType: null, location: raw.trim(), time: null, raw };
  }

  const sceneType = normalizeSceneType(match[1]);
  const rest = raw.slice(match[0].length).trim();
  if (!rest) {
    return { sceneType, location: "", time: null, raw };
  }

  const parts = rest.split(/\s+[-–—]+\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (last !== undefined && looksLikeTimeOfDay(last)) {
      return {
        sceneType,
        location: parts.slice(0, -1).join(" - ").trim(),
        time: last.trim(),
        raw,
      };
    }
  }

  return { sceneType, location: rest, time: null, raw };
}

export interface CharacterNameTokens {
  name: string;
  /** Canonical extensions in original left-to-right order, e.g. ["V.O.", "CONT'D"]. */
  extensions: string[];
  raw: string;
}

function normalizeExtensionKey(s: string): string {
  return s.toUpperCase().replace(/[.\s']/g, "");
}

const EXTENSION_MAP = new Map<string, string>([
  ["VO", "V.O."],
  ["VOICEOVER", "V.O."],
  ["OS", "O.S."],
  ["OFFSCREEN", "O.S."],
  ["OC", "O.C."],
  ["OFFCAMERA", "O.C."],
  ["CONTD", "CONT'D"],
  ["CONTINUED", "CONT'D"],
  ["SUBTITLE", "SUBTITLE"],
  ["FILTERED", "FILTERED"],
  ["PRELAP", "PRE-LAP"],
]);

function matchExtension(content: string): string | null {
  return EXTENSION_MAP.get(normalizeExtensionKey(content)) ?? null;
}

const TRAILING_PAREN_RE = /\(([^()]*)\)\s*$/;

/**
 * Strips recognized trailing character-name extensions — (V.O.), (O.S.),
 * (CONT'D), etc. — leaving the bare character name. An unrecognized trailing
 * parenthetical (e.g. an age note like "(30s)") is left in the name rather
 * than guessed at.
 */
export function tokenizeCharacterName(raw: string): CharacterNameTokens {
  const extensions: string[] = [];
  let remaining = raw.trim();

  let match = TRAILING_PAREN_RE.exec(remaining);
  while (match?.[1] !== undefined) {
    const canonical = matchExtension(match[1]);
    if (!canonical) break;
    extensions.unshift(canonical);
    remaining = remaining.slice(0, match.index).trim();
    match = TRAILING_PAREN_RE.exec(remaining);
  }

  return { name: remaining, extensions, raw };
}

const NAMED_TRANSITIONS = [
  /^FADE IN:$/i,
  /^FADE OUT\.?$/i,
  /^FADE TO BLACK\.?$/i,
];

/**
 * Detects text that should trigger auto-conversion to a `transition` block
 * (e.g. typing "CUT TO:" at the start of an action line), right-align caps
 * applied by the format profile once retyped. Heuristic: any short all-word
 * phrase ending in "TO:" (CUT TO:, DISSOLVE TO:, SMASH CUT TO:, ...), plus
 * the handful of standard transitions that don't end in "TO:".
 */
export function isTransitionText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^[a-z][a-z '.-]*\bto:$/i.test(trimmed)) return true;
  return NAMED_TRANSITIONS.some((re) => re.test(trimmed));
}
