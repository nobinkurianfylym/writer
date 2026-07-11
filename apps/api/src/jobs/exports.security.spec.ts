import { describe, it, expect } from "vitest";
import { RateLimitGuard } from "../auth/rate-limit.guard";
import { ExportsController } from "./exports.controller";

/**
 * Exports are expensive, so the endpoint must carry a rate-limit bucket in
 * addition to auth (§9 stricter export budget). Guards attach as class
 * metadata via `@UseGuards`, which we assert here so the protection can't be
 * dropped silently.
 */
describe("ExportsController security", () => {
  it("is protected by the rate-limit guard", () => {
    const guards: unknown[] =
      Reflect.getMetadata("__guards__", ExportsController) ?? [];
    expect(guards).toContain(RateLimitGuard);
  });
});
