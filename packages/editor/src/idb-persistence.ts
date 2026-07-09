import { IndexeddbPersistence, clearDocument } from "y-indexeddb";
import type { ScriptYDoc } from "./yjs-binding.js";

export type PersistenceStatus = "loading" | "synced" | "error";

export interface StoragePressureWarning {
  type: "quota-exceeded" | "corrupted";
  message: string;
}

export interface ScriptPersistence {
  provider: IndexeddbPersistence;
  status: PersistenceStatus;
  warning: StoragePressureWarning | null;
  whenSynced: Promise<void>;
  destroy: () => Promise<void>;
  clearData: () => Promise<void>;
}

export interface CreatePersistenceOptions {
  scriptId: string;
  scriptYDoc: ScriptYDoc;
  onStatusChange?: (status: PersistenceStatus) => void;
  onWarning?: (warning: StoragePressureWarning) => void;
}

const DB_PREFIX = "fylym-script-";

export function dbNameForScript(scriptId: string): string {
  return `${DB_PREFIX}${scriptId}`;
}

export function createScriptPersistence(opts: CreatePersistenceOptions): ScriptPersistence {
  const dbName = dbNameForScript(opts.scriptId);
  let status: PersistenceStatus = "loading";
  let warning: StoragePressureWarning | null = null;

  const provider = new IndexeddbPersistence(dbName, opts.scriptYDoc.ydoc);

  const result: ScriptPersistence = {
    provider,
    get status() { return status; },
    get warning() { return warning; },
    whenSynced: provider.whenSynced.then(() => {
      status = "synced";
      opts.onStatusChange?.("synced");
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (isQuotaError(msg)) {
        warning = { type: "quota-exceeded", message: "Storage quota exceeded. Your changes may not be saved locally." };
        opts.onWarning?.(warning);
      } else {
        warning = { type: "corrupted", message: "Local data may be corrupted. Falling back to last known good state." };
        opts.onWarning?.(warning);
      }
      status = "error";
      opts.onStatusChange?.("error");
    }),
    async destroy() {
      await provider.destroy();
    },
    async clearData() {
      await provider.clearData();
    },
  };

  const originalStoreUpdate = (provider as unknown as { _storeUpdate: (update: Uint8Array, origin: unknown) => void })._storeUpdate;
  (provider as unknown as { _storeUpdate: (update: Uint8Array, origin: unknown) => void })._storeUpdate = (update: Uint8Array, origin: unknown) => {
    try {
      originalStoreUpdate(update, origin);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isQuotaError(msg)) {
        warning = { type: "quota-exceeded", message: "Storage quota exceeded. Your changes may not be saved locally." };
        status = "error";
        opts.onStatusChange?.("error");
        opts.onWarning?.(warning);
      }
    }
  };

  return result;
}

function isQuotaError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("quota") || lower.includes("storage") || lower.includes("exceeded");
}

export async function clearScriptStorage(scriptId: string): Promise<void> {
  await clearDocument(dbNameForScript(scriptId));
}

export async function hydrateFromIdb(
  scriptYDoc: ScriptYDoc,
  scriptId: string,
): Promise<{ synced: boolean; warning: StoragePressureWarning | null }> {
  const persistence = createScriptPersistence({
    scriptId,
    scriptYDoc,
  });

  try {
    await persistence.whenSynced;
    return { synced: true, warning: persistence.warning };
  } catch {
    return { synced: false, warning: persistence.warning };
  } finally {
    await persistence.destroy();
  }
}
