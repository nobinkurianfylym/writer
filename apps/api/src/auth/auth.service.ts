import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { hash, verify } from "argon2";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { OrgService } from "../org/org.service";
import { AuditService } from "../audit/audit.service";
import { JwtService } from "./jwt.service";
import { RedisService } from "./redis.service";
import { MailService } from "./mail.service";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_LINK_TTL_SEC = 600; // 10 minutes
const MAGIC_LINK_PREFIX = "magic-link:";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly org: OrgService,
    private readonly audit: AuditService,
  ) {}

  async register(
    email: string,
    password: string,
    name: string,
  ): Promise<{ userId: string }> {
    const existing = await this.prisma.db.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = await hash(password, {
      type: 2, // argon2id
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const user = await this.prisma.db.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash,
      },
    });

    this.logger.log(`User registered: ${user.id}`);

    const orgId = await this.org.createPersonalOrg(user.id, name);
    await this.audit.log({
      orgId,
      actorId: user.id,
      action: "auth.register",
      target: user.id,
    });

    return { userId: user.id };
  }

  async login(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const user = await this.prisma.db.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.createSession(user.id, ip, userAgent);
  }

  async refresh(
    rawToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const hashedToken = this.hashToken(rawToken);

    const session = await this.prisma.db.session.findUnique({
      where: { hashedToken },
    });

    if (!session) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (session.revokedAt) {
      // Reuse detected — revoke entire family
      await this.prisma.db.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        `Refresh token reuse detected, family ${session.familyId} revoked`,
      );
      throw new UnauthorizedException("Token reuse detected");
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    // Rotate: revoke old, issue new in same family
    await this.prisma.db.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.createSession(session.userId, ip, userAgent, session.familyId);
  }

  async logout(rawToken: string): Promise<void> {
    const hashedToken = this.hashToken(rawToken);

    const session = await this.prisma.db.session.findUnique({
      where: { hashedToken },
    });
    if (!session || session.revokedAt) return;

    await this.prisma.db.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getUserById(userId: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    return user;
  }

  /* ── Magic Links ── */

  async sendMagicLink(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    const token = randomBytes(32).toString("base64url");
    const hashedToken = this.hashToken(token);
    const key = `${MAGIC_LINK_PREFIX}${hashedToken}`;
    await this.redis.client.set(key, normalizedEmail, "EX", MAGIC_LINK_TTL_SEC);
    await this.mail.sendMagicLinkEmail(normalizedEmail, token);
    this.logger.log(`Magic link sent to ${normalizedEmail}`);
  }

  async verifyMagicLink(
    token: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const hashedToken = this.hashToken(token);
    const key = `${MAGIC_LINK_PREFIX}${hashedToken}`;
    const email = await this.redis.client.get(key);

    if (!email) {
      throw new UnauthorizedException(
        "Invalid or expired magic link",
      );
    }

    // Single-use: delete immediately
    await this.redis.client.del(key);

    let user = await this.prisma.db.user.findUnique({
      where: { email },
    });

    if (!user) {
      const displayName = email.split("@")[0] ?? email;
      user = await this.prisma.db.user.create({
        data: {
          email,
          name: displayName,
        },
      });
      this.logger.log(`User created via magic link: ${user.id}`);

      const orgId = await this.org.createPersonalOrg(user.id, displayName);
      await this.audit.log({
        orgId,
        actorId: user.id,
        action: "auth.register.magic_link",
        target: user.id,
      });
    }

    return this.createSession(user.id, ip, userAgent);
  }

  private async createSession(
    userId: string,
    ip?: string,
    userAgent?: string,
    familyId?: string,
  ): Promise<AuthTokens> {
    const rawToken = randomBytes(32).toString("base64url");
    const hashedToken = this.hashToken(rawToken);
    const family = familyId ?? randomUUID();

    await this.prisma.db.session.create({
      data: {
        userId,
        familyId: family,
        hashedToken,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    const accessToken = await this.jwt.signAccessToken(userId);

    return {
      accessToken,
      refreshToken: rawToken,
      expiresIn: 600,
    };
  }

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }
}
