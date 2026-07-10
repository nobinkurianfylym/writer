"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, authApi, ApiError, type AuthUser } from "./api-client";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

interface SessionValue {
  status: SessionStatus;
  user: AuthUser | null;
  /** Current in-memory access token (never persisted to storage). */
  getAccessToken: () => string | null;
  /**
   * Authenticated request against the API: injects the bearer token and, on a
   * 401, silently refreshes once via the cookie and retries.
   */
  apiRequest: <T>(path: string, opts?: ApiRequestOptions) => Promise<T>;
  register: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithMagicToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  // Access token lives in a ref (memory only) — never in localStorage/cookies
  // readable by JS, to keep it out of reach of XSS.
  const tokenRef = useRef<string | null>(null);

  const getAccessToken = useCallback(() => tokenRef.current, []);

  const loadUser = useCallback(async (token: string) => {
    const me = await authApi.me(token);
    tokenRef.current = token;
    setUser(me);
    setStatus("authenticated");
  }, []);

  // Bootstrap: attempt a silent refresh using the httpOnly cookie.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const { accessToken } = await authApi.refresh(controller.signal);
        await loadUser(accessToken);
      } catch {
        tokenRef.current = null;
        setUser(null);
        setStatus("unauthenticated");
      }
    })();
    return () => controller.abort();
  }, [loadUser]);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const { accessToken } = await authApi.register(name, email, password);
      await loadUser(accessToken);
    },
    [loadUser],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await authApi.login(email, password);
      await loadUser(accessToken);
    },
    [loadUser],
  );

  const loginWithMagicToken = useCallback(
    async (token: string) => {
      const { accessToken } = await authApi.verifyMagicLink(token);
      await loadUser(accessToken);
    },
    [loadUser],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout(tokenRef.current);
    } finally {
      tokenRef.current = null;
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (tokenRef.current) {
      const me = await authApi.me(tokenRef.current);
      setUser(me);
    }
  }, []);

  const apiRequest = useCallback(
    async <T,>(path: string, opts: ApiRequestOptions = {}): Promise<T> => {
      try {
        return await apiFetch<T>(path, {
          ...opts,
          accessToken: tokenRef.current,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          const { accessToken } = await authApi.refresh();
          tokenRef.current = accessToken;
          return await apiFetch<T>(path, { ...opts, accessToken });
        }
        throw err;
      }
    },
    [],
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      getAccessToken,
      apiRequest,
      register,
      login,
      loginWithMagicToken,
      logout,
      refreshUser,
    }),
    [status, user, getAccessToken, apiRequest, register, login, loginWithMagicToken, logout, refreshUser],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
