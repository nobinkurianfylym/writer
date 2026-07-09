import * as Y from "yjs";
import type { ScriptYDoc } from "./yjs-binding.js";

const SNAPSHOTS_DB_PREFIX = "fylym-snapshots-";
const STORE_NAME = "snapshots";
const MAX_SNAPSHOTS = 30;
const AUTO_INTERVAL_MS = 10 * 60 * 1000;

export interface SnapshotEntry {
  id: string;
  timestamp: number;
  sceneHeading: string | null;
  state: Uint8Array;
}

export interface SnapshotListItem {
  id: string;
  timestamp: number;
  sceneHeading: string | null;
}

function snapshotDbName(scriptId: string): string {
  return `${SNAPSHOTS_DB_PREFIX}${scriptId}`;
}

function extractFirstSceneHeading(fragment: Y.XmlFragment): string | null {
  for (let i = 0; i < fragment.length; i++) {
    const el = fragment.get(i);
    if (el instanceof Y.XmlElement && el.nodeName === "scene_heading") {
      const child = el.get(0);
      if (child instanceof Y.XmlText) {
        const text = child.toString().trim();
        if (text) return text;
      }
    }
  }
  return null;
}

function openSnapshotDb(scriptId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(snapshotDbName(scriptId), 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function takeSnapshot(scriptYDoc: ScriptYDoc, scriptId: string): Promise<SnapshotEntry> {
  const state = Y.encodeStateAsUpdate(scriptYDoc.ydoc);
  const sceneHeading = extractFirstSceneHeading(scriptYDoc.contentFragment);

  const entry: SnapshotEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    sceneHeading,
    state,
  };

  const db = await openSnapshotDb(scriptId);
  try {
    await idbPut(db, entry);
    await trimSnapshots(db);
  } finally {
    db.close();
  }

  return entry;
}

function idbPut(db: IDBDatabase, entry: SnapshotEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function trimSnapshots(db: IDBDatabase): Promise<void> {
  const all = await idbGetAll(db);
  if (all.length <= MAX_SNAPSHOTS) return;

  all.sort((a, b) => a.timestamp - b.timestamp);
  const toDelete = all.slice(0, all.length - MAX_SNAPSHOTS);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const entry of toDelete) {
      store.delete(entry.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<SnapshotEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as SnapshotEntry[]);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, id: string): Promise<SnapshotEntry | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as SnapshotEntry | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function listSnapshots(scriptId: string): Promise<SnapshotListItem[]> {
  const db = await openSnapshotDb(scriptId);
  try {
    const all = await idbGetAll(db);
    all.sort((a, b) => b.timestamp - a.timestamp);
    return all.map(({ id, timestamp, sceneHeading }) => ({ id, timestamp, sceneHeading }));
  } finally {
    db.close();
  }
}

export async function restoreSnapshot(
  scriptYDoc: ScriptYDoc,
  scriptId: string,
  snapshotId: string,
): Promise<{ preRestoreSnapshotId: string } | null> {
  const db = await openSnapshotDb(scriptId);
  try {
    const entry = await idbGet(db, snapshotId);
    if (!entry) return null;

    const preRestore = await takeSnapshot(scriptYDoc, scriptId);

    const freshDoc = new Y.Doc();
    Y.applyUpdate(freshDoc, entry.state);
    const snapFragment = freshDoc.getXmlFragment("content");
    const snapMeta = freshDoc.getMap("meta");

    scriptYDoc.ydoc.transact(() => {
      if (scriptYDoc.contentFragment.length > 0) {
        scriptYDoc.contentFragment.delete(0, scriptYDoc.contentFragment.length);
      }

      const items: Y.XmlElement[] = [];
      for (let i = 0; i < snapFragment.length; i++) {
        const el = snapFragment.get(i);
        if (el instanceof Y.XmlElement) {
          const clone = new Y.XmlElement(el.nodeName);
          for (const [k, v] of Object.entries(el.getAttributes() as Record<string, string>)) {
            clone.setAttribute(k, v);
          }
          items.push(clone);
        }
      }
      scriptYDoc.contentFragment.insert(0, items);

      for (let i = 0; i < items.length; i++) {
        const srcEl = snapFragment.get(i);
        if (srcEl instanceof Y.XmlElement) {
          const srcText = srcEl.get(0);
          if (srcText instanceof Y.XmlText) {
            const dstEl = scriptYDoc.contentFragment.get(i);
            if (dstEl instanceof Y.XmlElement) {
              const dstText = dstEl.get(0);
              if (dstText instanceof Y.XmlText) {
                dstText.insert(0, srcText.toString());
              } else {
                dstEl.insert(0, [new Y.XmlText(srcText.toString())]);
              }
            }
          }
        }
      }

      for (const [k] of scriptYDoc.meta.entries()) {
        scriptYDoc.meta.delete(k);
      }
      for (const [k, v] of snapMeta.entries()) {
        scriptYDoc.meta.set(k, v);
      }
    });

    freshDoc.destroy();

    return { preRestoreSnapshotId: preRestore.id };
  } finally {
    db.close();
  }
}

export async function clearSnapshots(scriptId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(snapshotDbName(scriptId));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export interface AutoSnapshotHandle {
  stop: () => void;
  takeNow: () => Promise<SnapshotEntry>;
}

export function startAutoSnapshots(
  scriptYDoc: ScriptYDoc,
  scriptId: string,
  intervalMs: number = AUTO_INTERVAL_MS,
): AutoSnapshotHandle {
  let hasActivity = false;
  let stopped = false;

  const observer = () => {
    hasActivity = true;
  };
  scriptYDoc.ydoc.on("update", observer);

  const timer = setInterval(async () => {
    if (stopped) return;
    if (hasActivity) {
      hasActivity = false;
      try {
        await takeSnapshot(scriptYDoc, scriptId);
      } catch {
        // snapshot failure is non-fatal
      }
    }
  }, intervalMs);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      scriptYDoc.ydoc.off("update", observer);
    },
    async takeNow() {
      hasActivity = false;
      return takeSnapshot(scriptYDoc, scriptId);
    },
  };
}
