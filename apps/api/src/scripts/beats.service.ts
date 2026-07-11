import { Injectable, NotFoundException } from "@nestjs/common";
import { BeatsSchema, type Beat, type Beats } from "@fylym/contracts";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BeatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBeats(scriptId: string): Promise<Beats> {
    const script = await this.resolve(scriptId);
    return { beats: normalizeBeats(script.beats) };
  }

  async putBeats(scriptId: string, input: Beats): Promise<Beats> {
    await this.resolve(scriptId);
    await this.prisma.db.script.update({
      where: { id: scriptId },
      data: { beats: input.beats },
    });
    return { beats: input.beats };
  }

  private async resolve(scriptId: string) {
    const script = await this.prisma.db.script.findUnique({
      where: { id: scriptId },
      select: {
        beats: true,
        deletedAt: true,
        project: { select: { deletedAt: true } },
      },
    });
    if (!script || script.deletedAt || script.project.deletedAt) {
      throw new NotFoundException("Script not found");
    }
    return script;
  }
}

/** Tolerate legacy/empty JSON — return a valid beat list or an empty one. */
function normalizeBeats(raw: unknown): Beat[] {
  const parsed = BeatsSchema.safeParse({ beats: raw });
  return parsed.success ? parsed.data.beats : [];
}
