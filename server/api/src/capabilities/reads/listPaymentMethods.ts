import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { PAYMENT_METHOD_SELECT, toPaymentMethodDto, type PaymentMethodDto } from "../paymentMethods/dto";

/** Tenant-wide, not store-scoped - payment_methods has no store_id ("how" is a tenant-level question, "where" (accounts) is per-store). */
export const listPaymentMethods = defineCapability<void, PaymentMethodDto[]>({
  name: "listPaymentMethods",
  kind: "read",
  requiredPermission: "settings:view",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.payment_methods.findMany({
        where: { tenant_id: actor.tenantId },
        orderBy: { created_at: "asc" },
        select: PAYMENT_METHOD_SELECT,
      });
      return rows.map(toPaymentMethodDto);
    });
  },
});
