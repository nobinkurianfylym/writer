import { Injectable, Logger } from "@nestjs/common";

// Google Input Tools transliteration codes.
const ITC: Record<string, string> = {
  ml: "ml-t-i0-und", // Malayalam
  hi: "hi-t-i0-und",
  ta: "ta-t-i0-und",
  te: "te-t-i0-und",
  kn: "kn-t-i0-und",
};

@Injectable()
export class TransliterateService {
  private readonly logger = new Logger(TransliterateService.name);
  private readonly cache = new Map<string, string[]>();

  /** Ordered transliteration candidates for a single Latin token. */
  async candidates(text: string, lang: string): Promise<string[]> {
    const token = text.trim();
    if (!token || token.length > 40 || !/^[A-Za-z]+$/.test(token)) return [];

    const itc = ITC[lang] ?? ITC.ml!;
    const cacheKey = `${itc}:${token}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url =
        `https://inputtools.google.com/request?text=${encodeURIComponent(token)}` +
        `&itc=${itc}&num=6&cp=0&cs=1&ie=utf-8&oe=utf-8`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`upstream ${res.status}`);

      // Shape: ["SUCCESS", [[token, [cand1, cand2, ...], ...]]]
      const data = (await res.json()) as unknown;
      const list = parseCandidates(data);
      if (list.length > 0) {
        if (this.cache.size > 5000) this.cache.clear();
        this.cache.set(cacheKey, list);
      }
      return list;
    } catch (err) {
      this.logger.debug(`transliterate("${token}") failed: ${(err as Error).message}`);
      return [];
    }
  }
}

function parseCandidates(data: unknown): string[] {
  if (!Array.isArray(data) || data[0] !== "SUCCESS") return [];
  const results = data[1];
  if (!Array.isArray(results) || !Array.isArray(results[0])) return [];
  const cands = (results[0] as unknown[])[1];
  if (!Array.isArray(cands)) return [];
  return Array.from(new Set(cands.filter((c): c is string => typeof c === "string")));
}
