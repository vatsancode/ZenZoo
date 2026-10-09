/**
 * The exact areas/levels role_permissions enforces (docs/db-design.md) and
 * the admin UI's permission grid already uses
 * (apps/admin/features/settings/users.ts's PERMISSION_AREAS/ACCESS_LEVELS) -
 * kept in one place so the backend and that grid can never silently drift
 * apart on what an "area" or "level" is.
 */
export const PERMISSION_AREAS = [
  "dashboard",
  "stocks",
  "catalogue",
  "vendors",
  "purchases",
  "expenses",
  "pos",
  "sales",
  "customers",
  "settings",
  "users",
] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number];

export const ACCESS_LEVELS = ["none", "view", "edit", "delete"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LEVEL_RANK: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  delete: 3,
};
