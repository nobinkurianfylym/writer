import type { Block } from "@fylym/screenplay-core";
import type { Beat } from "@/lib/beats";

/**
 * Import-to-Script: mirrors the beat board into the screenplay body as
 * editable outline markers — one `section` block per act, one `synopsis`
 * block per beat. Markers are tagged through `attrs.passthrough.fylymOutline`
 * so a re-import can find them again wherever the writer has moved them:
 * matching markers are updated in place, new beats are inserted next to
 * their neighbours, and markers whose beat/act no longer exists on the
 * board are removed. Untagged blocks (the actual screenplay) are never
 * touched.
 */

/** The tag a marker block carries in `attrs.passthrough.fylymOutline`. */
export interface OutlineTag {
  /** Present on act markers: the act name at import time. */
  act?: string;
  /** Present on beat markers: the beat's stable board id. */
  beatId?: string;
}

interface DesiredMarker {
  key: string;
  type: "section" | "synopsis";
  text: string;
  tag: OutlineTag;
}

export interface OutlineMergeResult {
  blocks: Block[];
  added: number;
  updated: number;
  removed: number;
}

function markerText(beat: Beat): string {
  const summary = beat.summary.trim();
  return summary ? `${beat.title} — ${summary}` : beat.title;
}

/** The marker sequence the board currently calls for, in board order. */
function desiredMarkers(beats: Beat[]): DesiredMarker[] {
  const markers: DesiredMarker[] = [];
  const seenActs = new Set<string>();
  for (const beat of beats) {
    if (!seenActs.has(beat.act)) {
      seenActs.add(beat.act);
      markers.push({
        key: `act:${beat.act}`,
        type: "section",
        text: beat.act,
        tag: { act: beat.act },
      });
    }
    markers.push({
      key: `beat:${beat.id}`,
      type: "synopsis",
      text: markerText(beat),
      tag: { beatId: beat.id },
    });
  }
  return markers;
}

/** Reads a block's outline tag key, or null for ordinary screenplay blocks. */
export function outlineKey(block: Block): string | null {
  const tag = block.attrs.passthrough?.fylymOutline as OutlineTag | undefined;
  if (!tag) return null;
  if (tag.beatId) return `beat:${tag.beatId}`;
  if (tag.act) return `act:${tag.act}`;
  return null;
}

function newMarkerBlock(marker: DesiredMarker): Block {
  return {
    id: crypto.randomUUID(),
    type: marker.type,
    text: marker.text,
    marks: [],
    attrs: { passthrough: { fylymOutline: marker.tag } },
  };
}

/**
 * Weaves the board's outline into the screenplay body. Pure — returns new
 * arrays/blocks, never mutates the input.
 */
export function mergeOutline(body: Block[], beats: Beat[]): OutlineMergeResult {
  const desired = desiredMarkers(beats);
  const desiredKeys = new Set(desired.map((m) => m.key));

  // Drop markers whose beat/act is gone from the board.
  let removed = 0;
  const blocks: Block[] = body.filter((block) => {
    const key = outlineKey(block);
    if (key !== null && !desiredKeys.has(key)) {
      removed += 1;
      return false;
    }
    return true;
  });

  let added = 0;
  let updated = 0;
  // Index in `blocks` of the last marker placed; new markers go right after
  // it so an act's beats land under their act heading.
  let lastPlaced = -1;
  for (const marker of desired) {
    const existing = blocks.findIndex((b) => outlineKey(b) === marker.key);
    if (existing >= 0) {
      const block = blocks[existing];
      if (block && (block.text !== marker.text || block.type !== marker.type)) {
        blocks[existing] = { ...block, type: marker.type, text: marker.text };
        updated += 1;
      }
      lastPlaced = existing;
    } else {
      const at = lastPlaced + 1;
      blocks.splice(at, 0, newMarkerBlock(marker));
      added += 1;
      lastPlaced = at;
    }
  }

  return { blocks, added, updated, removed };
}
