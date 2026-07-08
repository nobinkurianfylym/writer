import type { Block, ScreenplayDocument } from "../model.js";
import { fdxTypeForBlock } from "./paragraph-types.js";
import { encodeTextRuns } from "./styles.js";
import { createFdxBuilder } from "./xml.js";

function serializeParagraph(b: Block, insideDualDialogue: boolean): Record<string, unknown> {
  const { fdxType, fylymType } = fdxTypeForBlock(b.type);
  const passthroughAttrs = (b.attrs.passthrough?.fdxParagraph as Record<string, unknown> | undefined) ?? {};

  const node: Record<string, unknown> = {
    "@_Type": fdxType,
    ...passthroughAttrs,
  };
  if (fylymType !== undefined) node["@_FylymType"] = fylymType;
  if (b.attrs.sceneNumber !== undefined) node["@_Number"] = b.attrs.sceneNumber;
  if (b.attrs.revision !== undefined) node["@_Revision"] = b.attrs.revision;
  if (b.attrs.locked) node["@_Locked"] = "Yes";
  if (insideDualDialogue && b.attrs.dualColumn) node["@_FylymDualColumn"] = b.attrs.dualColumn;

  node.Text = encodeTextRuns(b.text, b.marks).map((run) => {
    if (run.style === undefined && run.revisionColor === undefined) return run.text;
    const textNode: Record<string, unknown> = { "#text": run.text };
    if (run.style !== undefined) textNode["@_Style"] = run.style;
    if (run.revisionColor !== undefined) textNode["@_RevisionColor"] = run.revisionColor;
    return textNode;
  });

  return node;
}

/**
 * Groups the flat body-block sequence into FDX `<Paragraph>` nodes,
 * collapsing each `dual_dialogue` marker + its tagged left/right blocks into
 * a single `<Paragraph><DualDialogue>...</DualDialogue></Paragraph>` — the
 * structure real Final Draft files use for side-by-side dialogue.
 */
function serializeBodyBlocks(blocks: Block[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (b.type === "dual_dialogue") {
      let j = i + 1;
      const inner: Record<string, unknown>[] = [];
      while (j < blocks.length && blocks[j]!.attrs.dualColumn !== undefined) {
        inner.push(serializeParagraph(blocks[j]!, true));
        j++;
      }
      out.push({ DualDialogue: { Paragraph: inner } });
      i = j;
    } else {
      out.push(serializeParagraph(b, false));
      i++;
    }
  }
  return out;
}

function serializeTitlePage(block: Block): Record<string, unknown> {
  const raw = block.attrs.passthrough?.fdxTitlePageParagraphs as Record<string, unknown>[] | undefined;
  if (raw) return { Content: { Paragraph: raw } };

  const lines = block.text.split("\n").filter((l) => l.length > 0);
  return {
    Content: {
      Paragraph: lines.map((line) => ({
        "@_Type": "Text",
        "@_Alignment": "Center",
        Text: [line],
      })),
    },
  };
}

interface DocumentPassthrough {
  fdxRootAttrs?: Record<string, unknown>;
  fdxOtherRootKeys?: Record<string, unknown>;
  fdxContentAttrs?: Record<string, unknown>;
}

/** Serializes a ScreenplayDocument to Final Draft XML (.fdx). */
export function serializeFdx(doc: ScreenplayDocument): string {
  const builder = createFdxBuilder();

  const titlePageBlock = doc.blocks.find((b) => b.type === "title_page");
  const bodyBlocks = doc.blocks.filter((b) => b.type !== "title_page");
  const contentParagraphs = serializeBodyBlocks(bodyBlocks);

  const passthrough = doc.passthrough as DocumentPassthrough | undefined;

  const finalDraft: Record<string, unknown> = {
    "@_DocumentType": "Script",
    "@_Template": "No",
    "@_Version": "1",
    ...(passthrough?.fdxRootAttrs ?? {}),
    Content: {
      ...(passthrough?.fdxContentAttrs ?? {}),
      Paragraph: contentParagraphs,
    },
  };

  if (titlePageBlock) finalDraft.TitlePage = serializeTitlePage(titlePageBlock);

  Object.assign(finalDraft, passthrough?.fdxOtherRootKeys ?? {});

  const xmlBody = builder.build({ FinalDraft: finalDraft }) as string;
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n${xmlBody}`;
}
