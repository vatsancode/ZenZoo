import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { TRANSFER_SELECT, toTransferDto, type TransferDto } from "../accounts/dto";

export interface CreateTransferInput {
  storeId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
}

/**
 * The actual balance math and the overdraft block both happen in the
 * database (trg_account_transfers_apply_balances) - this capability only
 * does the checks that are cheap to do upfront (same account twice, a
 * non-positive amount) and translates the trigger's own rejection into a
 * plain sentence. It doesn't re-check the balance itself first: that
 * would just be a second, staler copy of a check the database already
 * does correctly and safely under concurrent transfers.
 */
export const createTransfer = defineCapability<CreateTransferInput, TransferDto>({
  name: "createTransfer",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    if (input.fromAccountId === input.toAccountId) {
      throw new Error("Choose two different accounts.");
    }
    if (!(input.amount > 0)) throw new Error("Enter an amount more than zero.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const accounts = await tx.payment_accounts.findMany({
          where: {
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            id: { in: [input.fromAccountId, input.toAccountId] },
          },
          select: { id: true },
        });
        if (accounts.length !== 2) throw new Error("One of these accounts doesn't exist.");

        const created = await tx.account_transfers.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            from_account_id: input.fromAccountId,
            to_account_id: input.toAccountId,
            amount: input.amount,
            transfer_date: new Date(input.date),
            note: input.note?.trim() || null,
            created_by: actor.userId,
          },
          select: TRANSFER_SELECT,
        });
        return toTransferDto(created);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/not enough balance/i.test(message)) {
        throw new Error("That account doesn't have enough balance for this transfer.");
      }
      throw error;
    }
  },
});
