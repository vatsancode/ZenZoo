import { z } from "zod";
import { defineCapability } from "../capability";
import type { CapabilityActor } from "@zenzoo/types";
import { runInTenantContext, type TenantTx } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { money, priceSale, type SalePricingInput } from "../sales/pricing";
import { toQuantity } from "../../shared/quantity";

export type PreviewSaleInput = SalePricingInput;

export interface PreviewSaleLineDto {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  quantity: number;
  unitPrice: string;
  gross: string;
  lineDiscount: string;
  billShare: string;
  net: string;
  /** Units on hand, so the till can warn before checkout; null for made-to-order items, which aren't counted. */
  onHand: number | null;
}

export interface PreviewSaleDto {
  lines: PreviewSaleLineDto[];
  subtotal: string;
  lineDiscounts: string;
  billDiscount: string;
  total: string;
}

/** The preview's work, against an open transaction (so it can be tested without committing). */
export async function previewSaleInTx(
  tx: TenantTx,
  actor: CapabilityActor,
  input: PreviewSaleInput,
): Promise<PreviewSaleDto> {
  const { lines, cart } = await priceSale(tx, actor, input);

  const stockedIds = [
    ...new Set(lines.filter((l) => l.kind === "product").map((l) => l.variantId)),
  ];
  const stock = await tx.inventory_batches.groupBy({
    by: ["variant_id"],
    where: { tenant_id: actor.tenantId, store_id: input.storeId, variant_id: { in: stockedIds } },
    _sum: { available_quantity: true },
  });
  const onHand = new Map(
    stock.map((row) => [row.variant_id, toQuantity(row._sum.available_quantity)]),
  );

  return {
    lines: lines.map((line, index) => {
      const priced = cart.lines[index]!;
      return {
        variantId: line.variantId,
        productName: line.productName,
        variantName: line.variantName,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: money(line.unitPrice),
        gross: money(priced.gross),
        lineDiscount: money(priced.lineDiscount),
        billShare: money(priced.billShare),
        net: money(priced.net),
        onHand: line.kind === "product" ? (onHand.get(line.variantId) ?? 0) : null,
      };
    }),
    subtotal: money(cart.subtotal),
    lineDiscounts: money(cart.lineDiscounts),
    billDiscount: money(cart.billDiscount),
    total: money(cart.total),
  };
}

/**
 * "What would this cart come to?" - the server's real prices and the shared calculator, with
 * nothing saved. The till can check its own total against this before taking payment, and an
 * AI can try "15% off the bill?" and read the answer before committing to anything.
 */
const discountInput = z.object({
  type: z
    .enum(["amount", "percent"])
    .describe('"amount" is rupees off; "percent" is a percentage.'),
  value: z.union([z.number(), z.string()]).describe("The rupees or percentage, as typed."),
});

export const previewSale = defineCapability<PreviewSaleInput, PreviewSaleDto>({
  name: "previewSale",
  kind: "read",
  description:
    'Works out what a cart would come to, using the shop\'s real prices, without saving anything - safe for "what if I give 15% off the bill?". Get storeId from listStores and variantId from listTillItems. Returns each line (price, discounts, net, units on hand) plus subtotal, discounts and total. Money amounts are decimal text in rupees. It does not record a sale.',
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
    lines: z
      .array(
        z.object({
          variantId: z.string().describe("The item's variant id, from listTillItems."),
          quantity: z
            .number()
            .describe("How many units; decimals only for weighed or measured items."),
          discount: discountInput.optional().describe("A discount on this line only."),
          customPrice: z
            .union([z.number(), z.string()])
            .optional()
            .describe("Rupees. Only for items marked customPrice; ignored for all others."),
        }),
      )
      .max(200)
      .describe("The items in the cart."),
    billDiscount: discountInput.optional().describe("A discount on the whole bill."),
  }),
  requiredPermission: "pos:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => previewSaleInTx(tx, actor, input));
  },
});
