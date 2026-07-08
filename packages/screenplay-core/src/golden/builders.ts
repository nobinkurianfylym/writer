import type { Block, BlockAttrs, BlockType, DualColumn, MarkRange, ScreenplayDocument } from "../model.js";

/**
 * Deterministic, human-readable block ids ("b1", "b2", ...) instead of
 * random UUIDs — golden fixtures are committed JSON/text snapshots, so
 * regenerating one must produce byte-identical output every time.
 */
export class DocBuilder {
  private readonly blocks: Block[] = [];
  private counter = 0;
  private column: DualColumn | undefined;

  private nextId(): string {
    this.counter += 1;
    return `b${this.counter}`;
  }

  private add(type: BlockType, text: string, attrs: BlockAttrs = {}, marks: MarkRange[] = []): this {
    this.blocks.push({
      id: this.nextId(),
      type,
      text,
      marks,
      attrs: this.column ? { ...attrs, dualColumn: this.column } : attrs,
    });
    return this;
  }

  sceneHeading(text: string, sceneNumber?: string): this {
    return this.add("scene_heading", text, sceneNumber !== undefined ? { sceneNumber } : {});
  }
  action(text: string, marks: MarkRange[] = []): this {
    return this.add("action", text, {}, marks);
  }
  character(text: string): this {
    return this.add("character", text);
  }
  dialogue(text: string, marks: MarkRange[] = []): this {
    return this.add("dialogue", text, {}, marks);
  }
  parenthetical(text: string): this {
    return this.add("parenthetical", text);
  }
  transition(text: string): this {
    return this.add("transition", text);
  }
  shot(text: string): this {
    return this.add("shot", text);
  }
  lyric(text: string): this {
    return this.add("lyric", text);
  }
  centered(text: string): this {
    return this.add("centered", text);
  }
  note(text: string): this {
    return this.add("note", text);
  }
  section(text: string): this {
    return this.add("section", text);
  }
  synopsis(text: string): this {
    return this.add("synopsis", text);
  }
  pageBreak(): this {
    return this.add("page_break", "");
  }
  titlePage(text: string): this {
    return this.add("title_page", text);
  }

  /** A character/dialogue (and optional parenthetical) exchange, tagged into the currently open dual-dialogue column if any. */
  exchange(character: string, dialogue: string, parenthetical?: string): this {
    this.character(character);
    if (parenthetical !== undefined) this.parenthetical(parenthetical);
    return this.dialogue(dialogue);
  }

  /** A `dual_dialogue` marker followed by a left-column and a right-column build callback, matching the flat [marker, ...left, ...right] structure normalize() expects. */
  dualDialogue(left: (b: DocBuilder) => void, right: (b: DocBuilder) => void): this {
    this.blocks.push({ id: this.nextId(), type: "dual_dialogue", text: "", marks: [], attrs: {} });
    this.column = "left";
    left(this);
    this.column = "right";
    right(this);
    this.column = undefined;
    return this;
  }

  build(): ScreenplayDocument {
    return { blocks: this.blocks };
  }
}
