import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { ACCOUNT_SELECT, toAccountDto, type AccountDto } from "../accounts/dto";

export interface UpdateAccountInput {
  id: string;
  name: string;
  openingBalance: number;
}

/**
 * Renames an account and/or corrects its opening balance. A correction
 * shifts the running balance by the same amount, via Prisma's atomic
 * `increment` rather than reading-then-writing balance by hand - so this
 * is safe even if a transfer touches the same account in between.
 */
export const updateAccount = defineCapability<UpdateAccountInput, AccountDto>({
  name: "updateAccount",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Give the account a name.");
    if (input.openingBalance < 0) throw new Error("Opening balance can't be negative.");

    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.payment_accounts.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true, opening_balance: true },
      });
      if (!existing) throw new Error("That account doesn't exist.");
      await assertStoreAccess(actor, existing.store_id);

      const clash = await tx.payment_accounts.findFirst({
        where: {
          id: { not: input.id },
          tenant_id: actor.tenantId,
          store_id: existing.store_id,
          name: { equals: name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (clash) throw new Error("An account with this name already exists.");

      const delta = input.openingBalance - Number(existing.opening_balance);

      const updated = await tx.payment_accounts.update({
        where: { id: input.id },
        data: {
          name,
          opening_balance: input.openingBalance,
          balance: { increment: delta },
        },
        select: ACCOUNT_SELECT,
      });
      return toAccountDto(updated);
    });
  },
});
