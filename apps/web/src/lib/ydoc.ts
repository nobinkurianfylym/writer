import * as Y from "yjs";
import { prosemirrorToYXmlFragment } from "y-prosemirror";
import { toPmDoc } from "@fylym/editor";
import { hydrateFromYUpdate } from "@fylym/editor/headless";
import type { Block, ScreenplayDocument } from "@fylym/screenplay-core";

/**
 * Encodes a screenplay document into a Yjs update — the same `ydocState`
 * shape the API stores and the worker hydrates, so the browser, server, and
 * export pipeline all speak one wire format.
 */
export function buildYState(blocks: Block[]): Uint8Array {
  const ydoc = new Y.Doc();
  prosemirrorToYXmlFragment(toPmDoc(blocks), ydoc.getXmlFragment("content"));
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return update;
}

/** Rebuilds the document from a stored Yjs update. */
export function hydrateDocument(update: Uint8Array): ScreenplayDocument {
  return hydrateFromYUpdate(update).document;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
