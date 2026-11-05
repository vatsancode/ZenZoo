import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { TRANSFER_SELECT, toTransferDto, type TransferDto } from "../accounts/dto";

export interface ListTransfersInput {
  storeId: string;
}

export const listTransfers = defineCapability<ListTransfersInput, TransferDto[]>({
  name: "listTransfers",
  kind: "read",
  description:
    "List the money transfers between accounts at one store, newest first. Each has the account it came from, the account it went to, the amount (decimal text in rupees), the date and a note. The account ids match listAccounts. Get storeId from listStores.",
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
  }),
  requiredPermission: "accounts:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.account_transfers.findMany({
        where: { tenant_id: actor.tenantId, store_id: input.storeId },
        orderBy: { created_at: "desc" },
        select: TRANSFER_SELECT,
      });
      return rows.map(toTransferDto);
    });
  },
});
