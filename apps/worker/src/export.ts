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
      const pageMap = paginate(doc, profile);
      const bytes = await renderPdf(doc, profile, pageMap, {
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
