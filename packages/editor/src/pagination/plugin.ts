import type { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import type { PageMap } from "@fylym/screenplay-core";
import { toBlocks } from "../converters.js";
import type { PaginateRequest, PaginateResponse } from "./protocol.js";

export interface PaginationPluginState {
  pageMap: PageMap | null;
  decorations: DecorationSet;
  workerAlive: boolean;
}

export const paginationKey = new PluginKey<PaginationPluginState>("pagination");

function firstChangedBlockIndex(oldDoc: PMNode, newDoc: PMNode): number {
  const count = Math.min(oldDoc.childCount, newDoc.childCount);
  for (let i = 0; i < count; i++) {
    if (oldDoc.child(i) !== newDoc.child(i)) return i;
  }
  return count;
}

function buildDecorations(doc: PMNode, pageMap: PageMap): DecorationSet {
  if (pageMap.pages.length <= 1) return DecorationSet.empty;

  const blockPos = new Map<string, number>();
  doc.forEach((node, offset) => {
    blockPos.set(node.attrs.id as string, offset);
  });

  const widgets: Decoration[] = [];

  for (let pageIdx = 0; pageIdx < pageMap.pages.length - 1; pageIdx++) {
    const currentPage = pageMap.pages[pageIdx]!;
    const nextPage = pageMap.pages[pageIdx + 1]!;

    let lastCurrentBlockId: string | null = null;
    for (const line of currentPage.lines) {
      if (!line.isBlank && !line.synthetic) lastCurrentBlockId = line.blockId;
    }

    let firstNextBlockId: string | null = null;
    for (const line of nextPage.lines) {
      if (!line.isBlank && !line.synthetic) {
        firstNextBlockId = line.blockId;
        break;
      }
    }
    if (!firstNextBlockId) continue;

    const pos =
      lastCurrentBlockId && lastCurrentBlockId === firstNextBlockId
        ? blockPos.get(lastCurrentBlockId)
        : blockPos.get(firstNextBlockId);
    if (pos === undefined) continue;

    const trailing: string[] = [];
    for (let j = currentPage.lines.length - 1; j >= 0; j--) {
      const line = currentPage.lines[j]!;
      if (line.synthetic) trailing.unshift(line.text);
      else break;
    }

    const leading: string[] = [];
    for (const line of nextPage.lines) {
      if (line.synthetic) leading.push(line.text);
      else if (!line.isBlank) break;
    }

    const pageNumber = nextPage.pageNumber;
    widgets.push(
      Decoration.widget(
        pos,
        () => {
          const container = document.createElement("div");
          container.className = "pagination-break";
          container.setAttribute("data-testid", "page-break");
          container.setAttribute("data-page", String(pageNumber));
          container.contentEditable = "false";
          container.style.cssText =
            "position:relative;border-top:1px dashed rgba(128,128,128,0.4);margin:16px 0 12px;padding:4px 0;text-align:center;user-select:none;pointer-events:none;";

          for (const text of trailing) {
            const div = document.createElement("div");
            div.className = "pagination-synthetic pagination-more";
            div.setAttribute("data-testid", "page-more");
            div.style.cssText =
              "font-size:12px;color:rgba(128,128,128,0.6);font-family:'Courier New',Courier,monospace;text-align:center;";
            div.textContent = text;
            container.appendChild(div);
          }

          const ruler = document.createElement("div");
          ruler.className = "pagination-ruler";
          ruler.setAttribute("data-testid", "page-ruler");
          ruler.style.cssText = "font-size:11px;color:rgba(128,128,128,0.7);font-family:sans-serif;";
          ruler.textContent = String(pageNumber);
          container.appendChild(ruler);

          for (const text of leading) {
            const div = document.createElement("div");
            div.className = "pagination-synthetic pagination-contd";
            div.setAttribute("data-testid", "page-contd");
            div.style.cssText =
              "font-size:12px;color:rgba(128,128,128,0.6);font-family:'Courier New',Courier,monospace;text-align:center;";
            div.textContent = text;
            container.appendChild(div);
          }

          return container;
        },
        { side: -1, key: `page-break-${pageNumber}` },
      ),
    );
  }

  return DecorationSet.create(doc, widgets);
}

const DEBOUNCE_MS = 80;

export function paginationPlugin(worker: Worker): Plugin<PaginationPluginState> {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  let lastSentDoc: PMNode | null = null;

  return new Plugin<PaginationPluginState>({
    key: paginationKey,
    state: {
      init: () => ({
        pageMap: null,
        decorations: DecorationSet.empty,
        workerAlive: true,
      }),
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(paginationKey) as
          | { pageMap: PageMap; seq: number }
          | { workerDead: true }
          | undefined;

        if (meta && "pageMap" in meta) {
          const decorations = buildDecorations(newState.doc, meta.pageMap);
          return { pageMap: meta.pageMap, decorations, workerAlive: prev.workerAlive };
        }
        if (meta && "workerDead" in meta) {
          return { ...prev, workerAlive: false };
        }
        if (tr.docChanged) {
          return { ...prev, decorations: prev.decorations.map(tr.mapping, tr.doc) };
        }
        return prev;
      },
    },
    props: {
      decorations(state) {
        return paginationKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
    view(editorView: EditorView) {
      function sendToWorker(view: EditorView) {
        const doc = view.state.doc;
        const blocks = toBlocks(doc);
        const fromBlockIndex = lastSentDoc ? firstChangedBlockIndex(lastSentDoc, doc) : 0;
        lastSentDoc = doc;

        const request: PaginateRequest = { type: "paginate", blocks, fromBlockIndex, seq: ++seq };
        try {
          worker.postMessage(request);
        } catch {
          view.dispatch(view.state.tr.setMeta(paginationKey, { workerDead: true }));
        }
      }

      function onMessage(e: MessageEvent<PaginateResponse>) {
        if (e.data.seq < seq) return;
        editorView.dispatch(editorView.state.tr.setMeta(paginationKey, { pageMap: e.data.pageMap, seq: e.data.seq }));
      }

      function onError() {
        editorView.dispatch(editorView.state.tr.setMeta(paginationKey, { workerDead: true }));
      }

      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);

      sendToWorker(editorView);

      return {
        update(view, prevState) {
          if (!view.state.doc.eq(prevState.doc)) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => sendToWorker(view), DEBOUNCE_MS);
          }
        },
        destroy() {
          if (debounceTimer) clearTimeout(debounceTimer);
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
        },
      };
    },
  });
}
