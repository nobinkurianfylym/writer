"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  OrgList,
  Org,
  ProjectPage,
  Project,
  CreateProject,
  ScriptPage,
  Script,
  CreateScript,
} from "@fylym/contracts";
import { useSession } from "./session";

/* ── Query keys ── */

export const qk = {
  orgs: ["orgs"] as const,
  projects: (orgId: string) => ["projects", orgId] as const,
  projectsTrash: (orgId: string) => ["projects", orgId, "trash"] as const,
  scripts: (projectId: string) => ["scripts", projectId] as const,
};

/* ── Orgs ── */

export function useOrgs() {
  const { apiRequest } = useSession();
  return useQuery({
    queryKey: qk.orgs,
    queryFn: () => apiRequest<OrgList>("/v1/orgs"),
    select: (data) => data.items,
  });
}

/* ── Projects ── */

export function useProjects(orgId: string | undefined, trash = false) {
  const { apiRequest } = useSession();
  return useQuery({
    queryKey: trash ? qk.projectsTrash(orgId ?? "") : qk.projects(orgId ?? ""),
    enabled: Boolean(orgId),
    queryFn: () =>
      apiRequest<ProjectPage>(
        `/v1/orgs/${orgId}/projects${trash ? "?trash=true" : ""}`,
      ),
    select: (data) => data.items,
  });
}

export function useCreateProject(orgId: string) {
  const { apiRequest } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProject) =>
      apiRequest<Project>(`/v1/orgs/${orgId}/projects`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.projects(orgId) });
    },
  });
}

/**
 * Optimistic rename: the project title updates in the cache immediately, and
 * rolls back to the snapshot if the request fails.
 */
export function useRenameProject(orgId: string) {
  const { apiRequest } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiRequest<Project>(`/v1/projects/${id}`, {
        method: "PATCH",
        body: { title },
      }),
    onMutate: async ({ id, title }) => {
      const key = qk.projects(orgId);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ProjectPage>(key);
      client.setQueryData<ProjectPage>(key, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((p) =>
                p.id === id ? { ...p, title } : p,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        client.setQueryData(qk.projects(orgId), context.previous);
      }
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.projects(orgId) });
    },
  });
}

export function useTrashProject(orgId: string) {
  const { apiRequest } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/v1/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateProjects(client, orgId),
  });
}

export function useRestoreProject(orgId: string) {
  const { apiRequest } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<Project>(`/v1/projects/${id}/restore`, { method: "POST" }),
    onSuccess: () => invalidateProjects(client, orgId),
  });
}

function invalidateProjects(client: QueryClient, orgId: string) {
  void client.invalidateQueries({ queryKey: qk.projects(orgId) });
  void client.invalidateQueries({ queryKey: qk.projectsTrash(orgId) });
}

/* ── Scripts ── */

export function useScripts(projectId: string | undefined) {
  const { apiRequest } = useSession();
  return useQuery({
    queryKey: qk.scripts(projectId ?? ""),
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<ScriptPage>(`/v1/projects/${projectId}/scripts`),
    select: (data) => data.items,
  });
}

export function useCreateScript(projectId: string) {
  const { apiRequest } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScript) =>
      apiRequest<Script>(`/v1/projects/${projectId}/scripts`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.scripts(projectId) });
    },
  });
}

export function useRenameScript(projectId: string) {
  const { apiRequest } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiRequest<Script>(`/v1/scripts/${id}`, {
        method: "PATCH",
        body: { title },
      }),
    onMutate: async ({ id, title }) => {
      const key = qk.scripts(projectId);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ScriptPage>(key);
      client.setQueryData<ScriptPage>(key, (old) =>
        old
          ? { ...old, items: old.items.map((s) => (s.id === id ? { ...s, title } : s)) }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        client.setQueryData(qk.scripts(projectId), context.previous);
      }
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.scripts(projectId) });
    },
  });
}

export function useTrashScript(projectId: string) {
  const { apiRequest } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/v1/scripts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.scripts(projectId) });
    },
  });
}

export type { Org, Project, Script };
