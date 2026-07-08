import { Transform } from "prosemirror-transform";
import { describe, expect, it } from "vitest";
import { BLOCK_TYPES } from "@fylym/screenplay-core";
import { toPmDoc } from "./converters.js";
import { screenplaySchema } from "./schema.js";

describe("screenplaySchema: one node type per BlockType", () => {
  it("registers exactly the 15 BlockTypes as node types, plus doc/text", () => {
    for (const type of BLOCK_TYPES) expect(screenplaySchema.nodes[type]).toBeDefined();
    const nodeNames = new Set(Object.keys(screenplaySchema.nodes));
    expect(nodeNames).toEqual(new Set([...BLOCK_TYPES, "doc", "text"]));
  });

  it("registers bold/italic/underline/strike/revision as marks", () => {
    expect(new Set(Object.keys(screenplaySchema.marks))).toEqual(
      new Set(["bold", "italic", "underline", "strike", "revision"]),
    );
  });
});

/**
 * No node type other than `doc` declares block-level content ("block+") —
 * every BlockType's own content is "text*" (or "" for the structural
 * markers). That's what makes "dialogue inside dialogue" (or any
 * block-inside-block nesting) impossible to construct through normal
 * editing, rather than merely a convention `normalize()` has to repair
 * after the fact the way the flat Block[] model does.
 */
describe("screenplaySchema: nesting violations are rejected", () => {
  it("Node.createChecked (and doc.check()) reject a block node nested inside another block node's content", () => {
    const inner = screenplaySchema.nodes.dialogue!.create({ id: "inner" }, [screenplaySchema.text("nested")]);

    expect(() => screenplaySchema.nodes.dialogue!.createChecked({ id: "outer" }, [inner])).toThrow(RangeError);
    expect(() => screenplaySchema.nodes.character!.createChecked({ id: "outer" }, [inner])).toThrow(RangeError);

    // The schema's own unchecked Node.create doesn't validate (a documented
    // ProseMirror performance trade-off) — but doc.check(), which a real
    // editor calls after every transaction, still catches it.
    const uncheckedOuter = screenplaySchema.nodes.dialogue!.create({ id: "outer" }, [inner]);
    const doc = screenplaySchema.nodes.doc!.create(null, [uncheckedOuter]);
    expect(() => doc.check()).toThrow(RangeError);
  });

  it("a Transform attempting to insert a block node at a position inside another block node's content never produces the nested result", () => {
    const doc = toPmDoc([
      { id: "b1", type: "character", text: "MAYA", marks: [], attrs: {} },
      { id: "b2", type: "dialogue", text: "Hello there.", marks: [], attrs: {} },
    ]);

    const dialogueNode = screenplaySchema.nodes.dialogue!.create({ id: "bad" }, [screenplaySchema.text("nested!")]);
    // A position inside the second (dialogue) block's own text content.
    const insidePos = 1 + doc.child(0)!.nodeSize + 1;
    expect(doc.resolve(insidePos).parent.type.name).toBe("dialogue");

    const tr = new Transform(doc);
    tr.replaceWith(insidePos, insidePos, dialogueNode);

    // ProseMirror's replace machinery re-routes content that doesn't fit its
    // target position to the nearest ancestor where it *is* valid (here:
    // splitting the surrounding dialogue block and inserting as a sibling
    // under `doc`) rather than ever producing a dialogue-inside-dialogue
    // document — this is what "rejected at the transaction level" means in
    // practice: no sequence of real edits can construct the illegal nesting.
    tr.doc.descendants((node) => {
      if (node.type.name === "dialogue") {
        node.forEach((child) => expect(child.type.name).not.toBe("dialogue"));
      }
    });
    expect(() => tr.doc.check()).not.toThrow();
  });
});
