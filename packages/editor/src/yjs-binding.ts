import * as Y from "yjs";
import { ySyncPlugin, yUndoPlugin, undoCommand, redoCommand, prosemirrorToYXmlFragment } from "y-prosemirror";
import { keymap } from "prosemirror-keymap";
import type { Plugin } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import type { TitlePageFields } from "@fylym/screenplay-core";

export interface ScriptYDoc {
  ydoc: Y.Doc;
  contentFragment: Y.XmlFragment;
  meta: Y.Map<unknown>;
  contentUndoManager: Y.UndoManager;
  metaUndoManager: Y.UndoManager;
  destroy: () => void;
}

export interface CreateScriptYDocOptions {
  scriptId: string;
}

export function createScriptYDoc(opts: CreateScriptYDocOptions): ScriptYDoc {
  const ydoc = new Y.Doc({ guid: opts.scriptId });

  const contentFragment = ydoc.getXmlFragment("content");
  const meta = ydoc.getMap("meta");

  const contentUndoManager = new Y.UndoManager(contentFragment, {
    captureTimeout: 300,
  });

  const metaUndoManager = new Y.UndoManager(meta, {
    captureTimeout: 300,
  });

  return {
    ydoc,
    contentFragment,
    meta,
    contentUndoManager,
    metaUndoManager,
    destroy() {
      contentUndoManager.destroy();
      metaUndoManager.destroy();
      ydoc.destroy();
    },
  };
}

export function initContentFromPmDoc(scriptYDoc: ScriptYDoc, doc: PMNode): void {
  prosemirrorToYXmlFragment(doc, scriptYDoc.contentFragment);
}

export function yjsPlugins(scriptYDoc: ScriptYDoc): Plugin[] {
  const syncPlugin = ySyncPlugin(scriptYDoc.contentFragment);

  const undoPlugin = yUndoPlugin({
    undoManager: scriptYDoc.contentUndoManager,
  });

  const undoKeymap = keymap({
    "Mod-z": undoCommand,
    "Mod-y": redoCommand,
    "Mod-Shift-z": redoCommand,
  });

  return [syncPlugin, undoPlugin, undoKeymap];
}

export function setMeta(meta: Y.Map<unknown>, key: string, value: unknown): void {
  meta.set(key, value);
}

export function getMeta(meta: Y.Map<unknown>, key: string): unknown {
  return meta.get(key);
}

export function setTitlePageFields(meta: Y.Map<unknown>, fields: TitlePageFields): void {
  meta.doc!.transact(() => {
    for (const [k, v] of Object.entries(fields)) {
      meta.set(`titlePage.${k}`, v);
    }
  });
}

export function getTitlePageFields(meta: Y.Map<unknown>): TitlePageFields {
  return {
    title: (meta.get("titlePage.title") as string) ?? "",
    credit: (meta.get("titlePage.credit") as string) ?? "",
    author: (meta.get("titlePage.author") as string) ?? "",
    source: (meta.get("titlePage.source") as string) ?? "",
    draftDate: (meta.get("titlePage.draftDate") as string) ?? "",
    contact: (meta.get("titlePage.contact") as string) ?? "",
    copyright: (meta.get("titlePage.copyright") as string) ?? "",
    notes: (meta.get("titlePage.notes") as string) ?? "",
    revision: (meta.get("titlePage.revision") as string) ?? "",
  };
}

export function setFormatProfileName(meta: Y.Map<unknown>, name: string): void {
  meta.set("formatProfile", name);
}

export function getFormatProfileName(meta: Y.Map<unknown>): string | null {
  return (meta.get("formatProfile") as string) ?? null;
}

export function observeMeta(
  meta: Y.Map<unknown>,
  callback: (changedKeys: string[]) => void,
): () => void {
  const handler = (event: Y.YMapEvent<unknown>) => {
    const keys = Array.from(event.keysChanged);
    callback(keys);
  };
  meta.observe(handler);
  return () => meta.unobserve(handler);
}

export { undoCommand as yjsUndo, redoCommand as yjsRedo };
