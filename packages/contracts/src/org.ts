import { z } from "zod";
import { registry } from "./registry.js";

export const PlanSchema = registry.register(
  "Plan",
  z.enum(["FREE", "PRO", "STUDIO", "ENTERPRISE"]).openapi("Plan"),
);

export type Plan = z.infer<typeof PlanSchema>;

export const OrgRoleSchema = registry.register(
  "OrgRole",
  z.enum(["OWNER", "ADMIN", "MEMBER", "GUEST"]).openapi("OrgRole"),
);

export type OrgRole = z.infer<typeof OrgRoleSchema>;

export const OrgSchema = registry.register(
  "Org",
  z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      plan: PlanSchema,
      role: OrgRoleSchema,
    })
    .openapi("Org"),
);

export type Org = z.infer<typeof OrgSchema>;

export const OrgListSchema = registry.register(
  "OrgList",
  z.object({ items: z.array(OrgSchema) }).openapi("OrgList"),
);

export type OrgList = z.infer<typeof OrgListSchema>;
