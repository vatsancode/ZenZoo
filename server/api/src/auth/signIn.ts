import { prisma } from "../shared/prisma";
import { verifyPassword } from "../shared/password";
import { signSessionToken } from "../shared/jwt";
import type { SessionPayload } from "./session";

// Same purpose as platform-admin.ts's DUMMY_HASH: compare against a real
// bcrypt hash even on a lookup miss, so a wrong email doesn't return
// obviously faster than a wrong password and let a caller enumerate emails.
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Y.Ks5xjv1qhOqUi1dZTjzFl9nqBJS";

export interface SignInSuccess {
  token: string;
  payload: SessionPayload;
}

interface LoginCredentialsRow {
  user_id: string;
  password_hash: string;
  tenant_id: string | null;
}

/**
 * Tries platform_admins first, then tenant users - the two separate
 * identity spaces described in platform-admin.ts. Returns null for any
 * failure (unknown email in either bucket, wrong password, no active
 * membership) without saying which, so a failed attempt never reveals
 * which bucket an email belongs to.
 *
 * The tenant-user lookup goes through find_login_credentials() rather
 * than a plain Prisma query - see that function's migration for why a
 * direct `users`/`tenant_memberships` read as app_role returns nothing
 * at this point, regardless of whether the credentials are correct.
 */
export async function signIn(email: string, password: string): Promise<SignInSuccess | null> {
  const normalizedEmail = email.toLowerCase();

  const admin = await prisma.platform_admins.findUnique({ where: { email: normalizedEmail } });
  const adminMatches = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);
  if (admin && adminMatches) {
    const payload: SessionPayload = { kind: "platform_admin", adminId: admin.id };
    return { token: signSessionToken(payload), payload };
  }

  const rows = await prisma.$queryRaw<LoginCredentialsRow[]>`
    SELECT * FROM find_login_credentials(${normalizedEmail})
  `;
  const credentials = rows[0];
  const userMatches = await verifyPassword(password, credentials?.password_hash ?? DUMMY_HASH);
  if (!credentials || !userMatches || !credentials.tenant_id) {
    return null;
  }

  const payload: SessionPayload = {
    kind: "tenant_user",
    userId: credentials.user_id,
    tenantId: credentials.tenant_id,
  };
  return { token: signSessionToken(payload), payload };
}
