/**
 * Headless entrypoint — the subset of the editor usable in a Node worker
 * with no DOM or React. Importing this must never pull in prosemirror-view,
 * React, or any browser-only module, so the export/derive worker can hydrate
 * a document from Yjs state server-side.
 */
import * as Y from "yjs";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import type { Block, ScreenplayDocument, TitlePageFields } from "@fylym/screenplay-core";
import { screenplaySchema } from "./schema.js";
import { toBlocks } from "./converters.js";
import { getTitlePageFields } from "./yjs-binding.js";

export { screenplaySchema } from "./schema.js";
export { toBlocks, toBlock } from "./converters.js";

/**
 * Rebuilds the block sequence and title-page metadata from an encoded Yjs
 * document update (the `ydocState` persisted by E4-6). The content lives in
 * the `content` XmlFragment; title-page fields live in the `meta` map.
 */
export function hydrateFromYUpdate(update: Uint8Array): {
  document: ScreenplayDocument;
  titlePageFields: TitlePageFields;
} {
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, update);
    const fragment = ydoc.getXmlFragment("content");
    const rootNode = yXmlFragmentToProseMirrorRootNode(
      fragment,
      screenplaySchema,
    );
    const blocks: Block[] = toBlocks(rootNode);
    const titlePageFields = getTitlePageFields(ydoc.getMap("meta"));
    return { document: { blocks }, titlePageFields };
  } finally {
    ydoc.destroy();
  }
}
