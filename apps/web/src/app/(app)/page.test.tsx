import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Org, Project } from "@fylym/contracts";

const mockSession = vi.fn();
const mockUseOrgs = vi.fn();
const mockUseProjects = vi.fn();
const mutate = vi.fn();

vi.mock("@/lib/session", () => ({ useSession: () => mockSession() }));
vi.mock("@/lib/hooks", () => ({
  useOrgs: () => mockUseOrgs(),
  useProjects: () => mockUseProjects(),
  useCreateProject: () => ({ mutateAsync: mutate, isPending: false }),
  useRenameProject: () => ({ mutate }),
  useTrashProject: () => ({ mutate }),
}));

import DashboardPage from "./page";

const org: Org = { id: "o1", name: "Ada's workspace", slug: "ada-1", plan: "FREE", role: "OWNER" };

beforeEach(() => {
  mockSession.mockReturnValue({ user: { id: "u1", email: "ada@example.com", name: "Ada" } });
  mockUseOrgs.mockReturnValue({ data: [org], isLoading: false });
  mockUseProjects.mockReturnValue({ data: [], isLoading: false });
});

describe("DashboardPage", () => {
  it("shows the workspace name and a create-project form", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "Ada's workspace" })).toBeInTheDocument();
    expect(screen.getByLabelText("New project title")).toBeInTheDocument();
  });

  it("teaches with an empty state when there are no projects", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/No projects yet/)).toBeInTheDocument();
    expect(screen.getByText(/Phase 2 — coming/)).toBeInTheDocument();
  });

  it("lists projects with open and rename affordances", () => {
    const project: Project = {
      id: "p1",
      orgId: "o1",
      title: "My Feature",
      logline: null,
      genre: [],
      format: "FEATURE",
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockUseProjects.mockReturnValue({ data: [project], isLoading: false });
    render(<DashboardPage />);

    expect(screen.getByRole("button", { name: "Rename My Feature" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/projects/p1");
  });

});
