import { openDB, type IDBPDatabase } from "idb";

/**
 * A tiny IndexedDB key-value store for the latest local `ydocState` per
 * script — the durable, offline-first layer (§5) the editor loads from before
 * ever touching the network.
 */
const DB_NAME = "fylym-editor";
const STORE = "script-state";

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE);
      }
    },
  });
  return dbPromise;
}

export async function idbGetState(
  scriptId: string,
): Promise<Uint8Array | undefined> {
  return (await db()).get(STORE, scriptId) as Promise<Uint8Array | undefined>;
}

export async function idbPutState(
  scriptId: string,
  bytes: Uint8Array,
): Promise<void> {
  await (await db()).put(STORE, bytes, scriptId);
}

export async function idbClearState(scriptId: string): Promise<void> {
  await (await db()).delete(STORE, scriptId);
}
