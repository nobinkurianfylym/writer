import { describe, expect, it } from "vitest";
import { getApiEnv } from "./env";

describe("api env validation", () => {
  it("parses a valid environment and defaults PORT", () => {
    const env = getApiEnv({
      DATABASE_URL: "postgresql://localhost:5432/fylym",
      REDIS_URL: "redis://localhost:6379",
      JWT_PRIVATE_KEY: "test-private-key",
      JWT_PUBLIC_KEY: "test-public-key",
    });
    expect(env.PORT).toBe(3001);
  });

  it("names the missing key in a single-line error", () => {
    expect(() => getApiEnv({})).toThrow(/DATABASE_URL/);
  });
});
