import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertFits, cleanName } from "../../shared/names";
import {
  PAYMENT_METHOD_SELECT,
  isBuiltInPaymentMethod,
  toPaymentMethodDto,
  type PaymentMethodDto,
} from "../paymentMethods/dto";

export interface RenamePaymentMethodInput {
  id: string;
  name: string;
}

/**
 * Renames one of the shop's own methods. Only the name changes - the code stays, so the till
 * keeps treating it the same - and past sales show the new name, since they point at it by id.
 */
export const renamePaymentMethod = defineCapability<RenamePaymentMethodInput, PaymentMethodDto>({
  name: "renamePaymentMethod",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    const name = cleanName(input.name);
    if (!name) throw new Error("Enter a name for the payment method.");
    assertFits(name, 100, "The payment method name");

    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.payment_methods.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: PAYMENT_METHOD_SELECT,
      });
      if (!existing) throw new Error("That payment method doesn't exist.");
      if (isBuiltInPaymentMethod(existing)) {
        throw new Error("Built-in payment methods can't be renamed.");
      }
      if (existing.name === name) return toPaymentMethodDto(existing);

      // Leaves this method out, so "upi wallet" -> "UPI Wallet" is allowed.
      const clash = await tx.payment_methods.findFirst({
        where: {
          tenant_id: actor.tenantId,
          id: { not: input.id },
          name: { equals: name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (clash) throw new Error("There is already a payment method with that name.");

      const updated = await tx.payment_methods.update({
        where: { id: input.id },
        data: { name },
        select: PAYMENT_METHOD_SELECT,
      });
      return toPaymentMethodDto(updated);
    });
  },
});
