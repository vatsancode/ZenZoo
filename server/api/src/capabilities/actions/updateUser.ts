import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { MEMBERSHIP_SELECT, toUserDto, type UserDto } from "../users/dto";

export interface UpdateUserInput {
  id: string;
  name: string;
  email: string;
  phone?: string;
  roleId: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const updateUser = defineCapability<UpdateUserInput, UserDto>({
  name: "updateUser",
  kind: "action",
  requiredPermission: "users:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    const email = input.email.trim();
    if (!name) throw new Error("Enter the person's name.");
    if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");

    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(" ") || null;

    try {
      return await runInTenantContext(actor, async (tx) => {
        // input.id is the USER's id (see resetUserPassword.ts's identical note).
        const membership = await tx.tenant_memberships.findFirst({
          where: { tenant_id: actor.tenantId, user_id: input.id, status: { not: "removed" } },
          select: { id: true, user_id: true },
        });
        if (!membership?.user_id) throw new Error("That user no longer exists.");

        await tx.users.update({
          where: { id: membership.user_id },
          data: { email, first_name: firstName, last_name: lastName, phone: input.phone?.trim() || null },
        });

        try {
          await tx.tenant_memberships.update({
            where: { id: membership.id },
            data: { role_id: input.roleId },
          });
          // trg_tenant_memberships_owner_guard is DEFERRABLE INITIALLY DEFERRED
          // (see "The owner invariant") - catches moving the tenant's last
          // owner to a non-owner role, but only at COMMIT unless forced now,
          // same reasoning as setUserStatus.ts's identical line.
          await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
        } catch (error) {
          // tenant_memberships_role_fk - the chosen role doesn't belong to this tenant.
          // This is a plain Prisma-generated UPDATE (not a raw query), so it gets the
          // tidy P2003 code rather than createUser.ts's raw-Postgres-text matching.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
            throw new Error("Choose a role.");
          }
          const message = error instanceof Error ? error.message : "";
          if (/must retain at least one active owner/i.test(message)) {
            throw new Error("There has to be at least one owner.");
          }
          throw error;
        }

        const row = await tx.tenant_memberships.findUniqueOrThrow({
          where: { id: membership.id },
          select: MEMBERSHIP_SELECT,
        });
        return toUserDto(row, actor.userId);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("Someone with that email already exists.");
      }
      throw error;
    }
  },
});
