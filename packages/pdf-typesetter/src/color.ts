import { rgb, type Color } from "pdf-lib";

/**
 * Standard Hollywood script-revision colors (the order pages are reprinted
 * in across drafts). Approximate print-safe RGB values — exact hue isn't
 * accept-criteria relevant here, only that a revision mark renders visibly
 * distinct from plain black text.
 */
const REVISION_COLORS: Record<string, Color> = {
  white: rgb(0, 0, 0),
  blue: rgb(0.1, 0.2, 0.7),
  pink: rgb(0.85, 0.3, 0.5),
  yellow: rgb(0.6, 0.5, 0),
  green: rgb(0.1, 0.5, 0.1),
  goldenrod: rgb(0.7, 0.5, 0.1),
  buff: rgb(0.6, 0.45, 0.25),
  salmon: rgb(0.8, 0.35, 0.3),
  cherry: rgb(0.7, 0.1, 0.2),
  tan: rgb(0.6, 0.45, 0.3),
  gray: rgb(0.4, 0.4, 0.4),
  grey: rgb(0.4, 0.4, 0.4),
};

const BLACK = rgb(0, 0, 0);

/** Resolves a revision color name to a drawing color; unrecognized names fall back to plain black rather than failing the render. */
export function resolveRevisionColor(name: string | undefined): Color {
  if (name === undefined) return BLACK;
  return REVISION_COLORS[name.trim().toLowerCase()] ?? BLACK;
}
