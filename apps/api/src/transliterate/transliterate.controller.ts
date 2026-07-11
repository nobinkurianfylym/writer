import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { RateLimitGuard } from "../auth/rate-limit.guard";
import { TransliterateService } from "./transliterate.service";

/**
 * Proxies Google Input Tools so the browser (behind a strict CSP that only
 * allows our own origin) can fetch word-level Malayalam candidates for the
 * Manglish IME. Auth'd + rate-limited to prevent abuse of the upstream.
 */
@Controller()
@UseGuards(JwtGuard, RateLimitGuard)
export class TransliterateController {
  constructor(private readonly service: TransliterateService) {}

  @Get("v1/transliterate")
  async transliterate(
    @Query("text") text?: string,
    @Query("lang") lang?: string,
  ): Promise<{ candidates: string[] }> {
    const candidates = await this.service.candidates(text ?? "", lang ?? "ml");
    return { candidates };
  }
}
