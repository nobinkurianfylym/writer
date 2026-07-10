import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthUser } from "@/lib/api-client";

const mockSession = vi.fn();
vi.mock("@/lib/session", () => ({
  useSession: () => mockSession(),
}));

import DashboardPage from "./page";

function withUser(user: Partial<AuthUser>) {
  mockSession.mockReturnValue({ user });
}

describe("DashboardPage", () => {
  it("greets the signed-in user and shows the teaching empty state", () => {
    withUser({ name: "Ada", email: "ada@example.com", emailVerified: true });
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: /Welcome, Ada/ })).toBeInTheDocument();
    expect(screen.getByText(/No projects yet/)).toBeInTheDocument();
    expect(screen.getByText(/Phase 2 — coming/)).toBeInTheDocument();
  });

  it("prompts to verify email when unverified", () => {
    withUser({ name: "Ada", email: "ada@example.com", emailVerified: false });
    render(<DashboardPage />);
    expect(screen.getByText(/Please verify your email/)).toBeInTheDocument();
  });

  it("hides the verify banner once verified", () => {
    withUser({ name: "Ada", email: "ada@example.com", emailVerified: true });
    render(<DashboardPage />);
    expect(screen.queryByText(/Please verify your email/)).not.toBeInTheDocument();
  });
});
