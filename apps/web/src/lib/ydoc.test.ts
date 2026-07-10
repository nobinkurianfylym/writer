import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import type { Block } from "@fylym/screenplay-core";
import { buildYState, hydrateDocument } from "./ydoc";
import { idbGetState, idbPutState, idbClearState } from "./idb-kv";

function block(type: string, text: string): Block {
  return { id: crypto.randomUUID(), type: type as never, text, marks: [], attrs: {} };
}

describe("ydoc encode/hydrate round-trip", () => {
  it("rebuilds the block sequence from an encoded Yjs update", () => {
    const blocks = [
      block("scene_heading", "INT. HOUSE - DAY"),
      block("action", "A quiet room."),
      block("character", "ALEX"),
      block("dialogue", "Hello."),
    ];

    const state = buildYState(blocks);
    const doc = hydrateDocument(state);

    expect(doc.blocks.map((b) => [b.type, b.text])).toEqual(
      blocks.map((b) => [b.type, b.text]),
    );
  });
});

describe("IndexedDB script-state store", () => {
  const scriptId = "script-1";
  beforeEach(async () => {
    await idbClearState(scriptId);
  });

  it("persists and reads back the latest ydocState bytes", async () => {
    const bytes = buildYState([block("action", "Draft line.")]);
    await idbPutState(scriptId, bytes);

    const restored = await idbGetState(scriptId);
    expect(restored).toBeDefined();
    // Normalize in case structuredClone returns a cross-realm typed array.
    expect(hydrateDocument(new Uint8Array(restored!)).blocks[0]!.text).toBe(
      "Draft line.",
    );
  });

  it("returns undefined for an unknown script", async () => {
    expect(await idbGetState("does-not-exist")).toBeUndefined();
  });

  it("clears a script's local state", async () => {
    await idbPutState(scriptId, buildYState([block("action", "x")]));
    await idbClearState(scriptId);
    expect(await idbGetState(scriptId)).toBeUndefined();
  });
});
