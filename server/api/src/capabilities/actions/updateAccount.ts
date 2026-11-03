import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { assertFits, cleanName } from "../../shared/names";
import { ACCOUNT_SELECT, toAccountDto, type AccountDto } from "../accounts/dto";

export interface UpdateAccountInput {
  id: string;
  name: string;
  openingBalance: number;
}

const OPENING_LOCKED =
  "Money has already moved in or out of this account, so its opening balance can't change. Its name still can.";

/**
 * Renames an account and/or corrects its opening balance. A correction is only allowed before
 * any money has moved (the account's opening_locked flag): it goes through
 * adjust_account_balance() as an "opening_correction" ledger row, so the balance and the ledger
 * move together. Once the account is locked, only the name can change.
 */
export const updateAccount = defineCapability<UpdateAccountInput, AccountDto>({
  name: "updateAccount",
  kind: "action",
  requiredPermission: "accounts:edit",
  async handler(actor, input) {
    const name = cleanName(input.name);
    if (!name) throw new Error("Give the account a name.");
    assertFits(name, 200, "The account name");
    if (input.openingBalance < 0) throw new Error("Opening balance can't be negative.");

    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.payment_accounts.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true, opening_balance: true, opening_locked: true },
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

      const delta =
        Math.round((input.openingBalance - Number(existing.opening_balance)) * 100) / 100;

      if (delta !== 0) {
        if (existing.opening_locked) throw new Error(OPENING_LOCKED);
        try {
          // Moves the balance, writes the ledger row, and refuses again if a sale or transfer
          // locked the account a moment ago (it holds the account row while it checks).
          await tx.$executeRaw`SELECT public.adjust_account_balance(${input.id}::uuid, ${delta}::numeric, 'opening_correction', NULL)`;
        } catch (error) {
          if (error instanceof Error && /opening balance is locked/i.test(error.message)) {
            throw new Error(OPENING_LOCKED);
          }
          throw error;
        }
      }

      const updated = await tx.payment_accounts.update({
        where: { id: input.id },
        data: { name, opening_balance: input.openingBalance },
        select: ACCOUNT_SELECT,
      });
      return toAccountDto(updated);
    });
  },
});
