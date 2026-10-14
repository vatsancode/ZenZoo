import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { PAYMENT_METHOD_SELECT, toPaymentMethodDto, type PaymentMethodDto } from "../paymentMethods/dto";

export interface SetPaymentMethodStatusInput {
  id: string;
  disabled: boolean;
}

export const setPaymentMethodStatus = defineCapability<SetPaymentMethodStatusInput, PaymentMethodDto>({
  name: "setPaymentMethodStatus",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.payment_methods.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { id: true },
      });
      if (!existing) throw new Error("That payment method doesn't exist.");

      if (input.disabled) {
        const othersActive = await tx.payment_methods.count({
          where: { id: { not: input.id }, tenant_id: actor.tenantId, status: "active" },
        });
        if (othersActive === 0) throw new Error("At least one payment method has to stay on.");
      }

      const updated = await tx.payment_methods.update({
        where: { id: input.id },
        data: { status: input.disabled ? "disabled" : "active" },
        select: PAYMENT_METHOD_SELECT,
      });
      return toPaymentMethodDto(updated);
    });
  },
});
