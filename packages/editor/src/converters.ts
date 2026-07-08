import type { Node as PMNode, Mark as PMMark } from "prosemirror-model";
import type { Block, BlockAttrs, BlockType, MarkKind, MarkRange } from "@fylym/screenplay-core";
import { screenplaySchema } from "./schema.js";

// Web Crypto's randomUUID is a global in both browsers and Node 19+ — no
// node:crypto import needed, matching screenplay-core's own convention.
function newId(): string {
  return globalThis.crypto.randomUUID();
}

interface Run {
  text: string;
  kinds: Set<MarkKind>;
  revisionColor?: string;
}

function sameKinds(a: Set<MarkKind>, b: Set<MarkKind>): boolean {
  return a.size === b.size && [...a].every((k) => b.has(k));
}

/**
 * Splits a block's text into maximal spans of identical active marks — the
 * interval-overlay a text-node-based representation needs, since ProseMirror
 * expresses marks as a set attached to each text node rather than as
 * standalone ranges. Same algorithm as screenplay-core's fdx/styles.ts and
 * pdf-typesetter's runs.ts, duplicated rather than shared since each output
 * shape (FDX Style string, PDF font selection, PM Mark instances) is
 * genuinely different and none of the three packages should depend on
 * another's internals for it.
 */
function splitIntoRuns(text: string, marks: MarkRange[]): Run[] {
  if (text.length === 0) return [];

  const boundaries = [...new Set([0, text.length, ...marks.flatMap((m) => [m.start, m.end])])]
    .filter((b) => b >= 0 && b <= text.length)
    .sort((a, b) => a - b);

  interface Segment {
    start: number;
    end: number;
    kinds: Set<MarkKind>;
    revisionColor?: string;
  }
  const segments: Segment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    if (start >= end) continue;
    const active = marks.filter((m) => m.start <= start && m.end >= end);
    const kinds = new Set(active.map((m) => m.kind));
    const revisionMark = active.find((m) => m.kind === "revision");
    segments.push({ start, end, kinds, revisionColor: revisionMark?.revisionColor });
  }

  const merged: Segment[] = [];
  for (const seg of segments) {
    const last = merged.at(-1);
    if (last && last.end === seg.start && sameKinds(last.kinds, seg.kinds) && last.revisionColor === seg.revisionColor) {
      last.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged.map((seg) => ({
    text: text.slice(seg.start, seg.end),
    kinds: seg.kinds,
    revisionColor: seg.revisionColor,
  }));
}

function pmMarksForRun(run: Run): PMMark[] {
  return [...run.kinds].map((kind) =>
    kind === "revision"
      ? screenplaySchema.marks.revision!.create({ revisionColor: run.revisionColor ?? null })
      : screenplaySchema.marks[kind]!.create(),
  );
}

function nodeAttrsFromBlock(block: Block): Record<string, unknown> {
  return {
    id: block.id,
    sceneNumber: block.attrs.sceneNumber ?? null,
    revision: block.attrs.revision ?? null,
    locked: block.attrs.locked ?? false,
    dualColumn: block.attrs.dualColumn ?? null,
    elementNumber: block.attrs.elementNumber ?? null,
    passthrough: block.attrs.passthrough ?? null,
  };
}

/** Inverse of `nodeAttrsFromBlock`. `locked: false` is treated as absent (not written), matching `BlockAttrs.locked`'s optional-boolean convention — the two are semantically equivalent, and screenplay-core's own generators never distinguish them. */
function blockAttrsFromNode(node: PMNode): BlockAttrs {
  const a = node.attrs;
  const attrs: BlockAttrs = {};
  if (typeof a.sceneNumber === "string") attrs.sceneNumber = a.sceneNumber;
  if (typeof a.revision === "string") attrs.revision = a.revision;
  if (a.locked === true) attrs.locked = true;
  if (a.dualColumn === "left" || a.dualColumn === "right") attrs.dualColumn = a.dualColumn;
  if (typeof a.elementNumber === "string") attrs.elementNumber = a.elementNumber;
  if (a.passthrough != null) attrs.passthrough = a.passthrough as Record<string, unknown>;
  return attrs;
}

/** Builds a ProseMirror document from a flat Block[] — the exact inverse of `toBlocks`. */
export function toPmDoc(blocks: Block[]): PMNode {
  const blockNodes = blocks.map((block) => {
    const nodeType = screenplaySchema.nodes[block.type];
    if (!nodeType) throw new Error(`No schema node type registered for BlockType "${block.type}"`);
    const content = splitIntoRuns(block.text, block.marks).map((run) => screenplaySchema.text(run.text, pmMarksForRun(run)));
    return nodeType.create(nodeAttrsFromBlock(block), content);
  });
  return screenplaySchema.nodes.doc!.create(null, blockNodes);
}

/** Reconstructs each text-node child's marks into a block's flat `MarkRange[]`, gluing adjacent identically-marked text nodes into one range. */
function blockTextAndMarks(node: PMNode): { text: string; marks: MarkRange[] } {
  let text = "";
  const marks: MarkRange[] = [];
  const open = new Map<MarkKind, { start: number; revisionColor?: string }>();

  node.forEach((child) => {
    const runStart = text.length;
    text += child.isText ? (child.text ?? "") : "";

    const activeKinds = new Set<MarkKind>(child.marks.map((m) => m.type.name as MarkKind));

    for (const [kind, info] of [...open.entries()]) {
      if (!activeKinds.has(kind)) {
        marks.push({
          kind,
          start: info.start,
          end: runStart,
          ...(info.revisionColor !== undefined ? { revisionColor: info.revisionColor } : {}),
        });
        open.delete(kind);
      }
    }
    for (const kind of activeKinds) {
      if (!open.has(kind)) {
        const revisionMark = child.marks.find((m) => m.type.name === "revision");
        const revisionColor = kind === "revision" ? (revisionMark?.attrs.revisionColor ?? undefined) : undefined;
        open.set(kind, { start: runStart, revisionColor });
      }
    }
  });

  for (const [kind, info] of open) {
    marks.push({
      kind,
      start: info.start,
      end: text.length,
      ...(info.revisionColor !== undefined ? { revisionColor: info.revisionColor } : {}),
    });
  }

  return { text, marks };
}

/** Flattens a ProseMirror document back into a Block[] — the exact inverse of `toPmDoc`. */
export function toBlocks(doc: PMNode): Block[] {
  const blocks: Block[] = [];
  doc.forEach((node) => {
    const { text, marks } = blockTextAndMarks(node);
    const id = typeof node.attrs.id === "string" ? node.attrs.id : newId();
    blocks.push({
      id,
      type: node.type.name as BlockType,
      text,
      marks,
      attrs: blockAttrsFromNode(node),
    });
  });
  return blocks;
}
