import { createPaginationHandler } from "@fylym/editor";

const handle = createPaginationHandler();

self.onmessage = (e: MessageEvent) => {
  self.postMessage(handle(e.data));
};
