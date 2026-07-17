import { describe, expect, it } from "vitest";
import type { Block } from "@fylym/screenplay-core";
import type { Beat } from "@/lib/beats";
import { mergeOutline, outlineKey } from "@/lib/outline";

const beat = (id: string, act: string, title: string, summary = ""): Beat => ({
  id,
  act,
  title,
  summary,
  color: "slate",
});

const action = (id: string, text: string): Block => ({
  id,
  type: "action",
  text,
  marks: [],
  attrs: {},
});

describe("mergeOutline", () => {
  it("weaves acts as sections and beats as synopses, in board order", () => {
    const body = [action("a1", "FADE IN.")];
    const { blocks, added, updated, removed } = mergeOutline(body, [
      beat("b1", "Act I", "Setup", "Meet the hero."),
      beat("b2", "Act I", "Catalyst"),
      beat("b3", "Act II", "Fun and games"),
    ]);

    expect(blocks.map((b) => [b.type, b.text])).toEqual([
      ["section", "Act I"],
      ["synopsis", "Setup — Meet the hero."],
      ["synopsis", "Catalyst"],
      ["section", "Act II"],
      ["synopsis", "Fun and games"],
      ["action", "FADE IN."],
    ]);
    expect({ added, updated, removed }).toEqual({
      added: 5,
      updated: 0,
      removed: 0,
    });
  });

  it("tags every marker so it can be found again", () => {
    const { blocks } = mergeOutline([], [beat("b1", "Act I", "Setup")]);
    expect(blocks.map(outlineKey)).toEqual(["act:Act I", "beat:b1"]);
  });

  it("updates matching markers in place, wherever the writer moved them", () => {
    const first = mergeOutline(
      [action("a1", "Scene one."), action("a2", "Scene two.")],
      [beat("b1", "Act I", "Setup", "Old summary")],
    );
    // Writer moves the beat marker between the two action blocks.
    const rearranged = [
      first.blocks[0]!, // section Act I
      first.blocks[2]!, // action a1
      first.blocks[1]!, // synopsis b1
      first.blocks[3]!, // action a2
    ];

    const second = mergeOutline(rearranged, [
      beat("b1", "Act I", "Setup", "New summary"),
    ]);
    expect(second.blocks.map((b) => [b.type, b.text])).toEqual([
      ["section", "Act I"],
      ["action", "Scene one."],
      ["synopsis", "Setup — New summary"],
      ["action", "Scene two."],
    ]);
    expect(second.added).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.removed).toBe(0);
    // Marker block identity survives the update.
    expect(second.blocks[2]!.id).toBe(first.blocks[1]!.id);
  });

  it("inserts a new beat right after its act's previous marker", () => {
    const first = mergeOutline(
      [action("a1", "Scene one.")],
      [beat("b1", "Act I", "Setup"), beat("b2", "Act II", "Climax")],
    );
    const second = mergeOutline(first.blocks, [
      beat("b1", "Act I", "Setup"),
      beat("b9", "Act I", "Debate"),
      beat("b2", "Act II", "Climax"),
    ]);
    expect(second.blocks.map((b) => [b.type, b.text])).toEqual([
      ["section", "Act I"],
      ["synopsis", "Setup"],
      ["synopsis", "Debate"],
      ["section", "Act II"],
      ["synopsis", "Climax"],
      ["action", "Scene one."],
    ]);
    expect(second.added).toBe(1);
  });

  it("removes markers for beats deleted from the board, leaving script blocks alone", () => {
    const first = mergeOutline(
      [action("a1", "Scene one.")],
      [beat("b1", "Act I", "Setup"), beat("b2", "Act I", "Catalyst")],
    );
    const second = mergeOutline(first.blocks, [beat("b1", "Act I", "Setup")]);
    expect(second.blocks.map((b) => [b.type, b.text])).toEqual([
      ["section", "Act I"],
      ["synopsis", "Setup"],
      ["action", "Scene one."],
    ]);
    expect(second.removed).toBe(1);
  });

  it("re-import with no board changes is a no-op", () => {
    const beats = [beat("b1", "Act I", "Setup", "Meet the hero.")];
    const first = mergeOutline([action("a1", "FADE IN.")], beats);
    const second = mergeOutline(first.blocks, beats);
    expect(second.blocks).toEqual(first.blocks);
    expect({
      added: second.added,
      updated: second.updated,
      removed: second.removed,
    }).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("does not mutate the input body", () => {
    const body = [action("a1", "FADE IN.")];
    const snapshot = structuredClone(body);
    mergeOutline(body, [beat("b1", "Act I", "Setup")]);
    expect(body).toEqual(snapshot);
  });
});
