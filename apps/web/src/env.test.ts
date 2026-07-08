import { describe, expect, it } from "vitest";
import { getWebEnv } from "./env";

describe("web env validation", () => {
  it("parses a valid environment", () => {
    const env = getWebEnv({ NEXT_PUBLIC_API_URL: "http://localhost:3001" });
    expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:3001");
  });

  it("names the missing key in a single-line error", () => {
    expect(() => getWebEnv({})).toThrow(/NEXT_PUBLIC_API_URL/);
  });
});
