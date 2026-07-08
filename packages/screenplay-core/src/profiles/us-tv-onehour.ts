import { parseFormatProfile } from "../format-profile.js";
import { HOLLYWOOD_ELEMENTS } from "./hollywood-elements.js";

const raw = {
  id: "us-tv-onehour",
  name: "US TV One-Hour Drama",
  page: {
    width: 8.5,
    height: 11,
    margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
  },
  elements: HOLLYWOOD_ELEMENTS,
  pagination: {
    linesPerPage: 55,
    moreText: "(MORE)",
    continuedText: "(CONT'D)",
    minOrphanLines: 2,
    sceneHeadingMinLinesBeforeBreak: 3,
    // One-hour drama scripts are structured in acts ("END OF ACT ONE", cold
    // opens, tags); act boundaries force a page break. Features have no acts.
    honorsActBreaks: true,
  },
};

export const usTvOneHourProfile = parseFormatProfile(raw);
