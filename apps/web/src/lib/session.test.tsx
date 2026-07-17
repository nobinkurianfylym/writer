import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { SessionProvider, useSession } from "./session";

/**
 * A tiny probe component that renders the session status + user email and
 * exposes the session methods on a ref for the test to drive.
 */
function Probe({ onReady }: { onReady?: (s: ReturnType<typeof useSession>) => void }) {
  const session = useSession();
  onReady?.(session);
  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="email">{session.user?.email ?? ""}</span>
    </div>
  );
}

function jsonResponse(status: number, body: unknown, ok = status < 400) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe("SessionProvider", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
    vi.restoreAllMocks();
  });

  it("becomes unauthenticated when the bootstrap refresh fails", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: { code: "X", message: "no" } })) as never;

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated"),
    );
  });

  it("bootstraps an authenticated session from the refresh cookie", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/auth/refresh")) {
        return Promise.resolve(jsonResponse(200, { accessToken: "tok", expiresIn: 600 }));
      }
      if (url.endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, {
            id: "u1",
            email: "ada@example.com",
            name: "Ada",
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    }) as never;

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("authenticated"),
    );
    expect(screen.getByTestId("email").textContent).toBe("ada@example.com");
  });

  it("logs in and then clears state on logout", async () => {
    let sessionRef: ReturnType<typeof useSession> | null = null;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/auth/refresh")) return Promise.resolve(jsonResponse(401, {}));
      if (url.endsWith("/auth/login"))
        return Promise.resolve(jsonResponse(200, { accessToken: "tok", expiresIn: 600 }));
      if (url.endsWith("/auth/me"))
        return Promise.resolve(
          jsonResponse(200, { id: "u1", email: "z@e.com", name: "Z" }),
        );
      if (url.endsWith("/auth/logout")) return Promise.resolve({ ok: true, status: 204, text: async () => "" });
      return Promise.resolve(jsonResponse(404, {}));
    }) as never;

    render(
      <SessionProvider>
        <Probe onReady={(s) => (sessionRef = s)} />
      </SessionProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated"),
    );

    await act(async () => {
      await sessionRef!.login("z@e.com", "pw");
    });
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(sessionRef!.getAccessToken()).toBe("tok");

    await act(async () => {
      await sessionRef!.logout();
    });
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    expect(sessionRef!.getAccessToken()).toBeNull();
  });
});
