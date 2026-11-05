import { UserFacingError } from "../../shared/errors";
import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertFits, cleanName, firstFreeCode } from "../../shared/names";
import {
  PAYMENT_METHOD_SELECT,
  toPaymentMethodDto,
  type PaymentMethodDto,
} from "../paymentMethods/dto";

export interface CreatePaymentMethodInput {
  name: string;
}

export const createPaymentMethod = defineCapability<CreatePaymentMethodInput, PaymentMethodDto>({
  name: "createPaymentMethod",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    const name = cleanName(input.name);
    if (!name) throw new UserFacingError("Enter a name for the payment method.");
    assertFits(name, 100, "The payment method name");

    // payment_methods_code_format_check: upper-case, [A-Z0-9_]+ only. A name with no English
    // letters (Tamil, an emoji) leaves nothing, so it starts from METHOD instead.
    const baseCode =
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "METHOD";

    try {
      return await runInTenantContext(actor, async (tx) => {
        const clash = await tx.payment_methods.findFirst({
          where: { tenant_id: actor.tenantId, name: { equals: name, mode: "insensitive" } },
          select: { id: true },
        });
        if (clash) throw new UserFacingError("There is already a payment method with that name.");

        // Two different names can boil down to one code ("Gift voucher" / "Gift-voucher").
        const code = await firstFreeCode(baseCode, "_", 30, async (candidate) => {
          const taken = await tx.payment_methods.findFirst({
            where: { tenant_id: actor.tenantId, code: candidate },
            select: { id: true },
          });
          return taken !== null;
        });

        const created = await tx.payment_methods.create({
          data: { tenant_id: actor.tenantId, name, code },
          select: PAYMENT_METHOD_SELECT,
        });
        return toPaymentMethodDto(created);
      });
    } catch (error) {
      // payment_methods_tenant_code_unique
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new UserFacingError("There is already a payment method with that name.");
      }
      throw error;
    }
  },
});
