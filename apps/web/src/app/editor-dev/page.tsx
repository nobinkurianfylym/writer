"use client";

import { ScriptEditor } from "@fylym/editor";
import type { ScreenplayDocument } from "@fylym/screenplay-core";

/**
 * Dev-only harness for exercising <ScriptEditor> outside a real project —
 * the target apps/web renders `pnpm dev`/Playwright drive against for the
 * E2-2 element-behavior plugin (Tab/Enter, smart-type, auto-caps, ⌘1–⌘9).
 * Not linked from anywhere in the app's real navigation.
 */
const EMPTY_DOCUMENT: ScreenplayDocument = {
  blocks: [{ id: "seed", type: "action", text: "", marks: [], attrs: {} }],
};

export default function EditorDevPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Editor dev harness</h1>
      <ScriptEditor initialDocument={EMPTY_DOCUMENT} />
    </main>
  );
}
