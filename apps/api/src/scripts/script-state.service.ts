import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  BadRequestException,
} from "@nestjs/common";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";
import type { Plan } from "@fylym/db";
import type { PutScriptState, ScriptState } from "@fylym/contracts";
import { PrismaService } from "../prisma/prisma.service";

export const STATE_CEILING_BYTES: Record<Plan, number> = {
  FREE: 10 * 1024 * 1024,
  PRO: 50 * 1024 * 1024,
  STUDIO: 100 * 1024 * 1024,
  ENTERPRISE: 100 * 1024 * 1024,
};

@Injectable()
export class ScriptStateService {
  constructor(private readonly prisma: PrismaService) {}

  async putState(
    scriptId: string,
    input: PutScriptState,
  ): Promise<{ scriptId: string; bytes: number }> {
    const { plan } = await this.resolveScript(scriptId);

    let state: Buffer;
    try {
      const decoded = Buffer.from(input.ydocState, "base64");
      state =
        input.compression === "zstd" ? zstdDecompressSync(decoded) : decoded;
    } catch {
      throw new BadRequestException("Could not decode ydocState payload");
    }

    const ceiling = STATE_CEILING_BYTES[plan];
    if (state.byteLength > ceiling) {
      throw new PayloadTooLargeException(
        `Document state (${state.byteLength} bytes) exceeds the ${plan} plan ceiling of ${ceiling} bytes`,
      );
    }

    const vector = input.ydocVector
      ? Buffer.from(input.ydocVector, "base64")
      : null;

    await this.prisma.db.script.update({
      where: { id: scriptId },
      data: {
        ydocState: new Uint8Array(state),
        ydocVector: vector ? new Uint8Array(vector) : null,
      },
    });

    return { scriptId, bytes: state.byteLength };
  }

  async getState(scriptId: string): Promise<ScriptState> {
    const { script } = await this.resolveScript(scriptId);

    if (!script.ydocState) {
      throw new NotFoundException("Script has no stored state yet");
    }

    const compressed = zstdCompressSync(Buffer.from(script.ydocState));

    return {
      scriptId,
      ydocState: compressed.toString("base64"),
      ydocVector: script.ydocVector
        ? Buffer.from(script.ydocVector).toString("base64")
        : null,
      compression: "zstd",
      updatedAt: script.updatedAt.toISOString(),
    };
  }

  private async resolveScript(scriptId: string) {
    const script = await this.prisma.db.script.findUnique({
      where: { id: scriptId },
      include: {
        project: {
          select: { deletedAt: true, org: { select: { plan: true } } },
        },
      },
    });

    if (!script || script.deletedAt || script.project.deletedAt) {
      throw new NotFoundException("Script not found");
    }

    return { script, plan: script.project.org.plan };
  }
}
