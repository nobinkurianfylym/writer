// Import from the public "@prisma/client" package rather than the generated
// ".prisma/client" location: the latter is a bare specifier starting with a
// dot, which Node's ESM loader rejects, so it only resolved under a bundler
// alias. "@prisma/client" re-exports the same client and is ESM-importable.
export { PrismaClient } from "@prisma/client";
export { createPrismaClient } from "./client.js";
export type {
  User,
  OAuthAccount,
  Session,
  Organization,
  Membership,
  Project,
  ProjectCollaborator,
  Script,
  SceneIndex,
  Snapshot,
  AuditLog,
  Plan,
  OrgRole,
  ProjectRole,
  ScriptFormat,
  SnapshotKind,
} from "@prisma/client";
