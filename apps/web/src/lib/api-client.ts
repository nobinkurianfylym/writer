/**
 * Thin typed client for the FYLYM API. Every request is credentialed
 * (`credentials: "include"`) so the httpOnly refresh cookie flows to
 * `/auth/*`, and non-2xx responses are surfaced as `ApiError` carrying the
 * §6 error envelope's `code`/`message`.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  accessToken?: string | null;
  signal?: AbortSignal;
}

export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.accessToken) headers["Authorization"] = `Bearer ${opts.accessToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    const envelope = data as
      | { error?: { code?: string; message?: string } }
      | undefined;
    throw new ApiError(
      res.status,
      envelope?.error?.code ?? "UNKNOWN",
      envelope?.error?.message ?? `Request failed with status ${res.status}`,
    );
  }

  return data as T;
}

/* ── Auth response shapes ── */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
}

export interface RegisterResponse extends TokenResponse {
  userId: string;
}

export const authApi = {
  register(name: string, email: string, password: string) {
    return apiFetch<RegisterResponse>("/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
  },
  login(email: string, password: string) {
    return apiFetch<TokenResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
  },
  refresh(signal?: AbortSignal) {
    return apiFetch<TokenResponse>("/auth/refresh", {
      method: "POST",
      signal,
    });
  },
  logout(accessToken: string | null) {
    return apiFetch<void>("/auth/logout", { method: "POST", accessToken });
  },
  me(accessToken: string, signal?: AbortSignal) {
    return apiFetch<AuthUser>("/auth/me", { accessToken, signal });
  },
  requestMagicLink(email: string) {
    return apiFetch<{ message: string }>("/auth/magic-link", {
      method: "POST",
      body: { email },
    });
  },
  verifyMagicLink(token: string) {
    return apiFetch<TokenResponse>("/auth/magic-link/verify", {
      method: "POST",
      body: { token },
    });
  },
};
