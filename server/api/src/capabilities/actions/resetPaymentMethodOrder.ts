import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import {
  PAYMENT_METHOD_SELECT,
  toPaymentMethodDto,
  type PaymentMethodDto,
} from "../paymentMethods/dto";
import { sortByPlacement } from "../../shared/placement";

/** Forgets the shop's hand-made order, so payment methods go back to A-Z. */
export const resetPaymentMethodOrder = defineCapability<void, PaymentMethodDto[]>({
  name: "resetPaymentMethodOrder",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      await tx.payment_methods.updateMany({
        where: { tenant_id: actor.tenantId },
        data: { sort_order: null },
      });
      const rows = await tx.payment_methods.findMany({
        where: { tenant_id: actor.tenantId },
        select: PAYMENT_METHOD_SELECT,
      });
      return sortByPlacement(rows).map(toPaymentMethodDto);
    });
  },
});
