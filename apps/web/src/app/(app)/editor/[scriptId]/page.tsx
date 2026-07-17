"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ScriptEditor } from "@fylym/editor";
import { toast } from "@fylym/ui";
import type { Block, ScreenplayDocument } from "@fylym/screenplay-core";
import type { Beat } from "@/lib/beats";
import { mergeOutline } from "@/lib/outline";
import { useScriptDoc } from "@/lib/use-script-doc";
import { useTransliterate } from "@/lib/editor-hooks";
import { SyncIndicator } from "@/components/editor/sync-indicator";
import { TitlePageSheet } from "@/components/editor/title-page-sheet";
import { SnapshotMenu } from "@/components/editor/snapshot-menu";
import { ExportDialog } from "@/components/editor/export-dialog";
import { BeatBoard } from "@/components/editor/beat-board";

export default function EditorPage({
  params,
}: {
  params: Promise<{ scriptId: string }>;
}) {
  const { scriptId } = use(params);
  const { initialDocument, status, onChange, reload } = useScriptDoc(scriptId);

  if (!initialDocument) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <SyncIndicator status={status} />
      </div>
    );
  }

  return (
    // Keying on block identity forces a full ScriptEditor remount after a
    // snapshot restore swaps in freshly-reloaded server state.
    <EditorSurface
      key={initialDocument.blocks[0]?.id ?? "empty"}
      scriptId={scriptId}
      initialDocument={initialDocument}
      status={status}
      onChange={onChange}
      onRestored={() => void reload()}
    />
  );
}

function EditorSurface({
  scriptId,
  initialDocument,
  status,
  onChange,
  onRestored,
}: {
  scriptId: string;
  initialDocument: ScreenplayDocument;
  status: ReturnType<typeof useScriptDoc>["status"];
  onChange: (doc: ScreenplayDocument) => void;
  onRestored: () => void;
}) {
  // Split the persisted doc into its title page and body; ScriptEditor edits
  // the body, the title-page sheet edits the title block, and both are merged
  // back together for persistence.
  const titleRef = useRef<Block | null>(
    initialDocument.blocks.find((b) => b.type === "title_page") ?? null,
  );
  const bodyRef = useRef<Block[]>(
    initialDocument.blocks.filter((b) => b.type !== "title_page"),
  );
  const [titleBlock, setTitleBlock] = useState<Block | null>(titleRef.current);

  // Bumped whenever code (not typing) replaces the body wholesale — remounts
  // the ScriptEditor so it picks up the new document.
  const [bodyEpoch, setBodyEpoch] = useState(0);
  const bodyDocument = useMemo<ScreenplayDocument>(
    () => ({ blocks: bodyRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bodyEpoch],
  );

  const saveMerged = useCallback(() => {
    const blocks = [
      ...(titleRef.current ? [titleRef.current] : []),
      ...bodyRef.current,
    ];
    onChange({ blocks });
  }, [onChange]);

  const handleBodyChange = useCallback(
    (doc: ScreenplayDocument) => {
      bodyRef.current = doc.blocks;
      saveMerged();
    },
    [saveMerged],
  );

  const handleTitleChange = useCallback(
    (updated: Block) => {
      titleRef.current = updated;
      setTitleBlock(updated);
      saveMerged();
    },
    [saveMerged],
  );

  const [view, setView] = useState<"script" | "beats">("script");
  const transliterate = useTransliterate();

  const handleImportToScript = useCallback(
    (beats: Beat[]) => {
      if (beats.length === 0) {
        toast.error("Nothing to import — the beat board is empty.");
        return;
      }
      const { blocks, added, updated, removed } = mergeOutline(
        bodyRef.current,
        beats,
      );
      if (added === 0 && updated === 0 && removed === 0) {
        toast.success("Outline is already up to date in the script.");
        setView("script");
        return;
      }
      bodyRef.current = blocks;
      setBodyEpoch((e) => e + 1);
      saveMerged();
      setView("script");
      const parts = [
        added > 0 && `${added} added`,
        updated > 0 && `${updated} updated`,
        removed > 0 && `${removed} removed`,
      ].filter(Boolean);
      toast.success(`Outline imported (${parts.join(", ")}).`);
    },
    [saveMerged],
  );

  // Pagination worker (page ruler); the editor degrades gracefully without it.
  const [worker, setWorker] = useState<Worker | null>(null);
  useEffect(() => {
    let w: Worker | null = null;
    try {
      w = new Worker(
        new URL("../../../../workers/pagination.worker.ts", import.meta.url),
      );
      setWorker(w);
    } catch {
      // no worker → no live page indicators, editor still works
    }
    return () => w?.terminate();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            ← Projects
          </Link>
          <SyncIndicator status={status} />
          <div
            role="tablist"
            aria-label="Editor view"
            className="ml-2 flex items-center rounded-full border bg-card p-0.5 text-sm"
          >
            <button
              role="tab"
              aria-selected={view === "script"}
              onClick={() => setView("script")}
              className={`rounded-full px-3 py-1 transition ${
                view === "script"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Script
            </button>
            <button
              role="tab"
              aria-selected={view === "beats"}
              onClick={() => setView("beats")}
              className={`rounded-full px-3 py-1 transition ${
                view === "beats"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Beats
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TitlePageSheet block={titleBlock} onChange={handleTitleChange} />
          <SnapshotMenu scriptId={scriptId} onRestored={onRestored} />
          <ExportDialog scriptId={scriptId} />
        </div>
      </div>

      {/* Keep the editor mounted (hidden) so switching views never drops its
          in-memory document state. */}
      <div className={`flex-1 px-4 py-6 ${view === "script" ? "" : "hidden"}`}>
        <ScriptEditor
          key={bodyEpoch}
          initialDocument={bodyDocument}
          paginationWorker={worker ?? undefined}
          onChange={handleBodyChange}
          transliterate={transliterate}
        />
      </div>
      {view === "beats" && (
        <div className="flex-1 px-4 py-6">
          <BeatBoard
            scriptId={scriptId}
            onImportToScript={handleImportToScript}
          />
        </div>
      )}
    </div>
  );
}
