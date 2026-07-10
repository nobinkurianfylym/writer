import { hydrateFromYUpdate } from "@fylym/editor/headless";
import type { DeriveJobData } from "@fylym/contracts";
import { deriveSceneIndex, type DerivedScene } from "../derive.js";
import { resolveProfile } from "../export.js";
import type { ProgressReporter } from "./demo.js";

/** The slice of Prisma the derive processor needs (mockable in tests). */
export interface SceneIndexWriter {
  script: {
    findUnique(args: {
      where: { id: string };
      select: { ydocState: boolean; formatProfile: boolean; deletedAt: boolean };
    }): Promise<{
      ydocState: Uint8Array | null;
      formatProfile: string;
      deletedAt: Date | null;
    } | null>;
  };
  sceneIndex: {
    deleteMany(args: {
      where: { scriptId: string; id?: { notIn: string[] } };
    }): Promise<{ count: number }>;
    upsert(args: {
      where: { id: string };
      create: SceneIndexRow;
      update: Omit<SceneIndexRow, "id" | "scriptId">;
    }): Promise<unknown>;
  };
}

export interface SceneIndexRow {
  id: string;
  scriptId: string;
  position: number;
  heading: string;
  intExt: string | null;
  timeOfDay: string | null;
  sceneNumber: string | null;
  wordCount: number;
  characterIds: string[];
  pageStart: number | null;
  pageEnd: number | null;
}

export interface DeriveProcessorDeps {
  db: SceneIndexWriter;
}

function toRow(scriptId: string, scene: DerivedScene): SceneIndexRow {
  return {
    id: scene.id,
    scriptId,
    position: scene.position,
    heading: scene.heading,
    intExt: scene.intExt,
    timeOfDay: scene.timeOfDay,
    sceneNumber: scene.sceneNumber,
    wordCount: scene.wordCount,
    characterIds: scene.characterIds,
    pageStart: scene.pageStart,
    pageEnd: scene.pageEnd,
  };
}

/**
 * Rebuilds a script's SceneIndex from its persisted Yjs state. Reconciles
 * idempotently: rows keyed by the scene heading's block id are upserted, and
 * rows for scenes no longer present are removed — so heading edits mutate a
 * row in place, reorders update `position`, and deletions prune cleanly.
 */
export async function runDeriveJob(
  data: DeriveJobData,
  job: ProgressReporter,
  deps: DeriveProcessorDeps,
): Promise<{ scriptId: string; sceneCount: number }> {
  await job.updateProgress(10);

  const script = await deps.db.script.findUnique({
    where: { id: data.scriptId },
    select: { ydocState: true, formatProfile: true, deletedAt: true },
  });

  if (!script || script.deletedAt) {
    throw new Error(`Script not found: ${data.scriptId}`);
  }
  if (!script.ydocState) {
    throw new Error(`Script has no stored state: ${data.scriptId}`);
  }

  await job.updateProgress(35);
  const { document } = hydrateFromYUpdate(new Uint8Array(script.ydocState));

  const profile = resolveProfile(script.formatProfile);
  const scenes = deriveSceneIndex(document, profile);
  const rows = scenes.map((s) => toRow(data.scriptId, s));

  await job.updateProgress(60);

  // Prune rows for scenes that no longer exist.
  await deps.db.sceneIndex.deleteMany({
    where: {
      scriptId: data.scriptId,
      ...(rows.length > 0 && { id: { notIn: rows.map((r) => r.id) } }),
    },
  });

  // Upsert each current scene.
  for (const row of rows) {
    const { id: _id, scriptId: _scriptId, ...mutable } = row;
    void _id;
    void _scriptId;
    await deps.db.sceneIndex.upsert({
      where: { id: row.id },
      create: row,
      update: mutable,
    });
  }

  await job.updateProgress(100);
  return { scriptId: data.scriptId, sceneCount: rows.length };
}
