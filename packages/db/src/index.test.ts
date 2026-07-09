import { describe, expect, it } from "vitest";
import { PrismaClient } from "./index.js";

describe("db package boundary", () => {
  it("exports PrismaClient constructor", () => {
    expect(PrismaClient).toBeDefined();
    expect(typeof PrismaClient).toBe("function");
  });
});
