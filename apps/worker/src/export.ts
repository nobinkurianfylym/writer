import {
  serializeFountain,
  serializeFdx,
  paginate,
  usFeatureProfile,
  usTvOneHourProfile,
  type ScreenplayDocument,
  type FormatProfile,
} from "@fylym/screenplay-core";
import { renderPdf } from "@fylym/pdf-typesetter";
import type { ExportFormat } from "@fylym/contracts";

export interface ExportArtifact {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
}

/** Export options as they arrive on the job payload — every field optional. */
export interface ExportRunOptions {
  sceneNumbers?: boolean;
  watermark?: string;
  titlePage?: boolean;
}

/** Resolve a script's stored formatProfile name to a concrete profile. */
export function resolveProfile(name: string | undefined): FormatProfile {
  switch (name) {
    case "us-tv-onehour":
      return usTvOneHourProfile;
    case "us-feature":
    default:
      return usFeatureProfile;
  }
}

/**
 * The pure export core: turns a screenplay document into export bytes. Shares
 * the exact `screenplay-core` / `pdf-typesetter` code paths the golden
 * conformance suite (E1-9) pins, so bytes match through the service.
 */
export async function runExport(
  document: ScreenplayDocument,
  format: ExportFormat,
  profile: FormatProfile,
  options: ExportRunOptions = {},
): Promise<ExportArtifact> {
  const includeTitlePage = options.titlePage ?? true;
  const doc: ScreenplayDocument = includeTitlePage
    ? document
    : { ...document, blocks: document.blocks.filter((b) => b.type !== "title_page") };

  switch (format) {
    case "fountain": {
      const text = serializeFountain(doc);
      return {
        bytes: new TextEncoder().encode(text),
        contentType: "text/x-fountain; charset=utf-8",
        extension: "fountain",
      };
    }
    case "fdx": {
      const xml = serializeFdx(doc);
      return {
        bytes: new TextEncoder().encode(xml),
        contentType: "application/xml; charset=utf-8",
        extension: "fdx",
      };
    }
    case "pdf": {
      // The typesetter only draws margins for headings that carry an explicit
      // attrs.sceneNumber; fill missing ones with their ordinal so the PDF
      // matches the editor's live numbering (manual overrides win).
      const numbered =
        options.sceneNumbers === true ? withAutoSceneNumbers(doc) : doc;
      const pageMap = paginate(numbered, profile);
      const bytes = await renderPdf(numbered, profile, pageMap, {
        sceneNumbers: options.sceneNumbers ?? false,
        ...(options.watermark !== undefined && { watermark: options.watermark }),
      });
      return { bytes, contentType: "application/pdf", extension: "pdf" };
    }
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported export format: ${String(exhaustive)}`);
    }
  }
}

/** Fills each scene heading's missing sceneNumber with its 1-based ordinal. */
export function withAutoSceneNumbers(doc: ScreenplayDocument): ScreenplayDocument {
  let ordinal = 0;
  return {
    ...doc,
    blocks: doc.blocks.map((block) => {
      if (block.type !== "scene_heading") return block;
      ordinal += 1;
      if (block.attrs.sceneNumber) return block;
      return { ...block, attrs: { ...block.attrs, sceneNumber: String(ordinal) } };
    }),
  };
}
