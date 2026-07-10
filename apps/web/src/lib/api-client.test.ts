import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError, authApi } from "./api-client";

function mockFetch(status: number, body?: unknown, ok = status < 400) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });
}

describe("apiFetch", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
    vi.restoreAllMocks();
  });

  it("sends credentialed requests and parses JSON", async () => {
    const fetchMock = mockFetch(200, { accessToken: "t", expiresIn: 600 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiFetch<{ accessToken: string }>("/auth/login", {
      method: "POST",
      body: { email: "a@b.com", password: "x" },
    });

    expect(result.accessToken).toBe("t");
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("attaches the bearer token when provided", async () => {
    const fetchMock = mockFetch(200, { id: "u1" });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch("/auth/me", { accessToken: "abc" });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers["Authorization"]).toBe("Bearer abc");
  });

  it("returns undefined for 204 responses", async () => {
    globalThis.fetch = mockFetch(204) as unknown as typeof fetch;
    await expect(apiFetch("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("throws ApiError carrying the envelope code and message", async () => {
    globalThis.fetch = mockFetch(401, {
      error: { code: "UNAUTHORIZED", message: "Invalid credentials" },
    }) as unknown as typeof fetch;

    await expect(apiFetch("/auth/login", { method: "POST" })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid credentials",
    });
  });

  it("falls back to a generic message when no envelope is present", async () => {
    globalThis.fetch = mockFetch(500, undefined, false) as unknown as typeof fetch;
    const err = await apiFetch("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("UNKNOWN");
    expect((err as ApiError).status).toBe(500);
  });
});

describe("authApi", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = mockFetch(200, { accessToken: "t", expiresIn: 600 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("register posts name, email, password", async () => {
    await authApi.register("Ada", "ada@example.com", "pw");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/auth/register");
    expect(JSON.parse(init.body)).toEqual({
      name: "Ada",
      email: "ada@example.com",
      password: "pw",
    });
  });

  it("requestMagicLink posts the email", async () => {
    await authApi.requestMagicLink("ada@example.com");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/auth/magic-link");
    expect(JSON.parse(init.body)).toEqual({ email: "ada@example.com" });
  });

  it("verifyMagicLink posts the token", async () => {
    await authApi.verifyMagicLink("tok");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/auth/magic-link/verify");
    expect(JSON.parse(init.body)).toEqual({ token: "tok" });
  });
});
