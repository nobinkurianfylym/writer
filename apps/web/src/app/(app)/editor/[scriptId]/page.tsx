"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ScriptEditor } from "@fylym/editor";
import type { Block, ScreenplayDocument } from "@fylym/screenplay-core";
import { useScriptDoc } from "@/lib/use-script-doc";
import { SyncIndicator } from "@/components/editor/sync-indicator";
import { TitlePageSheet } from "@/components/editor/title-page-sheet";
import { SnapshotMenu } from "@/components/editor/snapshot-menu";
import { ExportDialog } from "@/components/editor/export-dialog";

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

  const bodyDocument = useMemo<ScreenplayDocument>(
    () => ({ blocks: bodyRef.current }),
    [],
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
        </div>
        <div className="flex items-center gap-2">
          <TitlePageSheet block={titleBlock} onChange={handleTitleChange} />
          <SnapshotMenu scriptId={scriptId} onRestored={onRestored} />
          <ExportDialog scriptId={scriptId} />
        </div>
      </div>

      <div className="flex-1 px-4 py-6">
        <ScriptEditor
          initialDocument={bodyDocument}
          paginationWorker={worker ?? undefined}
          onChange={handleBodyChange}
        />
      </div>
    </div>
  );
}
