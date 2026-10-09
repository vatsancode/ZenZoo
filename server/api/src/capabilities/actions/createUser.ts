import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { hashPassword } from "../../shared/password";
import { MEMBERSHIP_SELECT, toUserDto, type UserDto } from "../users/dto";

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  roleId: string;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrengthProblem(password: string): string | null {
  if (password.length < 8) return "The password needs at least 8 characters.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "Use letters and at least one number in the password.";
  }
  return null;
}

interface AddTenantUserRow {
  user_id: string;
  membership_id: string;
}

export const createUser = defineCapability<CreateUserInput, UserDto>({
  name: "createUser",
  kind: "action",
  requiredPermission: "users:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    const email = input.email.trim();
    if (!name) throw new Error("Enter the person's name.");
    if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");
    const passwordProblem = passwordStrengthProblem(input.password);
    if (passwordProblem) throw new Error(passwordProblem);

    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(" ") || null;
    const passwordHash = await hashPassword(input.password);

    try {
      return await runInTenantContext(actor, async (tx) => {
        const rows = await tx.$queryRaw<AddTenantUserRow[]>`
          SELECT * FROM add_tenant_user(
            ${actor.tenantId}::UUID, ${input.roleId}::UUID, ${email},
            ${passwordHash}, ${firstName}, ${lastName}
          )
        `;
        const created = rows[0];
        if (!created) throw new Error("add_tenant_user returned no row");

        if (input.phone?.trim()) {
          await tx.users.update({
            where: { id: created.user_id },
            data: { phone: input.phone.trim() },
          });
        }

        const row = await tx.tenant_memberships.findUniqueOrThrow({
          where: { id: created.membership_id },
          select: MEMBERSHIP_SELECT,
        });
        return toUserDto(row, actor.userId);
      });
    } catch (error) {
      // add_tenant_user runs as a raw query (see its own migration for why),
      // so a constraint violation inside it surfaces as Prisma's generic
      // P2010 "raw query failed" wrapping Postgres's own error text, not the
      // tidier P2002/P2003 codes Prisma gives its own generated queries -
      // match on the underlying constraint name instead.
      const message = error instanceof Error ? error.message : "";
      if (/users_email_key|unique constraint/i.test(message)) {
        throw new Error("Someone with that email already exists.");
      }
      if (/tenant_memberships_role_fk/i.test(message)) {
        throw new Error("Choose a role.");
      }
      throw error;
    }
  },
});
