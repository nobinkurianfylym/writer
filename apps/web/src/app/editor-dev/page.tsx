"use client";

import { ScriptEditor } from "@fylym/editor";
import type { Block, ScreenplayDocument } from "@fylym/screenplay-core";
import { useEffect, useState } from "react";

const EMPTY_DOCUMENT: ScreenplayDocument = {
  blocks: [{ id: "seed", type: "action", text: "", marks: [], attrs: {} }],
};

function generateLargeDoc(targetPages: number): ScreenplayDocument {
  const blocks: Block[] = [];
  let scene = 0;
  const linesPerPage = 55;
  let approxLines = 0;
  const target = targetPages * linesPerPage;

  while (approxLines < target) {
    scene++;
    blocks.push({ id: crypto.randomUUID(), type: "scene_heading", text: `INT. LOCATION ${scene} - DAY`, marks: [], attrs: {} });
    approxLines += 3;
    blocks.push({
      id: crypto.randomUUID(),
      type: "action",
      text: "Character enters the room and carefully surveys the surroundings, taking in every detail with curiosity.",
      marks: [],
      attrs: {},
    });
    approxLines += 4;
    blocks.push({ id: crypto.randomUUID(), type: "character", text: "CHARACTER", marks: [], attrs: {} });
    approxLines += 2;
    blocks.push({ id: crypto.randomUUID(), type: "dialogue", text: "This is a line of dialogue for this scene.", marks: [], attrs: {} });
    approxLines += 2;
  }
  return { blocks };
}

export default function EditorDevPage() {
  const [state, setState] = useState<{ doc: ScreenplayDocument; worker: Worker | null } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pages = parseInt(params.get("pages") ?? "0", 10);
    const doc = pages > 0 ? generateLargeDoc(pages) : EMPTY_DOCUMENT;

    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("../../workers/pagination.worker.ts", import.meta.url));
    } catch {
      // Worker creation failed — editor degrades gracefully (no page indicators)
    }

    setState({ doc, worker });
    return () => worker?.terminate();
  }, []);

  if (!state) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-6 text-2xl font-semibold">Editor dev harness</h1>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Editor dev harness</h1>
      <ScriptEditor initialDocument={state.doc} paginationWorker={state.worker ?? undefined} />
    </main>
  );
}
