import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ProjectPage } from "@fylym/contracts";
import { useRenameProject, qk } from "./hooks";

const apiRequest = vi.fn();
vi.mock("./session", () => ({
  useSession: () => ({ apiRequest }),
}));

const ORG = "org-1";

function makeProject(id: string, title: string) {
  return {
    id,
    orgId: ORG,
    title,
    logline: null,
    genre: [],
    format: "FEATURE" as const,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData<ProjectPage>(qk.projects(ORG), {
    items: [makeProject("p1", "Old Title")],
    nextCursor: null,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

function title(client: QueryClient) {
  return client.getQueryData<ProjectPage>(qk.projects(ORG))?.items[0]?.title;
}

describe("useRenameProject (optimistic)", () => {
  it("updates the cache immediately then keeps it on success", async () => {
    apiRequest.mockResolvedValue(makeProject("p1", "New Title"));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useRenameProject(ORG), { wrapper });

    act(() => {
      result.current.mutate({ id: "p1", title: "New Title" });
    });

    // Optimistic: cache reflects the new title synchronously.
    await waitFor(() => expect(title(client)).toBe("New Title"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(title(client)).toBe("New Title");
  });

  it("rolls back to the previous title when the request fails", async () => {
    apiRequest.mockRejectedValue(new Error("network down"));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useRenameProject(ORG), { wrapper });

    act(() => {
      result.current.mutate({ id: "p1", title: "Doomed Title" });
    });

    // Once the mutation errors, the cache is rolled back to the snapshot.
    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() => expect(title(client)).toBe("Old Title"));
  });
});
