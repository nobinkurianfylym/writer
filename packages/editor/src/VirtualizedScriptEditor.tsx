"use client";

import type { Node as PMNode } from "prosemirror-model";
import { EditorState, Plugin, PluginKey, TextSelection, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { useEffect, useRef, useState } from "react";
import type { Block, FormatProfile, PageMap, ScreenplayDocument } from "@fylym/screenplay-core";
import { usFeatureProfile } from "@fylym/screenplay-core";
import { elementBehaviorPlugins } from "./element-behavior-plugin.js";
import type { PaginateRequest, PaginateResponse } from "./pagination/protocol.js";
import { screenplaySchema } from "./schema.js";
import { VirtualViewport } from "./virtualization/viewport.js";

export interface VirtualizedScriptEditorProps {
  initialDocument: ScreenplayDocument;
  profile?: FormatProfile;
  onChange?: (doc: ScreenplayDocument) => void;
  paginationWorker?: Worker;
}

function buildWindowDoc(vp: VirtualViewport): PMNode {
  const nodes: PMNode[] = [];
  for (let i = vp.range.start; i < vp.range.end; i++) {
    nodes.push(vp.getNode(i));
  }
  return screenplaySchema.nodes.doc!.create(null, nodes);
}

function buildPageDecorations(doc: PMNode, pageMap: PageMap): DecorationSet {
  if (pageMap.pages.length <= 1) return DecorationSet.empty;

  const blockIdToPos = new Map<string, number>();
  const visibleBlockIds = new Set<string>();
  doc.forEach((node, offset) => {
    const id = node.attrs.id as string;
    blockIdToPos.set(id, offset);
    visibleBlockIds.add(id);
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

    const anchorId =
      lastCurrentBlockId && lastCurrentBlockId === firstNextBlockId ? lastCurrentBlockId : firstNextBlockId;
    if (!visibleBlockIds.has(anchorId)) continue;
    const pos = blockIdToPos.get(anchorId);
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

const PAGINATION_DEBOUNCE_MS = 150;

const decoKey = new PluginKey<DecorationSet>("virtualDecorations");

function virtualDecoPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: decoKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, prev) {
        const pagDecos = tr.getMeta("virtualPageDecorations") as DecorationSet | undefined;
        if (pagDecos !== undefined) return pagDecos;
        if (tr.getMeta("virtualizationScroll")) return DecorationSet.empty;
        if (tr.docChanged) return prev.map(tr.mapping, tr.doc);
        return prev;
      },
    },
    props: {
      decorations(state) {
        return decoKey.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}

interface FindMatch {
  blockIndex: number;
  charStart: number;
  charEnd: number;
}

interface EditorHandle {
  vp: VirtualViewport;
  view: EditorView;
  prevDoc: PMNode;
  scrollEl: HTMLDivElement;
  topSpacer: HTMLDivElement;
  bottomSpacer: HTMLDivElement;
}

function doUpdateSpacers(h: EditorHandle): void {
  h.topSpacer.style.height = h.vp.heights.offsetBefore(h.vp.range.start) + "px";
  h.bottomSpacer.style.height = h.vp.heights.offsetAfter(h.vp.range.end) + "px";
}

function doRebuild(h: EditorHandle, newRange: { start: number; end: number }): void {
  h.vp.range = newRange;
  const newDoc = buildWindowDoc(h.vp);

  const tr = h.view.state.tr;
  tr.replaceWith(0, h.view.state.doc.content.size, newDoc.content);
  tr.setMeta("addToHistory", false);
  tr.setMeta("virtualizationScroll", true);
  h.view.dispatch(tr);

  h.prevDoc = h.view.state.doc;
  doUpdateSpacers(h);

  requestAnimationFrame(() => {
    h.vp.measureVisible(h.view.dom);
    doUpdateSpacers(h);
  });
}

function scrollViewportHeight(el: HTMLElement): number {
  return el.clientHeight || el.offsetHeight || 800;
}

function doHandleScroll(h: EditorHandle): void {
  const scrollTop = h.scrollEl.scrollTop;
  const viewportHeight = scrollViewportHeight(h.scrollEl);
  const newRange = h.vp.computeRange(scrollTop, viewportHeight);

  if (newRange.start !== h.vp.range.start || newRange.end !== h.vp.range.end) {
    doRebuild(h, newRange);
  }
}

function doScrollToBlock(h: EditorHandle, blockIndex: number): void {
  const targetOffset = h.vp.heights.offsetBefore(blockIndex);
  const viewportHeight = scrollViewportHeight(h.scrollEl);
  const newRange = h.vp.computeRange(targetOffset, viewportHeight);
  if (newRange.start !== h.vp.range.start || newRange.end !== h.vp.range.end) {
    doRebuild(h, newRange);
  }
  h.scrollEl.scrollTop = targetOffset;
}

function doHighlightMatch(h: EditorHandle, match: FindMatch): void {
  requestAnimationFrame(() => {
    const pmIndex = match.blockIndex - h.vp.range.start;
    if (pmIndex < 0 || pmIndex >= h.view.state.doc.childCount) return;
    let pos = 0;
    for (let i = 0; i < pmIndex; i++) pos += h.view.state.doc.child(i).nodeSize;
    pos += 1 + match.charStart;
    const endPos = pos + (match.charEnd - match.charStart);
    try {
      const sel = TextSelection.create(h.view.state.doc, pos, endPos);
      h.view.dispatch(h.view.state.tr.setSelection(sel).scrollIntoView());
      h.view.focus();
    } catch {
      // position out of range
    }
  });
}

export function VirtualizedScriptEditor({
  initialDocument,
  profile = usFeatureProfile,
  onChange,
  paginationWorker,
}: VirtualizedScriptEditorProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const topSpacerRef = useRef<HTMLDivElement | null>(null);
  const bottomSpacerRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<EditorHandle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findMatches, setFindMatches] = useState<FindMatch[]>([]);
  const [findCurrent, setFindCurrent] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const scroll = scrollRef.current;
    const topSpacer = topSpacerRef.current;
    const bottomSpacer = bottomSpacerRef.current;
    if (!mount || !scroll || !topSpacer || !bottomSpacer) return;

    const blocks: Block[] =
      initialDocument.blocks.length > 0
        ? [...initialDocument.blocks]
        : [{ id: crypto.randomUUID(), type: "action" as const, text: "", marks: [], attrs: {} }];

    const vp = new VirtualViewport(blocks);
    const initialRange = vp.computeRange(0, scroll.clientHeight || 800);
    vp.range = initialRange;
    const doc = buildWindowDoc(vp);

    const plugins = elementBehaviorPlugins(profile);
    plugins.push(virtualDecoPlugin());
    const state = EditorState.create({ doc, plugins });

    const h: EditorHandle = {
      vp,
      view: null!,
      prevDoc: doc,
      scrollEl: scroll,
      topSpacer,
      bottomSpacer,
    };

    const view = new EditorView(mount, {
      state,
      dispatchTransaction(tr: Transaction) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        if (tr.docChanged && !tr.getMeta("virtualizationScroll")) {
          vp.syncEdits(h.prevDoc, newState.doc);
          h.prevDoc = newState.doc;
          doUpdateSpacers(h);
          onChangeRef.current?.({ blocks: [...vp.blocks] });

          if (pagTimer) clearTimeout(pagTimer);
          pagTimer = setTimeout(sendPagination, PAGINATION_DEBOUNCE_MS);
        }
        if (tr.getMeta("virtualizationScroll")) {
          h.prevDoc = newState.doc;
        }
      },
    });
    h.view = view;
    handleRef.current = h;

    doUpdateSpacers(h);
    requestAnimationFrame(() => {
      vp.measureVisible(view.dom);
      doUpdateSpacers(h);
    });

    // Pagination
    let pagTimer: ReturnType<typeof setTimeout> | null = null;
    let pagSeq = 0;

    function sendPagination(): void {
      if (!paginationWorker) return;
      const seq = ++pagSeq;
      try {
        paginationWorker.postMessage({ type: "paginate", blocks: vp.blocks, fromBlockIndex: 0, seq } as PaginateRequest);
      } catch { /* dead worker */ }
    }

    let onPagMessage: ((e: MessageEvent<PaginateResponse>) => void) | null = null;
    if (paginationWorker) {
      onPagMessage = (e: MessageEvent<PaginateResponse>) => {
        if (e.data.seq < pagSeq) return;
        const decos = buildPageDecorations(view.state.doc, e.data.pageMap);
        view.dispatch(view.state.tr.setMeta("virtualPageDecorations", decos));
      };
      paginationWorker.addEventListener("message", onPagMessage);
      sendPagination();
    }

    // Scroll — throttled to one update per frame via rAF with setTimeout fallback
    let scrollPending = false;
    const onScroll = () => {
      if (scrollPending) return;
      scrollPending = true;
      const tick = () => {
        scrollPending = false;
        doHandleScroll(h);
      };
      if (typeof requestAnimationFrame === "function" && window.innerHeight > 0) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(tick, 0);
      }
    };
    scroll.addEventListener("scroll", onScroll, { passive: true });

    // ⌘F intercept
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setFindVisible((v) => {
          if (!v) setTimeout(() => findInputRef.current?.focus(), 0);
          return !v;
        });
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      view.destroy();
      handleRef.current = null;
      scroll.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onKeyDown);
      if (paginationWorker && onPagMessage) paginationWorker.removeEventListener("message", onPagMessage);
      if (pagTimer) clearTimeout(pagTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run find when query changes
  useEffect(() => {
    const h = handleRef.current;
    if (!h || !findQuery) {
      setFindMatches([]);
      setFindCurrent(0);
      return;
    }
    const lower = findQuery.toLowerCase();
    const matches: FindMatch[] = [];
    for (let i = 0; i < h.vp.blocks.length; i++) {
      const text = h.vp.blocks[i]!.text.toLowerCase();
      let pos = 0;
      while (pos < text.length) {
        const idx = text.indexOf(lower, pos);
        if (idx === -1) break;
        matches.push({ blockIndex: i, charStart: idx, charEnd: idx + findQuery.length });
        pos = idx + 1;
      }
    }
    setFindMatches(matches);
    setFindCurrent(0);
    if (matches.length > 0) {
      doScrollToBlock(h, matches[0]!.blockIndex);
      doHighlightMatch(h, matches[0]!);
    }
  }, [findQuery]);

  function navigateMatch(delta: number): void {
    const h = handleRef.current;
    if (!h || findMatches.length === 0) return;
    const next = ((findCurrent + delta) % findMatches.length + findMatches.length) % findMatches.length;
    setFindCurrent(next);
    const match = findMatches[next]!;
    doScrollToBlock(h, match.blockIndex);
    doHighlightMatch(h, match);
  }

  function closeFind(): void {
    setFindVisible(false);
    setFindQuery("");
    setFindMatches([]);
    handleRef.current?.view.focus();
  }

  return (
    <div className="script-editor virtualized" data-testid="script-editor">
      <div
        ref={scrollRef}
        className="script-editor-scroll"
        data-testid="virtual-scroll-container"
        style={{ position: "relative", height: "80vh", overflow: "auto" }}
      >
        {findVisible && (
          <div
            data-testid="find-bar"
            style={{
              display: "flex",
              position: "sticky",
              top: 0,
              zIndex: 10,
              background: "#fff",
              borderBottom: "1px solid #ddd",
              padding: "4px 8px",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <input
              ref={findInputRef}
              data-testid="find-input"
              type="text"
              placeholder="Find..."
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); navigateMatch(e.shiftKey ? -1 : 1); }
                else if (e.key === "Escape") { e.preventDefault(); closeFind(); }
              }}
              style={{ padding: "2px 6px", fontSize: "13px", minWidth: "200px" }}
            />
            <button data-testid="find-prev" onClick={() => navigateMatch(-1)} style={{ fontSize: "12px", padding: "2px 6px" }}>
              ▲
            </button>
            <button data-testid="find-next" onClick={() => navigateMatch(1)} style={{ fontSize: "12px", padding: "2px 6px" }}>
              ▼
            </button>
            <span data-testid="find-count" style={{ fontSize: "12px", color: "#888", marginLeft: "4px" }}>
              {findMatches.length > 0 ? `${findCurrent + 1}/${findMatches.length}` : "No results"}
            </span>
            <button
              data-testid="find-close"
              onClick={closeFind}
              style={{ fontSize: "12px", padding: "2px 6px", marginLeft: "auto" }}
            >
              ✕
            </button>
          </div>
        )}
        <div ref={topSpacerRef} data-testid="spacer-top" style={{ height: 0 }} />
        <div ref={mountRef} className="script-editor-content" data-testid="script-editor-content" />
        <div ref={bottomSpacerRef} data-testid="spacer-bottom" style={{ height: 0 }} />
      </div>
    </div>
  );
}
