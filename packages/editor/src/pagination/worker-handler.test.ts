import { describe, expect, it } from "vitest";
import type { Block } from "@fylym/screenplay-core";
import type { PaginateRequest } from "./protocol.js";
import { createPaginationHandler } from "./worker-handler.js";

function makeBlocks(count: number): Block[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    type: "action" as const,
    text: "Character enters the room and carefully surveys the surroundings, taking in every detail with curiosity and wonder.",
    marks: [],
    attrs: {},
  }));
}

describe("createPaginationHandler", () => {
  it("returns a PageMap on the first request (full paginate)", () => {
    const handle = createPaginationHandler();
    const blocks = makeBlocks(200);
    const req: PaginateRequest = { type: "paginate", blocks, fromBlockIndex: 0, seq: 1 };
    const res = handle(req);

    expect(res.type).toBe("paginated");
    expect(res.seq).toBe(1);
    expect(res.pageMap.pages.length).toBeGreaterThan(1);
    expect(res.pageMap.pages[0]!.pageNumber).toBe(1);
  });

  it("uses incremental repagination on subsequent requests", () => {
    const handle = createPaginationHandler();
    const blocks = makeBlocks(200);
    handle({ type: "paginate", blocks, fromBlockIndex: 0, seq: 1 });

    const modified = [...blocks];
    modified[10] = { ...modified[10]!, text: "Something completely different happened here." };
    const res2 = handle({ type: "paginate", blocks: modified, fromBlockIndex: 10, seq: 2 });

    expect(res2.type).toBe("paginated");
    expect(res2.seq).toBe(2);
    expect(res2.pageMap.pages.length).toBeGreaterThan(1);
  });

  it("preserves seq number in responses", () => {
    const handle = createPaginationHandler();
    const blocks = makeBlocks(10);
    const res = handle({ type: "paginate", blocks, fromBlockIndex: 0, seq: 42 });
    expect(res.seq).toBe(42);
  });
});
