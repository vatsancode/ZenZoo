import type { TenantTx } from "../../shared/tenantContext";

/** Trims and collapses repeated spaces, so "Store  helper" and "Store helper" are one name. */
export function cleanRoleName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** True when another role in this shop already has this name, ignoring upper/lower case. */
export async function roleNameTaken(
  tx: TenantTx,
  tenantId: string,
  name: string,
  exceptRoleId?: string,
): Promise<boolean> {
  const clash = await tx.roles.findFirst({
    where: {
      tenant_id: tenantId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptRoleId ? { id: { not: exceptRoleId } } : {}),
    },
    select: { id: true },
  });
  return clash !== null;
}

const MAX_ROLE_NAME = 50;
const MAX_ROLE_DESCRIPTION = 200;

/** A plain message when a role's name or description is longer than its column allows, else null. */
export function roleLengthProblem(name: string, description: string): string | null {
  if (name.length > MAX_ROLE_NAME) {
    return `The role name can be at most ${MAX_ROLE_NAME} characters.`;
  }
  if (description.length > MAX_ROLE_DESCRIPTION) {
    return `The description can be at most ${MAX_ROLE_DESCRIPTION} characters.`;
  }
  return null;
}

export const ROLE_NAME_TAKEN = "There is already a role with that name.";
