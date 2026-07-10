import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditLogParams {
  orgId: string;
  actorId: string | null;
  action: string;
  target?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    const prevLog = await this.prisma.db.auditLog.findFirst({
      where: { orgId: params.orgId },
      orderBy: { id: "desc" },
      select: { hash: true },
    });

    const prevHash = prevLog ? Buffer.from(prevLog.hash) : null;
    const rowContent = this.serializeRow(params);
    const hash = this.computeHash(prevHash, rowContent);

    await this.prisma.db.auditLog.create({
      data: {
        orgId: params.orgId,
        actorId: params.actorId,
        action: params.action,
        target: params.target ?? null,
        ip: params.ip ?? null,
        metadata: params.metadata
          ? (JSON.parse(JSON.stringify(params.metadata)) as object)
          : undefined,
        prevHash: prevHash ? new Uint8Array(prevHash) : null,
        hash: new Uint8Array(hash),
      },
    });

    this.logger.debug(
      `Audit: ${params.action} by ${params.actorId ?? "system"} in org ${params.orgId}`,
    );
  }

  async verifyChain(orgId: string): Promise<boolean> {
    const logs = await this.prisma.db.auditLog.findMany({
      where: { orgId },
      orderBy: { id: "asc" },
    });

    let prevHash: Buffer | null = null;

    for (const entry of logs) {
      const rowContent = this.serializeRow({
        orgId: entry.orgId,
        actorId: entry.actorId,
        action: entry.action,
        target: entry.target ?? undefined,
        metadata: (entry.metadata as Record<string, unknown>) ?? undefined,
      });

      const expectedHash = this.computeHash(prevHash, rowContent);
      const actualHash = Buffer.from(entry.hash);

      if (!actualHash.equals(expectedHash)) {
        this.logger.warn(
          `Audit chain broken at entry ${entry.id} in org ${orgId}`,
        );
        return false;
      }

      prevHash = actualHash;
    }

    return true;
  }

  private serializeRow(params: AuditLogParams): string {
    return JSON.stringify({
      orgId: params.orgId,
      actorId: params.actorId,
      action: params.action,
      target: params.target ?? null,
      metadata: params.metadata ?? null,
    });
  }

  private computeHash(prevHash: Buffer | null, rowContent: string): Buffer {
    const input = prevHash
      ? Buffer.concat([prevHash, Buffer.from(rowContent)])
      : Buffer.from(rowContent);
    return createHash("sha256").update(input).digest();
  }
}
