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
  requiredPermission: "settings:view",
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
