import { paginate, repaginate, usFeatureProfile, type FormatProfile, type PageMap } from "@fylym/screenplay-core";
import type { PaginateRequest, PaginateResponse } from "./protocol.js";

export function createPaginationHandler(
  profile: FormatProfile = usFeatureProfile,
): (req: PaginateRequest) => PaginateResponse {
  let prevPageMap: PageMap | null = null;

  return (req) => {
    const doc = { blocks: req.blocks };
    const pageMap =
      prevPageMap === null
        ? paginate(doc, profile)
        : repaginate(doc, profile, prevPageMap, { fromBlockIndex: req.fromBlockIndex });

    prevPageMap = pageMap;
    return { type: "paginated", pageMap, seq: req.seq };
  };
}
