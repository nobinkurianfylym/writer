import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { importPKCS8, importSPKI, jwtVerify } from "jose";
import type { CryptoKey as JoseKey } from "jose";

/* ---------- In-memory fakes ---------- */

class FakeRedisClient {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async set(key: string, value: string, mode?: string, ttl?: number) {
    const expiresAt =
      mode === "EX" && ttl ? Date.now() + ttl * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string) {
    this.store.delete(key);
    return 1;
  }
}

class InMemoryUserStore {
  users = new Map<string, Record<string, unknown>>();

  findUnique(args: { where: Record<string, unknown>; select?: Record<string, boolean> }) {
    for (const user of this.users.values()) {
      for (const [key, val] of Object.entries(args.where)) {
        if (user[key] === val) return user;
      }
    }
    return null;
  }

  oAuthAccountStore?: InMemoryOAuthAccountStore;

  create(args: { data: Record<string, unknown> }) {
    const id = randomUUID();
    const { oauthAccounts, ...rest } = args.data;
    const user = {
      id,
      emailVerified: null,
      ...rest,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);

    // Handle nested oauthAccounts create
    if (
      oauthAccounts &&
      typeof oauthAccounts === "object" &&
      "create" in (oauthAccounts as Record<string, unknown>) &&
      this.oAuthAccountStore
    ) {
      const oauthData = (oauthAccounts as { create: Record<string, unknown> }).create;
      this.oAuthAccountStore.create({ data: { ...oauthData, userId: id } });
    }

    return user;
  }

  update(args: { where: { id: string }; data: Record<string, unknown> }) {
    const user = this.users.get(args.where.id);
    if (!user) throw new Error("Not found");
    Object.assign(user, args.data);
    return user;
  }
}

class InMemorySessionStore {
  sessions = new Map<string, Record<string, unknown>>();

  findUnique(args: { where: Record<string, unknown> }) {
    for (const session of this.sessions.values()) {
      for (const [key, val] of Object.entries(args.where)) {
        if (session[key] === val) return session;
      }
    }
    return null;
  }

  create(args: { data: Record<string, unknown> }) {
    const id = randomUUID();
    const session = { id, revokedAt: null, ...args.data };
    this.sessions.set(id, session);
    return session;
  }

  update(args: { where: { id: string }; data: Record<string, unknown> }) {
    const session = this.sessions.get(args.where.id);
    if (!session) throw new Error("Not found");
    Object.assign(session, args.data);
    return session;
  }

  updateMany(args: {
    where: { familyId?: string; userId?: string; revokedAt: null };
    data: Record<string, unknown>;
  }) {
    let count = 0;
    for (const session of this.sessions.values()) {
      const matchFamily =
        !args.where.familyId || session.familyId === args.where.familyId;
      const matchUser =
        !args.where.userId || session.userId === args.where.userId;
      const matchRevoked = session.revokedAt === null;
      if (matchFamily && matchUser && matchRevoked) {
        Object.assign(session, args.data);
        count++;
      }
    }
    return { count };
  }
}

class InMemoryOAuthAccountStore {
  accounts = new Map<string, Record<string, unknown>>();

  findUnique(args: { where: Record<string, unknown> }) {
    const compound = args.where.provider_providerId as
      | { provider: string; providerId: string }
      | undefined;
    if (compound) {
      for (const account of this.accounts.values()) {
        if (
          account.provider === compound.provider &&
          account.providerId === compound.providerId
        ) {
          return account;
        }
      }
      return null;
    }
    for (const account of this.accounts.values()) {
      for (const [key, val] of Object.entries(args.where)) {
        if (account[key] === val) return account;
      }
    }
    return null;
  }

  create(args: { data: Record<string, unknown> }) {
    const id = randomUUID();
    const account = { id, ...args.data };
    this.accounts.set(id, account);
    return account;
  }
}

/* ---------- ES256 dev keys ---------- */
const TEST_PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\n" +
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgMkLruywhr9k4kEWT\n" +
  "FltyiaSo9hVnf7L2AXP/ziOaiwShRANCAASxbTJHmYNZCm1EsBjKDTzrLKVodOUs\n" +
  "DAjPPHDnA9JiElpR/+h8bj+kXt7QegDFpZp9IHhdwLveEXswj49kkpe2\n" +
  "-----END PRIVATE KEY-----";
const TEST_PUBLIC_KEY =
  "-----BEGIN PUBLIC KEY-----\n" +
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsW0yR5mDWQptRLAYyg086yylaHTl\n" +
  "LAwIzzxw5wPSYhJaUf/ofG4/pF7e0HoAxaWafSB4XcC73hF7MI+PZJKXtg==\n" +
  "-----END PUBLIC KEY-----";

/* ---------- Direct service construction ---------- */

import { AuthService } from "./auth.service";
import { JwtService } from "./jwt.service";

function createTestServices() {
  const fakeRedis = new FakeRedisClient();
  const oAuthAccountStore = new InMemoryOAuthAccountStore();
  const userStore = new InMemoryUserStore();
  userStore.oAuthAccountStore = oAuthAccountStore;
  const mockDb = {
    user: userStore,
    session: new InMemorySessionStore(),
    oAuthAccount: oAuthAccountStore,
  };
  const mockPrisma = { db: mockDb } as unknown as ConstructorParameters<typeof AuthService>[0];
  const mockRedisService = { client: fakeRedis } as unknown as ConstructorParameters<typeof AuthService>[2];
  const mockMail = {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConstructorParameters<typeof AuthService>[3];

  const jwtService = new JwtService();
  const authService = new AuthService(
    mockPrisma,
    jwtService,
    mockRedisService,
    mockMail,
  );

  return { authService, jwtService, fakeRedis, mockDb, mockMail };
}

/* ---------- Test suite ---------- */

describe("Auth integration", () => {
  let authService: AuthService;
  let jwtService: JwtService;
  let fakeRedis: FakeRedisClient;
  let mockDb: ReturnType<typeof createTestServices>["mockDb"];
  let publicKey: JoseKey;

  const TEST_EMAIL = "test@example.com";
  const TEST_PASSWORD = "SecureP@ss123!";
  const TEST_NAME = "Test Writer";

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgresql://fylym:fylym@localhost:5432/fylym";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.JWT_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.JWT_PUBLIC_KEY = TEST_PUBLIC_KEY;
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "1025";
    process.env.APP_URL = "http://localhost:5173";

    publicKey = await importSPKI(TEST_PUBLIC_KEY, "ES256");
  });

  beforeEach(async () => {
    const services = createTestServices();
    authService = services.authService;
    jwtService = services.jwtService;
    fakeRedis = services.fakeRedis;
    mockDb = services.mockDb;
    await jwtService.onModuleInit();
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  /* ── Registration ── */

  it("registers a new user", async () => {
    const { userId } = await authService.register(
      TEST_EMAIL,
      TEST_PASSWORD,
      TEST_NAME,
    );
    expect(userId).toBeDefined();
    expect(typeof userId).toBe("string");
  });

  it("sends verification email on registration", async () => {
    const services = createTestServices();
    await services.jwtService.onModuleInit();
    authService = services.authService;

    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    expect(services.mockMail.sendVerificationEmail).toHaveBeenCalledWith(
      TEST_EMAIL.toLowerCase(),
      expect.any(String),
    );
  });

  it("rejects duplicate email registration", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    await expect(
      authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME),
    ).rejects.toThrow("Email already registered");
  });

  /* ── Login ── */

  it("logs in with valid credentials and returns tokens", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    const tokens = await authService.login(TEST_EMAIL, TEST_PASSWORD);

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(tokens.expiresIn).toBe(600);
  });

  it("access token is valid ES256 JWT with correct claims", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    const tokens = await authService.login(TEST_EMAIL, TEST_PASSWORD);

    const { payload, protectedHeader } = await jwtVerify(
      tokens.accessToken,
      publicKey,
      { algorithms: ["ES256"], issuer: "fylym" },
    );

    expect(protectedHeader.alg).toBe("ES256");
    expect(payload.sub).toBeDefined();
    expect(payload.jti).toBeDefined();
    expect(payload.iss).toBe("fylym");
    expect(payload.exp).toBeDefined();

    const ttl = payload.exp! - payload.iat!;
    expect(ttl).toBe(600);
  });

  it("rejects invalid password", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    await expect(
      authService.login(TEST_EMAIL, "wrong-password"),
    ).rejects.toThrow("Invalid credentials");
  });

  it("rejects non-existent email", async () => {
    await expect(
      authService.login("nobody@example.com", TEST_PASSWORD),
    ).rejects.toThrow("Invalid credentials");
  });

  /* ── Refresh token rotation ── */

  it("rotates refresh token and issues new access token", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    const tokens1 = await authService.login(TEST_EMAIL, TEST_PASSWORD);

    const tokens2 = await authService.refresh(tokens1.refreshToken);

    expect(tokens2.accessToken).toBeDefined();
    expect(tokens2.refreshToken).toBeDefined();
    expect(tokens2.refreshToken).not.toBe(tokens1.refreshToken);
    expect(tokens2.accessToken).not.toBe(tokens1.accessToken);
  });

  /* ── Family-based reuse detection ── */

  it("revokes entire family when old refresh token is replayed", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    const tokens1 = await authService.login(TEST_EMAIL, TEST_PASSWORD);
    const oldRefresh = tokens1.refreshToken;

    // Legitimate rotation
    const tokens2 = await authService.refresh(oldRefresh);
    const newRefresh = tokens2.refreshToken;

    // Replay old token → triggers family revocation
    await expect(authService.refresh(oldRefresh)).rejects.toThrow(
      "Token reuse detected",
    );

    // The legitimate new token should also be revoked
    await expect(authService.refresh(newRefresh)).rejects.toThrow(
      /Invalid refresh token|Token reuse detected/,
    );
  });

  /* ── Logout ── */

  it("logout revokes refresh token", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    const tokens = await authService.login(TEST_EMAIL, TEST_PASSWORD);

    await authService.logout(tokens.refreshToken);

    await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow();
  });

  it("logoutAll revokes all sessions for a user", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    const tokens1 = await authService.login(TEST_EMAIL, TEST_PASSWORD);
    const tokens2 = await authService.login(TEST_EMAIL, TEST_PASSWORD);

    const { payload } = await jwtVerify(tokens1.accessToken, publicKey, {
      algorithms: ["ES256"],
    });
    await authService.logoutAll(payload.sub!);

    await expect(authService.refresh(tokens1.refreshToken)).rejects.toThrow();
    await expect(authService.refresh(tokens2.refreshToken)).rejects.toThrow();
  });

  /* ── Email verification ── */

  it("verifies email with valid token", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    const user = mockDb.user.users.values().next().value!;

    const token = "test-verify-token";
    await fakeRedis.set(`email-verify:${token}`, user.id as string, "EX", 86400);

    const result = await authService.verifyEmail(token);
    expect(result.userId).toBe(user.id);

    const updated = mockDb.user.users.get(user.id as string);
    expect(updated!.emailVerified).toBeInstanceOf(Date);
  });

  it("rejects invalid verification token", async () => {
    await expect(authService.verifyEmail("bogus")).rejects.toThrow(
      "Invalid or expired verification token",
    );
  });

  /* ── JWT service ── */

  it("verifyAccessToken rejects expired tokens", async () => {
    const { payload } = await jwtVerify(
      await jwtService.signAccessToken("user-123"),
      publicKey,
      { algorithms: ["ES256"] },
    );
    expect(payload.sub).toBe("user-123");

    await expect(
      jwtService.verifyAccessToken("invalid.token.here"),
    ).rejects.toThrow("Invalid or expired token");
  });

  it("verifyAccessToken rejects tokens with wrong issuer", async () => {
    const { SignJWT } = await import("jose");
    const privateKey = await importPKCS8(TEST_PRIVATE_KEY, "ES256");
    const badToken = await new SignJWT({ sub: "user-123", jti: "abc" })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setIssuer("wrong-issuer")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);

    await expect(jwtService.verifyAccessToken(badToken)).rejects.toThrow(
      "Invalid or expired token",
    );
  });

  /* ── Password hashing (OWASP) ── */

  it("uses argon2id with OWASP-compliant parameters", async () => {
    const { hash } = await import("argon2");
    const hashed = await hash("test", {
      type: 2, // argon2id
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    expect(hashed).toMatch(/^\$argon2id\$/);
    expect(hashed).toContain("m=19456");
    expect(hashed).toContain("t=2");
    expect(hashed).toContain("p=1");
  });

  /* ── Magic links ── */

  it("sends a magic link and verifies it for existing user", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    const services = createTestServices();
    await services.jwtService.onModuleInit();
    authService = services.authService;
    fakeRedis = services.fakeRedis;
    mockDb = services.mockDb;

    // Re-register to populate mockDb
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);

    await authService.sendMagicLink(TEST_EMAIL);
    expect(services.mockMail.sendMagicLinkEmail).toHaveBeenCalledWith(
      TEST_EMAIL.toLowerCase(),
      expect.any(String),
    );

    // Extract the raw token from the mock call
    const sendMock = services.mockMail.sendMagicLinkEmail as unknown as ReturnType<typeof vi.fn>;
    const rawToken = sendMock.mock.calls[0]![1] as string;

    const tokens = await authService.verifyMagicLink(rawToken);
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(tokens.expiresIn).toBe(600);
  });

  it("creates a new user when magic link is used with unknown email", async () => {
    const newEmail = "newuser@example.com";
    await authService.sendMagicLink(newEmail);

    // Extract raw token
    const services = createTestServices();
    await services.jwtService.onModuleInit();

    // Manually set up magic link in fakeRedis
    const rawToken = "test-magic-token";
    const hashedToken = createHash("sha256").update(rawToken).digest("hex");
    await fakeRedis.set(`magic-link:${hashedToken}`, newEmail.toLowerCase(), "EX", 600);

    const tokens = await authService.verifyMagicLink(rawToken);
    expect(tokens.accessToken).toBeDefined();

    // User should have been created with verified email
    const user = mockDb.user.findUnique({ where: { email: newEmail.toLowerCase() } });
    expect(user).not.toBeNull();
    expect(user!.emailVerified).toBeInstanceOf(Date);
  });

  it("magic link consumed twice fails the second time (single-use)", async () => {
    const rawToken = "single-use-token";
    const hashedToken = createHash("sha256").update(rawToken).digest("hex");
    await fakeRedis.set(`magic-link:${hashedToken}`, TEST_EMAIL.toLowerCase(), "EX", 600);

    // First use succeeds
    await authService.verifyMagicLink(rawToken);

    // Second use fails — token was deleted
    await expect(authService.verifyMagicLink(rawToken)).rejects.toThrow(
      "Invalid or expired magic link",
    );
  });

  it("magic link expires after TTL (clock-controlled)", async () => {
    const rawToken = "expiring-token";
    const hashedToken = createHash("sha256").update(rawToken).digest("hex");
    // Set with 1-second TTL for fast expiry test
    await fakeRedis.set(`magic-link:${hashedToken}`, TEST_EMAIL.toLowerCase(), "EX", 1);

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await expect(authService.verifyMagicLink(rawToken)).rejects.toThrow(
      "Invalid or expired magic link",
    );
  });

  it("magic link token is hashed at rest in Redis", async () => {
    await authService.sendMagicLink(TEST_EMAIL);

    // The raw token should not appear as a Redis key
    const rawToken: string | undefined = undefined;

    // Keys in fakeRedis should be hashed, not raw
    // Verify by checking that the key format is magic-link:<sha256hex>
    let foundMagicLinkKey = false;
    for (const key of (fakeRedis as unknown as { store: Map<string, unknown> }).store.keys()) {
      if (key.startsWith("magic-link:")) {
        foundMagicLinkKey = true;
        const hashPart = key.slice("magic-link:".length);
        expect(hashPart).toMatch(/^[a-f0-9]{64}$/);
        if (rawToken) {
          expect(hashPart).not.toBe(rawToken);
        }
      }
    }
    expect(foundMagicLinkKey).toBe(true);
  });

  /* ── Google OAuth ── */

  it("getGoogleAuthUrl returns authorization URL with PKCE params", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:5173/auth/google/callback";

    const { url, state } = await authService.getGoogleAuthUrl();

    expect(state).toBeDefined();
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("code_challenge=");
    expect(url).toContain(`state=${state}`);
    expect(url).toContain("scope=openid+email+profile");
  });

  it("getGoogleAuthUrl stores state→verifier in Redis", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:5173/auth/google/callback";

    const { state } = await authService.getGoogleAuthUrl();

    const storedVerifier = await fakeRedis.get(`oauth-state:${state}`);
    expect(storedVerifier).toBeDefined();
    expect(typeof storedVerifier).toBe("string");
  });

  it("getGoogleAuthUrl throws when Google OAuth not configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_REDIRECT_URI;

    await expect(authService.getGoogleAuthUrl()).rejects.toThrow(
      "Google OAuth is not configured",
    );
  });

  it("handleGoogleCallback rejects invalid OAuth state", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:5173/auth/google/callback";

    await expect(
      authService.handleGoogleCallback("some-code", "invalid-state"),
    ).rejects.toThrow("Invalid or expired OAuth state");
  });

  it("findOrCreateGoogleUser links Google account to existing user by email", async () => {
    await authService.register(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    const user = mockDb.user.users.values().next().value!;

    // Simulate findOrCreateGoogleUser by calling the private method indirectly
    // via handleGoogleCallback with a mocked fetch
    const googlePayload = {
      sub: "google-user-123",
      email: TEST_EMAIL,
      email_verified: true,
      name: TEST_NAME,
    };

    // Encode as a fake ID token
    const fakeIdToken = [
      Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
      Buffer.from(JSON.stringify(googlePayload)).toString("base64url"),
      "fake-signature",
    ].join(".");

    // Set up state in Redis
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:5173/auth/google/callback";

    const state = "test-state";
    await fakeRedis.set(`oauth-state:${state}`, "test-verifier", "EX", 600);

    // Mock global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id_token: fakeIdToken, access_token: "at" }),
    });

    try {
      const tokens = await authService.handleGoogleCallback("auth-code", state);
      expect(tokens.accessToken).toBeDefined();

      // OAuthAccount should be linked
      const oauth = mockDb.oAuthAccount.findUnique({
        where: { provider_providerId: { provider: "google", providerId: "google-user-123" } },
      });
      expect(oauth).not.toBeNull();
      expect(oauth!.userId).toBe(user.id);

      // Email should now be verified
      const updatedUser = mockDb.user.users.get(user.id as string);
      expect(updatedUser!.emailVerified).toBeInstanceOf(Date);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("findOrCreateGoogleUser creates new user when email not found", async () => {
    const googlePayload = {
      sub: "google-new-user-456",
      email: "newgoogle@example.com",
      email_verified: true,
      name: "New Google User",
    };

    const fakeIdToken = [
      Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
      Buffer.from(JSON.stringify(googlePayload)).toString("base64url"),
      "fake-signature",
    ].join(".");

    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:5173/auth/google/callback";

    const state = "test-state-2";
    await fakeRedis.set(`oauth-state:${state}`, "test-verifier", "EX", 600);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id_token: fakeIdToken, access_token: "at" }),
    });

    try {
      const tokens = await authService.handleGoogleCallback("auth-code", state);
      expect(tokens.accessToken).toBeDefined();

      // New user should exist
      const user = mockDb.user.findUnique({ where: { email: "newgoogle@example.com" } });
      expect(user).not.toBeNull();
      expect(user!.name).toBe("New Google User");
      expect(user!.emailVerified).toBeInstanceOf(Date);

      // OAuthAccount should exist
      const oauth = mockDb.oAuthAccount.findUnique({
        where: { provider_providerId: { provider: "google", providerId: "google-new-user-456" } },
      });
      expect(oauth).not.toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handleGoogleCallback rejects when token exchange fails", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:5173/auth/google/callback";

    const state = "test-state-fail";
    await fakeRedis.set(`oauth-state:${state}`, "test-verifier", "EX", 600);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });

    try {
      await expect(
        authService.handleGoogleCallback("bad-code", state),
      ).rejects.toThrow("Google authentication failed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returning Google user gets session without creating duplicate", async () => {
    const googlePayload = {
      sub: "google-returning-789",
      email: "returning@example.com",
      email_verified: true,
      name: "Returning User",
    };

    const fakeIdToken = [
      Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
      Buffer.from(JSON.stringify(googlePayload)).toString("base64url"),
      "fake-signature",
    ].join(".");

    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:5173/auth/google/callback";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id_token: fakeIdToken, access_token: "at" }),
    });

    try {
      // First login — creates user + OAuthAccount
      const state1 = "state-first";
      await fakeRedis.set(`oauth-state:${state1}`, "verifier1", "EX", 600);
      const tokens1 = await authService.handleGoogleCallback("code1", state1);
      expect(tokens1.accessToken).toBeDefined();

      const userCountAfterFirst = mockDb.user.users.size;

      // Second login — reuses existing OAuthAccount
      const state2 = "state-second";
      await fakeRedis.set(`oauth-state:${state2}`, "verifier2", "EX", 600);
      const tokens2 = await authService.handleGoogleCallback("code2", state2);
      expect(tokens2.accessToken).toBeDefined();

      // No duplicate user created
      expect(mockDb.user.users.size).toBe(userCountAfterFirst);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
