import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { sortByPlacement } from "../../shared/placement";
import {
  PAYMENT_METHOD_SELECT,
  toPaymentMethodDto,
  type PaymentMethodDto,
} from "../paymentMethods/dto";

/** Tenant-wide, not store-scoped - payment_methods has no store_id ("how" is a tenant-level question, "where" (accounts) is per-store). */
export const listPaymentMethods = defineCapability<void, PaymentMethodDto[]>({
  name: "listPaymentMethods",
  kind: "read",
  description:
    "List the ways customers can pay, such as Cash, UPI and Card, each with its id, name, short code, status (active or disabled) and whether it is a built-in method. The same methods apply to every store. Takes no input.",
  input: z.void(),
  requiredPermission: "settings:view",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.payment_methods.findMany({
        where: { tenant_id: actor.tenantId },
        select: PAYMENT_METHOD_SELECT,
      });
      return sortByPlacement(rows).map(toPaymentMethodDto);
    });
  },
});
