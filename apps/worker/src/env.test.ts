import { describe, expect, it } from "vitest";
import { getWorkerEnv } from "./env.js";

describe("worker env validation", () => {
  it("parses a valid environment", () => {
    const env = getWorkerEnv({
      REDIS_URL: "redis://localhost:6379",
      DATABASE_URL: "postgresql://localhost:5432/fylym",
      S3_ENDPOINT: "http://localhost:9000",
    });
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
  });

  it("names the missing key in a single-line error", () => {
    expect(() => getWorkerEnv({})).toThrow(/REDIS_URL/);
  });
});
