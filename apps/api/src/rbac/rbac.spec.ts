import { describe, it, expect } from "vitest";
import type { OrgRole, ProjectRole } from "@fylym/db";
import { evaluatePolicy, POLICY_TABLE } from "./policy-table";

const ORG_ROLES: OrgRole[] = ["OWNER", "ADMIN", "MEMBER", "GUEST"];
const PROJECT_ROLES: ProjectRole[] = [
  "OWNER",
  "WRITER",
  "EDITOR",
  "COMMENTER",
  "READER",
];

describe("RBAC policy table", () => {
  it("every action in the policy table is a non-empty string", () => {
    for (const action of Object.keys(POLICY_TABLE)) {
      expect(action.length).toBeGreaterThan(0);
      expect(action).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
    }
  });

  /* ── Org-level actions ── */

  const orgOnlyActions: Record<string, OrgRole[]> = {
    "org.read": ["OWNER", "ADMIN", "MEMBER", "GUEST"],
    "org.update": ["OWNER", "ADMIN"],
    "org.delete": ["OWNER"],
    "org.members.list": ["OWNER", "ADMIN", "MEMBER"],
    "org.members.invite": ["OWNER", "ADMIN"],
    "org.members.update": ["OWNER", "ADMIN"],
    "org.members.remove": ["OWNER", "ADMIN"],
    "project.create": ["OWNER", "ADMIN", "MEMBER"],
    "project.list": ["OWNER", "ADMIN", "MEMBER", "GUEST"],
  };

  describe("org-level actions — RBAC matrix", () => {
    for (const [action, allowedRoles] of Object.entries(orgOnlyActions)) {
      for (const role of ORG_ROLES) {
        const expected = allowedRoles.includes(role);
        it(`${action} + orgRole=${role} → ${expected ? "ALLOW" : "DENY"}`, () => {
          expect(evaluatePolicy(action, role, null)).toBe(expected);
        });
      }
    }
  });

  /* ── Project-level actions ── */

  const projectActions: Record<
    string,
    { orgRoles: OrgRole[]; projectRoles: ProjectRole[] }
  > = {
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
  };

  describe("project-level actions — RBAC matrix (org role path)", () => {
    for (const [action, rule] of Object.entries(projectActions)) {
      for (const role of ORG_ROLES) {
        const expected = rule.orgRoles.includes(role);
        it(`${action} + orgRole=${role} → ${expected ? "ALLOW" : "DENY"}`, () => {
          expect(evaluatePolicy(action, role, null)).toBe(expected);
        });
      }
    }
  });

  describe("project-level actions — RBAC matrix (project role path)", () => {
    for (const [action, rule] of Object.entries(projectActions)) {
      for (const role of PROJECT_ROLES) {
        const expected = rule.projectRoles.includes(role);
        it(`${action} + projectRole=${role} → ${expected ? "ALLOW" : "DENY"}`, () => {
          expect(evaluatePolicy(action, null, role)).toBe(expected);
        });
      }
    }
  });

  /* ── Edge cases ── */

  it("unknown action is always denied", () => {
    expect(evaluatePolicy("nonexistent.action", "OWNER", "OWNER")).toBe(false);
  });

  it("no role at all is denied for any action", () => {
    for (const action of Object.keys(POLICY_TABLE)) {
      expect(evaluatePolicy(action, null, null)).toBe(false);
    }
  });

  it("org role + project role — either grants access", () => {
    // GUEST org role can't update projects, but WRITER project role can
    expect(evaluatePolicy("project.update", "GUEST", "WRITER")).toBe(true);
    // ADMIN org role can update projects even without project role
    expect(evaluatePolicy("project.update", "ADMIN", null)).toBe(true);
  });
});
