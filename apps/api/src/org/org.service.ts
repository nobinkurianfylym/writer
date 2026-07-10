import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OrgService {
  private readonly logger = new Logger(OrgService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createPersonalOrg(
    userId: string,
    userName: string,
  ): Promise<string> {
    const slug = this.generateSlug(userName);

    const org = await this.prisma.db.organization.create({
      data: {
        name: `${userName}'s workspace`,
        slug,
        plan: "FREE",
        seatLimit: 1,
        memberships: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
    });

    this.logger.log(`Personal org created: ${org.id} for user ${userId}`);
    return org.id;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
    const suffix = randomBytes(4).toString("hex");
    return `${base || "user"}-${suffix}`;
  }
}
