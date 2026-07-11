// Manglish → Malayalam rule-based transliteration (Mozhi-inspired, pragmatic).
// This is the offline fallback for the word-level IME: when the Google Input
// Tools proxy is unavailable, we still produce a reasonable Malayalam guess.

const VIRAMA = "്";

const VOWELS: Array<[string, string]> = [
  ["au", "ഔ"], ["ai", "ഐ"], ["aa", "ആ"], ["ee", "ഈ"], ["oo", "ഊ"],
  ["ea", "ഏ"], ["ou", "ഔ"], ["a", "അ"], ["A", "ആ"], ["i", "ഇ"], ["I", "ഈ"],
  ["u", "ഉ"], ["U", "ഊ"], ["e", "എ"], ["E", "ഏ"], ["o", "ഒ"], ["O", "ഓ"],
];

const VOWEL_SIGNS: Array<[string, string]> = [
  ["au", "ൌ"], ["ai", "ൈ"], ["aa", "ാ"], ["ee", "ീ"], ["oo", "ൂ"],
  ["ea", "േ"], ["ou", "ൌ"], ["a", ""], ["A", "ാ"], ["i", "ി"], ["I", "ീ"],
  ["u", "ു"], ["U", "ൂ"], ["e", "െ"], ["E", "േ"], ["o", "ൊ"], ["O", "ോ"],
];

const CONSONANTS: Array<[string, string]> = [
  ["ksh", "ക്ഷ"], ["chh", "ഛ"], ["Th", "ഠ"], ["Dh", "ഢ"], ["gh", "ഘ"],
  ["kh", "ഖ"], ["jh", "ഝ"], ["ph", "ഫ"], ["bh", "ഭ"], ["dh", "ധ"],
  ["th", "ത"], ["sh", "ശ"], ["Sh", "ഷ"], ["ng", "ങ"], ["nj", "ഞ"],
  ["ch", "ച"], ["zh", "ഴ"], ["k", "ക"], ["g", "ഗ"], ["j", "ജ"], ["T", "ട"],
  ["D", "ഡ"], ["N", "ണ"], ["t", "ത"], ["d", "ദ"], ["n", "ന"], ["p", "പ"],
  ["b", "ബ"], ["m", "മ"], ["y", "യ"], ["r", "ര"], ["R", "റ"], ["l", "ല"],
  ["L", "ള"], ["v", "വ"], ["w", "വ"], ["s", "സ"], ["h", "ഹ"], ["f", "ഫ"],
  ["q", "ക"], ["z", "സ"], ["x", "ക്സ"],
];

const CHILLUS: Record<string, string> = {
  n: "ൻ", r: "ർ", l: "ൽ", L: "ൾ", N: "ൺ",
};

function matchFrom(list: Array<[string, string]>, s: string, i: number) {
  for (const [k, v] of list) {
    if (s.startsWith(k, i)) return { key: k, val: v };
  }
  return null;
}

export function transliterateWord(word: string): string {
  if (!word) return "";
  const m = word.match(/^([^A-Za-z_]*)([A-Za-z_]+)([^A-Za-z_]*)$/);
  if (!m) return word;
  const [, pre, core, post] = m;

  let out = "";
  let i = 0;
  let lastWasConsonant = false;

  while (i < core!.length) {
    const cons = matchFrom(CONSONANTS, core!, i);
    if (cons) {
      const afterIdx = i + cons.key.length;
      const atEnd = afterIdx >= core!.length;

      if (lastWasConsonant) out += VIRAMA;

      if (atEnd && CHILLUS[cons.key]) {
        out += CHILLUS[cons.key];
        lastWasConsonant = false;
        i = afterIdx;
        continue;
      }

      out += cons.val;
      i = afterIdx;

      const vs = matchFrom(VOWEL_SIGNS, core!, i);
      if (vs) {
        out += vs.val;
        i += vs.key.length;
        lastWasConsonant = false;
      } else {
        const nextCons = matchFrom(CONSONANTS, core!, i);
        if (nextCons) {
          lastWasConsonant = true;
        } else {
          out += VIRAMA;
          lastWasConsonant = false;
        }
      }
      continue;
    }

    const vow = matchFrom(VOWELS, core!, i);
    if (vow) {
      out += vow.val;
      i += vow.key.length;
      lastWasConsonant = false;
      continue;
    }

    out += core![i];
    i++;
    lastWasConsonant = false;
  }

  return (pre ?? "") + out + (post ?? "");
}

/** Transliterate a whole string, preserving whitespace. */
export function transliterate(text: string): string {
  return text
    .split(/(\s+)/)
    .map((part) => (/\s+/.test(part) ? part : transliterateWord(part)))
    .join("");
}
