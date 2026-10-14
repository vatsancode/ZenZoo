import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { PAYMENT_METHOD_SELECT, toPaymentMethodDto, type PaymentMethodDto } from "../paymentMethods/dto";

export interface CreatePaymentMethodInput {
  name: string;
}

export const createPaymentMethod = defineCapability<CreatePaymentMethodInput, PaymentMethodDto>({
  name: "createPaymentMethod",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Enter a name for the payment method.");

    // payment_methods_code_format_check: upper-case, [A-Z0-9_]+ only.
    const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!code) throw new Error("Enter a name for the payment method.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const clash = await tx.payment_methods.findFirst({
          where: { tenant_id: actor.tenantId, name: { equals: name, mode: "insensitive" } },
          select: { id: true },
        });
        if (clash) throw new Error("There is already a payment method with that name.");

        const created = await tx.payment_methods.create({
          data: { tenant_id: actor.tenantId, name, code },
          select: PAYMENT_METHOD_SELECT,
        });
        return toPaymentMethodDto(created);
      });
    } catch (error) {
      // payment_methods_tenant_code_unique
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("There is already a payment method with that name.");
      }
      throw error;
    }
  },
});
