import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import {
  PAYMENT_METHOD_SELECT,
  toPaymentMethodDto,
  type PaymentMethodDto,
} from "../paymentMethods/dto";
import { isWholeList, sortByPlacement } from "../../shared/placement";

export interface ReorderPaymentMethodsInput {
  /** Every payment method's id, in the order the shop wants them shown. */
  orderedIds: string[];
}

export const reorderPaymentMethods = defineCapability<
  ReorderPaymentMethodsInput,
  PaymentMethodDto[]
>({
  name: "reorderPaymentMethods",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.payment_methods.findMany({
        where: { tenant_id: actor.tenantId },
        select: { id: true },
      });
      const orderedIds = input.orderedIds;
      if (
        !isWholeList(
          orderedIds,
          existing.map((row) => row.id),
        )
      ) {
        throw new Error("The list has changed. Refresh the page and try again.");
      }

      for (const [index, id] of orderedIds.entries()) {
        await tx.payment_methods.update({ where: { id }, data: { sort_order: index + 1 } });
      }

      const rows = await tx.payment_methods.findMany({
        where: { tenant_id: actor.tenantId },
        select: PAYMENT_METHOD_SELECT,
      });
      return sortByPlacement(rows).map(toPaymentMethodDto);
    });
  },
});
