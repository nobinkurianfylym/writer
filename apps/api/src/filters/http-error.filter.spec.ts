import { describe, it, expect, vi } from "vitest";
import { PayloadTooLargeException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { HttpErrorFilter } from "./http-error.filter";

function createHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("HttpErrorFilter", () => {
  it("renders a clean 413 envelope for oversized payloads", () => {
    const { host, status, json } = createHost();

    new HttpErrorFilter().catch(
      new PayloadTooLargeException(
        "Document state (10485761 bytes) exceeds the FREE plan ceiling of 10485760 bytes",
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message:
          "Document state (10485761 bytes) exceeds the FREE plan ceiling of 10485760 bytes",
      },
    });
  });
});
