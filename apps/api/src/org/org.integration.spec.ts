import { describe, it, expect, vi } from "vitest";
import { OrgService } from "./org.service";
import type { PrismaService } from "../prisma/prisma.service";

function createService(memberships: unknown) {
  const findMany = vi.fn().mockResolvedValue(memberships);
  const prisma = {
    db: { membership: { findMany } },
  } as unknown as PrismaService;
  return { service: new OrgService(prisma), findMany };
}

describe("OrgService.listForUser", () => {
  it("flattens the caller's memberships into org summaries", async () => {
    const { service, findMany } = createService([
      {
        role: "OWNER",
        org: { id: "o1", name: "Ada's workspace", slug: "ada-1", plan: "FREE" },
      },
    ]);

    const result = await service.listForUser("u1");

    expect(result).toEqual([
      {
        id: "o1",
        name: "Ada's workspace",
        slug: "ada-1",
        plan: "FREE",
        role: "OWNER",
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } }),
    );
  });

  it("returns an empty list when the user has no memberships", async () => {
    const { service } = createService([]);
    expect(await service.listForUser("nobody")).toEqual([]);
  });
});
