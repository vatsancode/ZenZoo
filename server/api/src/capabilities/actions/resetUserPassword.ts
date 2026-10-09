import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { hashPassword } from "../../shared/password";

export interface ResetUserPasswordInput {
  id: string;
  password: string;
}

function passwordStrengthProblem(password: string): string | null {
  if (password.length < 8) return "The password needs at least 8 characters.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "Use letters and at least one number in the password.";
  }
  return null;
}

/**
 * No new database door needed, unlike createUser - updating an existing
 * teammate's record (tenant_membership_or_self, see "Row-level security")
 * is already something a fellow tenant member is allowed to do, so this is
 * a plain UPDATE through the ordinary ORM path.
 */
export const resetUserPassword = defineCapability<ResetUserPasswordInput, { id: string }>({
  name: "resetUserPassword",
  kind: "action",
  requiredPermission: "users:edit",
  async handler(actor, input) {
    const problem = passwordStrengthProblem(input.password);
    if (problem) throw new Error(problem);

    return runInTenantContext(actor, async (tx) => {
      // input.id is the USER's id, the same id listUsers/createUser hand
      // back as UserDto.id - not the tenant_memberships row's own id.
      const membership = await tx.tenant_memberships.findFirst({
        where: { tenant_id: actor.tenantId, user_id: input.id, status: { not: "removed" } },
        select: { user_id: true },
      });
      if (!membership?.user_id) throw new Error("That user no longer exists.");

      const passwordHash = await hashPassword(input.password);
      await tx.users.update({
        where: { id: membership.user_id },
        data: { password_hash: passwordHash },
      });
      return { id: input.id };
    });
  },
});
