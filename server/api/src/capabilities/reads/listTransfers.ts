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
  requiredPermission: "settings:view",
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
