import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { MEMBERSHIP_SELECT, toUserDto, type UserDto } from "../users/dto";

export interface SetUserStatusInput {
  id: string;
  disabled: boolean;
}

/**
 * Disabling is a membership-level fact (tenant_memberships.status), not a
 * users.status change - see users' own notes: a person is independent of
 * which shop they work at, so "disabled at Fresh Mart" says nothing about
 * their account anywhere else.
 */
export const setUserStatus = defineCapability<SetUserStatusInput, UserDto>({
  name: "setUserStatus",
  kind: "action",
  requiredPermission: "users:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      // input.id is the USER's id (see resetUserPassword.ts's identical note).
      const membership = await tx.tenant_memberships.findFirst({
        where: { tenant_id: actor.tenantId, user_id: input.id, status: { not: "removed" } },
        select: { id: true, user_id: true },
      });
      if (!membership) throw new Error("That user no longer exists.");
      if (input.disabled && membership.user_id === actor.userId) {
        throw new Error("You can't turn off your own access.");
      }

      try {
        await tx.tenant_memberships.update({
          where: { id: membership.id },
          data: { status: input.disabled ? "suspended" : "active" },
        });
        // trg_tenant_memberships_owner_guard is DEFERRABLE INITIALLY DEFERRED
        // (see "The owner invariant") - it only fires at COMMIT, which here
        // happens after this handler returns, outside this try/catch. Force
        // it to run now instead, so a violation surfaces where it can be
        // turned into a friendly message rather than failing the whole
        // $transaction uncatchably once Prisma commits it.
        await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
      } catch (error) {
        // trg_tenant_memberships_owner_guard (see "The owner invariant") -
        // this would be the tenant's last active owner.
        const message = error instanceof Error ? error.message : "";
        if (/must retain at least one active owner/i.test(message)) {
          throw new Error("There has to be at least one active owner.");
        }
        throw error;
      }

      const row = await tx.tenant_memberships.findUniqueOrThrow({
        where: { id: membership.id },
        select: MEMBERSHIP_SELECT,
      });
      return toUserDto(row, actor.userId);
    });
  },
});
