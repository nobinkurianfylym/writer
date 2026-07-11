import { z } from "zod";
import { registry } from "./registry.js";

/** The six card colors on the beat board. */
export const BeatColorSchema = registry.register(
  "BeatColor",
  z.enum(["gold", "blue", "rose", "green", "violet", "slate"]).openapi("BeatColor"),
);
export type BeatColor = z.infer<typeof BeatColorSchema>;

/** A single planning beat — one card on the board. */
export const BeatSchema = registry.register(
  "Beat",
  z
    .object({
      id: z.string().min(1).max(64),
      act: z.string().min(1).max(80),
      title: z.string().max(200),
      summary: z.string().max(4000),
      color: BeatColorSchema,
    })
    .openapi("Beat"),
);
export type Beat = z.infer<typeof BeatSchema>;

/** The whole board — an ordered list of beats. Used for GET and PUT alike. */
export const BeatsSchema = registry.register(
  "Beats",
  z
    .object({
      beats: z.array(BeatSchema).max(500),
    })
    .openapi("Beats"),
);
export type Beats = z.infer<typeof BeatsSchema>;
