import type { OrgRole, ProjectRole } from "@fylym/db";

export interface PolicyRule {
  orgRoles?: OrgRole[];
  projectRoles?: ProjectRole[];
}

export const POLICY_TABLE: Record<string, PolicyRule> = {
  // Org-level actions
  "org.read": { orgRoles: ["OWNER", "ADMIN", "MEMBER", "GUEST"] },
  "org.update": { orgRoles: ["OWNER", "ADMIN"] },
  "org.delete": { orgRoles: ["OWNER"] },
  "org.members.list": { orgRoles: ["OWNER", "ADMIN", "MEMBER"] },
  "org.members.invite": { orgRoles: ["OWNER", "ADMIN"] },
  "org.members.update": { orgRoles: ["OWNER", "ADMIN"] },
  "org.members.remove": { orgRoles: ["OWNER", "ADMIN"] },

  // Project-level actions (org role OR project role grants access)
  "project.create": { orgRoles: ["OWNER", "ADMIN", "MEMBER"] },
  "project.list": { orgRoles: ["OWNER", "ADMIN", "MEMBER", "GUEST"] },
  "project.read": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER", "EDITOR", "COMMENTER", "READER"],
  },
  "project.update": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER"],
  },
  "project.delete": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER"],
  },

  // Script-level actions (inherit from project access)
  "script.create": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER"],
  },
  "script.list": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER", "EDITOR", "COMMENTER", "READER"],
  },
  "script.read": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER", "EDITOR", "COMMENTER", "READER"],
  },
  "script.update": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER"],
  },
  "script.delete": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER"],
  },
  "script.state.read": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER", "EDITOR", "COMMENTER", "READER"],
  },
  "script.state.write": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER"],
  },
  "script.snapshot.create": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER"],
  },
  "script.snapshot.list": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER", "EDITOR", "COMMENTER", "READER"],
  },
  "script.snapshot.restore": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER"],
  },
  "script.export": {
    orgRoles: ["OWNER", "ADMIN"],
    projectRoles: ["OWNER", "WRITER", "EDITOR", "COMMENTER", "READER"],
  },
};

export function evaluatePolicy(
  action: string,
  orgRole: OrgRole | null,
  projectRole: ProjectRole | null,
): boolean {
  const rule = POLICY_TABLE[action];
  if (!rule) return false;

  if (orgRole && rule.orgRoles?.includes(orgRole)) return true;
  if (projectRole && rule.projectRoles?.includes(projectRole)) return true;

  return false;
}
