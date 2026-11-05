import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { ACCOUNT_SELECT, toAccountDto, type AccountDto } from "../accounts/dto";

export interface ListAccountsInput {
  storeId: string;
}

export const listAccounts = defineCapability<ListAccountsInput, AccountDto[]>({
  name: "listAccounts",
  kind: "read",
  description:
    "List the cash drawer and bank accounts at one store, each with its id, name, short code, status (active or disabled), opening balance and current balance. Get storeId from listStores. Money amounts are decimal text in rupees.",
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
  }),
  requiredPermission: "accounts:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.payment_accounts.findMany({
        where: { tenant_id: actor.tenantId, store_id: input.storeId },
        orderBy: { created_at: "asc" },
        select: ACCOUNT_SELECT,
      });
      return rows.map(toAccountDto);
    });
  },
});
