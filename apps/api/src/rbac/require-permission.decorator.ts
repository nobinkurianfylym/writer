import { SetMetadata } from "@nestjs/common";

export const PERMISSION_KEY = "rbac:permission";

export const RequirePermission = (action: string) =>
  SetMetadata(PERMISSION_KEY, action);
