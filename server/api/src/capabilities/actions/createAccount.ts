import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { assertFits, cleanName, firstFreeCode } from "../../shared/names";
import { ACCOUNT_SELECT, toAccountDto, type AccountDto } from "../accounts/dto";

export interface CreateAccountInput {
  storeId: string;
  name: string;
  /** A short slug the frontend derives from the name, e.g. "hdfc-current". */
  code: string;
  openingBalance: number;
}

const CODE_PATTERN = /^[a-z0-9-]+$/;

export const createAccount = defineCapability<CreateAccountInput, AccountDto>({
  name: "createAccount",
  kind: "action",
  requiredPermission: "accounts:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    const name = cleanName(input.name);
    if (!name) throw new Error("Give the account a name.");
    assertFits(name, 200, "The account name");
    // The code is only a hint: a name with no English letters sends none, and it is made
    // unique below, so it is never a reason to refuse an account.
    const requestedCode = input.code.trim().toLowerCase();
    if (requestedCode && !CODE_PATTERN.test(requestedCode)) {
      throw new Error("Account code can only use lowercase letters, numbers, and dashes.");
    }
    if (input.openingBalance < 0) throw new Error("Opening balance can't be negative.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const clash = await tx.payment_accounts.findFirst({
          where: {
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            name: { equals: name, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (clash) throw new Error("An account with this name already exists.");

        const code = await firstFreeCode(requestedCode || "account", "-", 50, async (candidate) => {
          const taken = await tx.payment_accounts.findFirst({
            where: { tenant_id: actor.tenantId, store_id: input.storeId, code: candidate },
            select: { id: true },
          });
          return taken !== null;
        });

        const created = await tx.payment_accounts.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            name,
            code,
            opening_balance: input.openingBalance,
            balance: input.openingBalance,
          },
          select: ACCOUNT_SELECT,
        });
        return toAccountDto(created);
      });
    } catch (error) {
      // payment_accounts_tenant_store_code_unique - only if the same account was added at the same moment
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("An account with this name already exists.");
      }
      throw error;
    }
  },
});
