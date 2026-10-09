import { redirectToSignInIfUnauthorized } from "../../lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const ACCESS_LEVELS = ["none", "view", "edit", "delete"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  none: "No access",
  view: "Can view",
  edit: "Can view and change",
  delete: "Can view, change and delete",
};

/** The areas of the app a role can be given access to - must match server/api/src/shared/permissionAreas.ts exactly. */
export const PERMISSION_AREAS = [
  { id: "dashboard", label: "Dashboard", note: "Sales, profit and the numbers that matter." },
  { id: "stocks", label: "Stocks", note: "Products, variants, batches and stock movements." },
  { id: "catalogue", label: "Catalogue", note: "Services and other items that aren't stock." },
  { id: "vendors", label: "Vendors", note: "Who you buy from." },
  { id: "purchases", label: "Purchases", note: "Buying, receiving, paying and returning." },
  { id: "expenses", label: "Expenses", note: "Running costs like rent and salaries." },
  { id: "pos", label: "Point of Sale", note: "Making a sale at the till." },
  { id: "sales", label: "Sales", note: "Past sales and customer returns." },
  { id: "customers", label: "Customers", note: "Customers, store credit and dues." },
  {
    id: "settings",
    label: "Settings",
    note: "Categories, accounts, payment methods and the audit log.",
  },
  { id: "users", label: "Users and roles", note: "Who can sign in and what they can do." },
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number]["id"];
export type Permissions = Record<PermissionArea, AccessLevel>;

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permissions;
  /** The Owner role can't be changed or removed, so there is always someone who can do everything. */
  locked?: boolean;
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: Permissions;
}

interface RoleResponse {
  id: string;
  name: string;
  description: string;
  isOwnerRole: boolean;
  permissions: Partial<Permissions>;
}

const noAccess = (): Permissions =>
  Object.fromEntries(PERMISSION_AREAS.map((area) => [area.id, "none"])) as Permissions;

function toRole(response: RoleResponse): Role {
  return {
    id: response.id,
    name: response.name,
    description: response.description,
    permissions: { ...noAccess(), ...response.permissions },
    locked: response.isOwnerRole || undefined,
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

export function roleSummary(role: Role): string {
  const levels = Object.values(role.permissions);
  const canChange = levels.filter((level) => level === "edit" || level === "delete").length;
  const viewOnly = levels.filter((level) => level === "view").length;
  if (levels.every((level) => level === "delete")) return "Full access";
  return `${canChange} can change · ${viewOnly} view only`;
}

/** Lists this tenant's roles from the real API - requires at least "users:view". */
export async function listRoles(): Promise<Role[]> {
  const response = await fetch(`${API_URL}/roles`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as RoleResponse[];
  return data.map(toRole);
}

/** Creates a role for this tenant - requires "users:edit". Returns an error message, or null on success. */
export async function addRole(input: RoleInput): Promise<string | null> {
  const response = await fetch(`${API_URL}/roles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}

/** Edits an existing (non-Owner) role - requires "users:edit". Returns an error message, or null on success. */
export async function editRole(id: string, input: RoleInput): Promise<string | null> {
  const response = await fetch(`${API_URL}/roles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}

/** Deletes a role - requires "users:delete". Returns an error message, or null on success. */
export async function removeRole(id: string): Promise<string | null> {
  const response = await fetch(`${API_URL}/roles/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}
