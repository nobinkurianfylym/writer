import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
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
import { getApiEnv } from "../env";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface GoogleTokenResponse {
  id_token: string;
  access_token: string;
}

interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const VERIFY_EMAIL_TTL_SEC = 86400; // 24 hours
const VERIFY_EMAIL_PREFIX = "email-verify:";
const MAGIC_LINK_TTL_SEC = 600; // 10 minutes
const MAGIC_LINK_PREFIX = "magic-link:";
const OAUTH_STATE_PREFIX = "oauth-state:";
const OAUTH_STATE_TTL_SEC = 600; // 10 minutes

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

    // Best-effort: a mail outage (or no SMTP configured) must not fail
    // signup — the account is created and password login works regardless;
    // the user can re-request verification later.
    try {
      await this.sendVerificationEmail(user.email, user.id);
    } catch (err) {
      this.logger.warn(
        `Verification email failed for ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
          emailVerified: new Date(),
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
    } else if (!user.emailVerified) {
      await this.prisma.db.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    }

    return this.createSession(user.id, ip, userAgent);
  }

  /* ── Google OAuth ── */

  async getGoogleAuthUrl(): Promise<{ url: string; state: string }> {
    const env = getApiEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
      throw new BadRequestException("Google OAuth is not configured");
    }

    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    // Store state → codeVerifier mapping in Redis
    const key = `${OAUTH_STATE_PREFIX}${state}`;
    await this.redis.client.set(key, codeVerifier, "EX", OAUTH_STATE_TTL_SEC);

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return { url, state };
  }

  async handleGoogleCallback(
    code: string,
    state: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const env = getApiEnv();
    if (
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET ||
      !env.GOOGLE_REDIRECT_URI
    ) {
      throw new BadRequestException("Google OAuth is not configured");
    }

    // Retrieve and consume stored code_verifier
    const stateKey = `${OAUTH_STATE_PREFIX}${state}`;
    const codeVerifier = await this.redis.client.get(stateKey);
    if (!codeVerifier) {
      throw new UnauthorizedException("Invalid or expired OAuth state");
    }
    await this.redis.client.del(stateKey);

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        }),
      },
    );

    if (!tokenResponse.ok) {
      this.logger.warn(`Google token exchange failed: ${tokenResponse.status}`);
      throw new UnauthorizedException("Google authentication failed");
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

    // Decode and verify the ID token claims
    const payload = this.decodeGoogleIdToken(tokenData.id_token);
    if (!payload.email || !payload.sub) {
      throw new UnauthorizedException("Invalid Google ID token");
    }

    return this.findOrCreateGoogleUser(payload, ip, userAgent);
  }

  private decodeGoogleIdToken(idToken: string): GoogleIdTokenPayload {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new UnauthorizedException("Malformed ID token");
    }
    const payloadJson = Buffer.from(parts[1]!, "base64url").toString("utf-8");
    return JSON.parse(payloadJson) as GoogleIdTokenPayload;
  }

  private async findOrCreateGoogleUser(
    payload: GoogleIdTokenPayload,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const email = payload.email.toLowerCase();

    // Check if OAuthAccount already exists
    const existingOAuth = await this.prisma.db.oAuthAccount.findUnique({
      where: {
        provider_providerId: { provider: "google", providerId: payload.sub },
      },
    });

    if (existingOAuth) {
      return this.createSession(existingOAuth.userId, ip, userAgent);
    }

    // Check if user exists by email (account linking)
    let user = await this.prisma.db.user.findUnique({
      where: { email },
    });

    if (user) {
      // Link Google account to existing user
      await this.prisma.db.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: "google",
          providerId: payload.sub,
        },
      });

      // Mark email as verified if Google says it is
      if (payload.email_verified && !user.emailVerified) {
        await this.prisma.db.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      }
    } else {
      // Create new user + OAuthAccount
      user = await this.prisma.db.user.create({
        data: {
          email,
          name: payload.name ?? email.split("@")[0] ?? email,
          emailVerified: payload.email_verified ? new Date() : null,
          oauthAccounts: {
            create: {
              provider: "google",
              providerId: payload.sub,
            },
          },
        },
      });
      this.logger.log(`User created via Google OAuth: ${user.id}`);

      const orgId = await this.org.createPersonalOrg(
        user.id,
        payload.name ?? email.split("@")[0] ?? email,
      );
      await this.audit.log({
        orgId,
        actorId: user.id,
        action: "auth.register.google",
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
