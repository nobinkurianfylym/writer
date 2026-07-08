import { parseFormatProfile } from "../format-profile.js";
import { HOLLYWOOD_ELEMENTS } from "./hollywood-elements.js";

const raw = {
  id: "us-feature",
  name: "US Feature",
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
    honorsActBreaks: false,
  },
};

/** Standard US feature-film format: 8.5"x11" page, 1"/1.5" margins, 55 lines/page, no act breaks. */
export const usFeatureProfile = parseFormatProfile(raw);
