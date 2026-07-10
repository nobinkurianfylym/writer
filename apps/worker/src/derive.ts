import {
  tokenizeSceneHeading,
  paginate,
  type ScreenplayDocument,
  type FormatProfile,
} from "@fylym/screenplay-core";

/**
 * One derived scene index row (the §3 read-model), keyed by the scene
 * heading's block id so it stays stable across heading edits and reorders.
 */
export interface DerivedScene {
  id: string;
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

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Derives the SceneIndex read-model from a screenplay document: one row per
 * `scene_heading`, spanning every block up to the next heading. Heading
 * INT/EXT + time-of-day come from the E1-4 tokenizer; word counts and
 * character cues are aggregated over the scene body; page span comes from
 * the pagination engine when a profile is supplied.
 */
export function deriveSceneIndex(
  doc: ScreenplayDocument,
  profile?: FormatProfile,
): DerivedScene[] {
  // blockId → 1-based page number of the block's first line.
  const blockPage = new Map<string, number>();
  if (profile) {
    const pageMap = paginate(doc, profile);
    for (const page of pageMap.pages) {
      for (const line of page.lines) {
        if (!blockPage.has(line.blockId)) {
          blockPage.set(line.blockId, page.pageNumber);
        }
      }
    }
  }

  const scenes: DerivedScene[] = [];
  let current: DerivedScene | null = null;
  const currentBlockIds: string[][] = [];

  for (const block of doc.blocks) {
    if (block.type === "scene_heading") {
      const tokens = tokenizeSceneHeading(block.text);
      current = {
        id: block.id,
        position: scenes.length,
        heading: block.text,
        intExt: tokens.sceneType,
        timeOfDay: tokens.time,
        sceneNumber: block.attrs.sceneNumber ?? null,
        wordCount: countWords(block.text),
        characterIds: [],
        pageStart: blockPage.get(block.id) ?? null,
        pageEnd: blockPage.get(block.id) ?? null,
      };
      scenes.push(current);
      currentBlockIds.push([block.id]);
      continue;
    }

    if (!current) continue; // preamble (e.g. title page) before the first scene

    current.wordCount += countWords(block.text);
    currentBlockIds[currentBlockIds.length - 1]!.push(block.id);

    if (block.type === "character") {
      const name = block.text.trim().toUpperCase();
      if (name && !current.characterIds.includes(name)) {
        current.characterIds.push(name);
      }
    }
  }

  // Resolve pageEnd from the last paginated block in each scene.
  if (profile) {
    scenes.forEach((scene, i) => {
      let end = scene.pageStart;
      for (const blockId of currentBlockIds[i]!) {
        const page = blockPage.get(blockId);
        if (page !== undefined && (end === null || page > end)) end = page;
      }
      scene.pageEnd = end;
    });
  }

  return scenes;
}
