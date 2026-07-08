import type { Block, PageMap } from "@fylym/screenplay-core";

export interface PaginateRequest {
  type: "paginate";
  blocks: Block[];
  fromBlockIndex: number;
  seq: number;
}

export interface PaginateResponse {
  type: "paginated";
  pageMap: PageMap;
  seq: number;
}
