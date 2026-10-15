import {
  priceCart,
  PricingError,
  toPaise,
  toRupees,
  type Discount,
  type Paise,
  type PricedCart,
} from "@zenzoo/pricing";
import type { CapabilityActor } from "@zenzoo/types";
import type { TenantTx } from "../../shared/tenantContext";

/**
 * A discount as the till sends it: `value` is rupees for "amount", a percentage for "percent" -
 * exactly what the cashier typed, so the sale can remember how it was given.
 */
export interface DiscountInput {
  type: "amount" | "percent";
  value: number | string;
}

export interface SaleLineInput {
  variantId: string;
  quantity: number;
  discount?: DiscountInput;
  /** Rupees - only used for a custom-priced item; ignored for everything else, whose price is the server's. */
  customPrice?: number | string;
}

export interface SalePricingInput {
  storeId: string;
  lines: SaleLineInput[];
  billDiscount?: DiscountInput;
}

export interface ResolvedLine {
  variantId: string;
  sellableId: string;
  kind: "product" | "made_to_order";
  productName: string;
  variantName: string;
  sku: string | null;
  quantity: number;
  unitPrice: Paise;
  discount: Discount | undefined;
  /** The discount exactly as typed, kept on the sale. */
  typedDiscount: { type: "amount" | "percent"; value: number } | undefined;
}

export interface PricedSale {
  lines: ResolvedLine[];
  cart: PricedCart;
  billDiscount: Discount | undefined;
  typedBillDiscount: { type: "amount" | "percent"; value: number } | undefined;
}

/** Paise as the "171.00" string the rest of the API uses for money. */
export const money = (paise: Paise): string => toRupees(paise).toFixed(2);

const MAX_LINES = 200;
const MAX_QUANTITY = 1_000_000;

/** What was typed into a discount box, as a number. Blank or zero means no discount. */
function readDiscount(
  input: DiscountInput | undefined,
  what: string,
): { discount: Discount; typed: { type: "amount" | "percent"; value: number } } | undefined {
  if (!input) return undefined;
  if (input.type !== "amount" && input.type !== "percent") {
    throw new Error(`The ${what} discount must be an amount or a percentage.`);
  }
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`The ${what} discount isn't a valid number.`);
  if (value === 0) return undefined;
  if (input.type === "percent") {
    if (value > 100) throw new Error(`The ${what} discount can't be more than 100%.`);
    return { discount: { type: "percent", percent: value }, typed: { type: "percent", value } };
  }
  return {
    discount: { type: "amount", paise: toPaise(value) },
    typed: { type: "amount", value: Number(value.toFixed(2)) },
  };
}

/**
 * Works out a sale's real figures: every price comes from the database, never from the caller
 * (a custom-priced item is the one exception - its price is typed at the till by design). Shared
 * by previewSale and createSale so "what the till is shown" and "what gets saved" are the same
 * calculation, line for line.
 */
export async function priceSale(
  tx: TenantTx,
  actor: CapabilityActor,
  input: SalePricingInput,
): Promise<PricedSale> {
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error("Add an item to the sale first.");
  }
  if (input.lines.length > MAX_LINES)
    throw new Error(`A sale can have at most ${MAX_LINES} lines.`);

  const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
  const variants = await tx.variants.findMany({
    where: { id: { in: variantIds }, tenant_id: actor.tenantId, store_id: input.storeId },
    select: {
      id: true,
      name: true,
      sku: true,
      base_price: true,
      status: true,
      sellables: {
        select: {
          id: true,
          name: true,
          kind: true,
          status: true,
          is_sellable: true,
          pricing_mode: true,
          variants: { where: { status: "active" }, select: { id: true } },
        },
      },
    },
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  const lines = input.lines.map((line): ResolvedLine => {
    const variant = byId.get(line.variantId);
    if (!variant) throw new Error("One of the items doesn't exist in this store.");
    const sellable = variant.sellables;
    const label =
      sellable.variants.length > 1 ? `${sellable.name} - ${variant.name}` : sellable.name;

    // The catalogue is what the till may sell: sellable, and neither the item nor the variant switched off.
    if (!sellable.is_sellable || sellable.status !== "active" || variant.status !== "active") {
      throw new Error(`${label} isn't available to sell.`);
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      throw new Error(`Enter a whole quantity of 1 or more for ${label}.`);
    }

    let unitPrice: Paise;
    if (sellable.pricing_mode === "custom") {
      const typed = Number(line.customPrice);
      if (line.customPrice === undefined || !Number.isFinite(typed) || typed <= 0) {
        throw new Error(`Enter the price for ${label}.`);
      }
      unitPrice = toPaise(typed);
    } else {
      unitPrice = toPaise(variant.base_price.toString());
    }

    const read = readDiscount(line.discount, label);
    return {
      variantId: variant.id,
      sellableId: sellable.id,
      kind: sellable.kind === "made_to_order" ? "made_to_order" : "product",
      productName: sellable.name,
      variantName: variant.name,
      sku: variant.sku,
      quantity: line.quantity,
      unitPrice,
      discount: read?.discount,
      typedDiscount: read?.typed,
    };
  });

  const bill = readDiscount(input.billDiscount, "bill");
  let cart: PricedCart;
  try {
    cart = priceCart({
      lines: lines.map((line) => ({
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        discount: line.discount,
      })),
      billDiscount: bill?.discount,
    });
  } catch (error) {
    if (error instanceof PricingError) throw new Error(error.message);
    throw error;
  }

  return { lines, cart, billDiscount: bill?.discount, typedBillDiscount: bill?.typed };
}
