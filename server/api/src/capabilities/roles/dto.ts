import { PERMISSION_AREAS, type AccessLevel } from "../../shared/permissionAreas";

export interface RoleDto {
  id: string;
  name: string;
  description: string;
  isOwnerRole: boolean;
  permissions: Record<string, AccessLevel>;
}

interface RoleRow {
  id: string;
  name: string;
  description: string;
  is_owner_role: boolean;
  role_permissions: { area: string; access_level: string }[];
}

/** Fills in "none" for any area a role has no row for - see role_permissions' own "no row means none" note. */
export function toRoleDto(row: RoleRow): RoleDto {
  const permissions = Object.fromEntries(
    PERMISSION_AREAS.map((area) => [
      area,
      (row.role_permissions.find((p) => p.area === area)?.access_level ?? "none") as AccessLevel,
    ]),
  ) as Record<string, AccessLevel>;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isOwnerRole: row.is_owner_role,
    permissions,
  };
}

export const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  is_owner_role: true,
  role_permissions: { select: { area: true, access_level: true } },
} as const;
