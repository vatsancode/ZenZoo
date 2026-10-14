import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { ACCOUNT_SELECT, toAccountDto, type AccountDto } from "../accounts/dto";

export interface SetAccountStatusInput {
  id: string;
  disabled: boolean;
}

export const setAccountStatus = defineCapability<SetAccountStatusInput, AccountDto>({
  name: "setAccountStatus",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.payment_accounts.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      if (!existing) throw new Error("That account doesn't exist.");
      await assertStoreAccess(actor, existing.store_id);

      if (input.disabled) {
        const othersActive = await tx.payment_accounts.count({
          where: {
            id: { not: input.id },
            tenant_id: actor.tenantId,
            store_id: existing.store_id,
            status: "active",
          },
        });
        if (othersActive === 0) throw new Error("At least one account has to stay on.");
      }

      const updated = await tx.payment_accounts.update({
        where: { id: input.id },
        data: { status: input.disabled ? "disabled" : "active" },
        select: ACCOUNT_SELECT,
      });
      return toAccountDto(updated);
    });
  },
});
