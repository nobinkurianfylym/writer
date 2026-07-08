import type { Block, BlockAttrs, DualColumn, ScreenplayDocument } from "../model.js";
import { blockTypeForFdx } from "./paragraph-types.js";
import { decodeTextRuns, type FdxTextRun } from "./styles.js";
import { createFdxParser, textNodeAttr, textNodeValue, type FdxTextNode } from "./xml.js";

// Web Crypto's randomUUID is a global in both browsers and Node 19+ — no
// node:crypto import needed, keeping this package dependency-light.
function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Pretty-printed FDX (real Final Draft output included) has whitespace-only
 * `#text` siblings between child elements — an artifact of indentation, not
 * authored content. With `trimValues: false` (needed to protect real text
 * content like leading/trailing-space dialogue) these would otherwise be
 * captured as bogus "unrecognized content" by the passthrough logic below.
 */
function isWhitespaceOnlyTextNode(key: string, value: unknown): boolean {
  return key === "#text" && typeof value === "string" && value.trim() === "";
}

const KNOWN_PARAGRAPH_ATTRS = new Set([
  "@_Type",
  "@_Number",
  "@_Revision",
  "@_Locked",
  "@_FylymType",
  "@_FylymDualColumn",
]);

function toRuns(textNodes: FdxTextNode[]): FdxTextRun[] {
  if (textNodes.length === 0) return [{ text: "" }];
  return textNodes.map((node) => ({
    text: textNodeValue(node),
    style: textNodeAttr(node, "Style"),
    revisionColor: textNodeAttr(node, "RevisionColor"),
  }));
}

function parseParagraph(p: Record<string, unknown>, dualColumn: DualColumn | undefined): Block {
  const fdxType = (p["@_Type"] as string | undefined) ?? "Action";
  const fylymType = p["@_FylymType"] as string | undefined;
  const type = blockTypeForFdx(fdxType, fylymType);

  const { text, marks } = decodeTextRuns(toRuns((p.Text ?? []) as FdxTextNode[]));

  const attrs: BlockAttrs = {};
  if (dualColumn) attrs.dualColumn = dualColumn;
  const sceneNumber = p["@_Number"] as string | undefined;
  if (sceneNumber !== undefined) attrs.sceneNumber = sceneNumber;
  const revision = p["@_Revision"] as string | undefined;
  if (revision !== undefined) attrs.revision = revision;
  if (p["@_Locked"] === "Yes") attrs.locked = true;

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(p)) {
    if (key === "Text" || key === "DualDialogue") continue;
    if (key.startsWith("@_") && KNOWN_PARAGRAPH_ATTRS.has(key)) continue;
    if (isWhitespaceOnlyTextNode(key, value)) continue;
    extra[key] = value;
  }
  if (Object.keys(extra).length > 0) attrs.passthrough = { fdxParagraph: extra };

  return { id: newId(), type, text, marks, attrs };
}

/**
 * Splits a DualDialogue block's children into left/right columns. Prefers
 * our own FylymDualColumn tiebreaker (written by serializeFdx); falls back
 * to a positional heuristic — everything before the second Character
 * paragraph is "left" — for genuine Final Draft files, which don't carry
 * that attribute. This covers the overwhelmingly common two-character case;
 * see the E1-7 human-verification note about real FDX dual-dialogue shape.
 */
function inferColumn(inner: Record<string, unknown>[], idx: number): DualColumn {
  const explicit = inner[idx]?.["@_FylymDualColumn"];
  if (explicit === "left" || explicit === "right") return explicit;

  let characterCount = 0;
  let splitIndex = inner.length;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i]?.["@_Type"] === "Character") {
      characterCount++;
      if (characterCount === 2) {
        splitIndex = i;
        break;
      }
    }
  }
  return idx < splitIndex ? "left" : "right";
}

function parseParagraphOrDualDialogue(p: Record<string, unknown>): Block[] {
  const dual = p.DualDialogue as Record<string, unknown> | undefined;
  if (dual) {
    const inner = (dual.Paragraph ?? []) as Record<string, unknown>[];
    const marker: Block = { id: newId(), type: "dual_dialogue", text: "", marks: [], attrs: {} };
    const columnBlocks = inner.map((child, idx) => parseParagraph(child, inferColumn(inner, idx)));
    return [marker, ...columnBlocks];
  }
  return [parseParagraph(p, undefined)];
}

/**
 * Final Draft's title page is a structurally separate section (its own
 * `<Content>` under `<TitlePage>`, not Fountain-style `Key: Value` lines).
 * We fold it into one `title_page` Block (newline-joined paragraph text) and
 * stash the raw paragraph nodes in `attrs.passthrough` so a direct
 * parse-then-serialize round-trip reproduces the original markup exactly;
 * without that passthrough (e.g. a document authored by us from scratch),
 * serializeFdx degrades to plain centered text paragraphs.
 */
function parseTitlePage(titlePage: Record<string, unknown>): Block[] {
  const content = (titlePage.Content ?? {}) as Record<string, unknown>;
  const paragraphs = (content.Paragraph ?? []) as Record<string, unknown>[];
  if (paragraphs.length === 0) return [];

  const lines = paragraphs.map((p) => (p.Text as FdxTextNode[] | undefined)?.map(textNodeValue).join("") ?? "");

  return [
    {
      id: newId(),
      type: "title_page",
      text: lines.join("\n"),
      marks: [],
      attrs: { passthrough: { fdxTitlePageParagraphs: paragraphs } },
    },
  ];
}

function buildDocumentPassthrough(
  finalDraft: Record<string, unknown>,
  content: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const rootAttrs: Record<string, unknown> = {};
  const otherRootKeys: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(finalDraft)) {
    if (isWhitespaceOnlyTextNode(key, value)) continue;
    if (key.startsWith("@_")) rootAttrs[key] = value;
    else if (key !== "Content" && key !== "TitlePage") otherRootKeys[key] = value;
  }
  const contentAttrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (isWhitespaceOnlyTextNode(key, value)) continue;
    if (key.startsWith("@_")) contentAttrs[key] = value;
  }
  if (
    Object.keys(rootAttrs).length === 0 &&
    Object.keys(otherRootKeys).length === 0 &&
    Object.keys(contentAttrs).length === 0
  ) {
    return undefined;
  }
  return { fdxRootAttrs: rootAttrs, fdxOtherRootKeys: otherRootKeys, fdxContentAttrs: contentAttrs };
}

/**
 * Parses Final Draft XML (.fdx) into a ScreenplayDocument. Unrecognized
 * attributes/elements are preserved in `passthrough` fields rather than
 * discarded, per FDX's defensive-parser expectations. Input that isn't
 * well-formed XML at all degrades to an empty document rather than
 * throwing — a defensive parser shouldn't crash the app on a corrupt file.
 */
export function parseFdx(source: string): ScreenplayDocument {
  const parser = createFdxParser();
  let root: Record<string, unknown>;
  try {
    root = parser.parse(source) as Record<string, unknown>;
  } catch {
    return { blocks: [] };
  }
  const finalDraft = (root.FinalDraft ?? {}) as Record<string, unknown>;

  const blocks: Block[] = [];

  const titlePage = finalDraft.TitlePage as Record<string, unknown> | undefined;
  if (titlePage) blocks.push(...parseTitlePage(titlePage));

  const content = (finalDraft.Content ?? {}) as Record<string, unknown>;
  const paragraphs = (content.Paragraph ?? []) as Record<string, unknown>[];
  for (const p of paragraphs) blocks.push(...parseParagraphOrDualDialogue(p));

  const passthrough = buildDocumentPassthrough(finalDraft, content);
  return passthrough ? { blocks, passthrough } : { blocks };
}
