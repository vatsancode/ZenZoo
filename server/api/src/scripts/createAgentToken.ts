import "dotenv/config";
import { randomBytes } from "node:crypto";
import { hashAgentToken } from "../auth/agentToken";
import { prisma } from "../shared/prisma";
import { runInTenantContext } from "../shared/tenantContext";

// Makes an agent token for a user by hand, to test the MCP server before the connect flow
// exists. Saves only the token's fingerprint (see auth/agentToken.ts) and prints the token once -
// it can't be shown again.
// Usage: pnpm exec tsx src/scripts/createAgentToken.ts '<user email>' ['<name>']

const email = process.argv[2]?.toLowerCase();
const name = process.argv[3] ?? "Test token";
if (!email) {
  console.error("Usage: tsx src/scripts/createAgentToken.ts '<user email>' ['<name>']");
  process.exit(1);
}

async function main() {
  // Same lookup sign-in uses: a plain read as app_role finds nothing until the tenant is known.
  const rows = await prisma.$queryRaw<{ user_id: string; tenant_id: string | null }[]>`
    SELECT user_id, tenant_id FROM find_login_credentials(${email})
  `;
  const found = rows[0];
  if (!found?.tenant_id) {
    throw new Error(`No active user with a shop found for ${email}`);
  }
  const actor = { userId: found.user_id, tenantId: found.tenant_id };

  const token = `zz_${randomBytes(24).toString("base64url")}`;

  await runInTenantContext(actor, async (tx) => {
    const membership = await tx.tenant_memberships.findFirst({
      where: { tenant_id: actor.tenantId, user_id: actor.userId, status: "active" },
      select: { id: true },
    });
    if (!membership) {
      throw new Error(`${email} has no active membership`);
    }
    await tx.agent_tokens.create({
      data: {
        tenant_id: actor.tenantId,
        membership_id: membership.id,
        name,
        token_prefix: token.slice(0, 8),
        token_hash: hashAgentToken(token),
      },
    });
  });

  console.log(`Token for ${email} (shown once):\n${token}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
