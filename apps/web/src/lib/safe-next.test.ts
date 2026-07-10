import { describe, it, expect } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("returns the fallback for empty input", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it("allows same-origin absolute paths", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/projects/123")).toBe("/projects/123");
  });

  it("rejects off-site and protocol-relative URLs (no open redirect)", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("http://localhost:3000/x")).toBe("/");
    expect(safeNext("relative/path")).toBe("/");
  });

  it("honors a custom fallback", () => {
    expect(safeNext(null, "/login")).toBe("/login");
  });
});
