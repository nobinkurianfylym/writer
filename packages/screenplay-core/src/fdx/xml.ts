import { XMLBuilder, XMLParser } from "fast-xml-parser";

/** Element names that can legitimately repeat and must always parse to an array, even when there's exactly one. */
const ARRAY_TAGS = new Set(["Paragraph", "Text", "SceneProperties"]);

export function createFdxParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    // Screenplay text and scene/revision numbers must stay strings ("1",
    // not 1) — auto-coercion would corrupt both.
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name) => ARRAY_TAGS.has(name),
  });
}

export function createFdxBuilder(): XMLBuilder {
  return new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    format: true,
    suppressEmptyNode: false,
  });
}

/** A `<Text>` child is a bare string when it has no attributes, or `{ "#text", "@_Style", ... }` when it does. */
export type FdxTextNode = string | { "#text"?: string; [attr: `@_${string}`]: string | undefined };

export function textNodeValue(node: FdxTextNode): string {
  return typeof node === "string" ? node : (node["#text"] ?? "");
}

export function textNodeAttr(node: FdxTextNode, attr: string): string | undefined {
  return typeof node === "string" ? undefined : (node[`@_${attr}`] as string | undefined);
}
