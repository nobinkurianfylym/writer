import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { hash, verify } from "argon2";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "./jwt.service";
import { RedisService } from "./redis.service";
import { MailService } from "./mail.service";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const VERIFY_EMAIL_TTL_SEC = 86400; // 24 hours
const VERIFY_EMAIL_PREFIX = "email-verify:";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
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
    await this.sendVerificationEmail(user.email, user.id);
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
      select: { id: true, email: true, emailVerified: true, name: true },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    return user;
  }

  async sendVerificationEmail(
    email: string,
    userId: string,
  ): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    const key = `${VERIFY_EMAIL_PREFIX}${token}`;
    await this.redis.client.set(key, userId, "EX", VERIFY_EMAIL_TTL_SEC);
    await this.mail.sendVerificationEmail(email, token);
  }

  async verifyEmail(token: string): Promise<{ userId: string }> {
    const key = `${VERIFY_EMAIL_PREFIX}${token}`;
    const userId = await this.redis.client.get(key);

    if (!userId) {
      throw new UnauthorizedException("Invalid or expired verification token");
    }

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    });

    await this.redis.client.del(key);
    this.logger.log(`Email verified for user ${userId}`);
    return { userId };
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
