import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import type { Block, BlockType } from "@fylym/screenplay-core";

export interface FindMatch {
  blockIndex: number;
  charStart: number;
  charEnd: number;
  blockType: BlockType;
}

export interface SceneEntry {
  blockIndex: number;
  text: string;
  sceneNumber?: string;
}

export function findInBlocks(
  blocks: readonly Block[],
  query: string,
  elementFilter?: BlockType | null,
): FindMatch[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  const matches: FindMatch[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (elementFilter && block.type !== elementFilter) continue;
    const text = block.text.toLowerCase();
    let pos = 0;
    while (pos < text.length) {
      const idx = text.indexOf(lower, pos);
      if (idx === -1) break;
      matches.push({ blockIndex: i, charStart: idx, charEnd: idx + query.length, blockType: block.type });
      pos = idx + 1;
    }
  }
  return matches;
}

export function listSceneHeadings(blocks: readonly Block[]): SceneEntry[] {
  const scenes: SceneEntry[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.type === "scene_heading") {
      scenes.push({
        blockIndex: i,
        text: block.text,
        sceneNumber: (block.attrs.sceneNumber as string | undefined) ?? undefined,
      });
    }
  }
  return scenes;
}

export const findHighlightKey = new PluginKey<DecorationSet>("findHighlight");
export const FIND_HIGHLIGHTS_META = "findHighlightDecorations";

export function findHighlightPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: findHighlightKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, prev) {
        const decos = tr.getMeta(FIND_HIGHLIGHTS_META) as DecorationSet | undefined;
        if (decos !== undefined) return decos;
        if (tr.docChanged) return prev.map(tr.mapping, tr.doc);
        return prev;
      },
    },
    props: {
      decorations(state) {
        return findHighlightKey.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}

export function buildFindDecorations(
  doc: PMNode,
  matches: FindMatch[],
  currentIndex: number,
  blockIndexOffset: number = 0,
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;

  const nodePositions: number[] = [];
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    nodePositions.push(pos);
    pos += doc.child(i).nodeSize;
  }

  const decos: Decoration[] = [];
  for (let m = 0; m < matches.length; m++) {
    const match = matches[m]!;
    const localIndex = match.blockIndex - blockIndexOffset;
    if (localIndex < 0 || localIndex >= doc.childCount) continue;
    const nodeStart = nodePositions[localIndex]!;
    const from = nodeStart + 1 + match.charStart;
    const to = nodeStart + 1 + match.charEnd;
    const cls = m === currentIndex ? "find-match find-match-current" : "find-match";
    decos.push(Decoration.inline(from, to, { class: cls }));
  }
  return DecorationSet.create(doc, decos);
}
