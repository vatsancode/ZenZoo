import type { CapabilityActor } from "@zenzoo/types";
import type { TenantTx } from "../../shared/tenantContext";

export interface MadeToOrderInput {
  storeId: string;
  name: string;
  categoryId: string;
  pricing: "fixed" | "custom";
  /** Required for fixed pricing; ignored (stored as 0) for custom. */
  price?: number;
}

/** Checks and normalises a made-to-order form - throws the message the person should see. */
export function cleanMadeToOrderInput(input: MadeToOrderInput) {
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("Enter a name.");
  if (!input.categoryId) throw new Error("Choose a category.");
  if (input.pricing !== "fixed" && input.pricing !== "custom") {
    throw new Error("Choose how it is priced.");
  }
  const price = input.pricing === "fixed" ? Number(input.price) : 0;
  if (input.pricing === "fixed" && (!Number.isFinite(price) || price <= 0)) {
    throw new Error("Enter the price.");
  }
  return { name, categoryId: input.categoryId, pricing: input.pricing, price };
}

/**
 * The checks every made-to-order write shares: the category belongs to this
 * store, and no other active catalogue item already uses the name - two
 * things the till would show identically.
 */
export async function assertMadeToOrderWritable(
  tx: TenantTx,
  actor: CapabilityActor,
  storeId: string,
  fields: { name: string; categoryId: string },
  excludeId?: string,
) {
  const category = await tx.categories.findFirst({
    where: { id: fields.categoryId, tenant_id: actor.tenantId, store_id: storeId },
    select: { id: true },
  });
  if (!category) throw new Error("That category doesn't exist.");

  const clash = await tx.sellables.findFirst({
    where: {
      tenant_id: actor.tenantId,
      store_id: storeId,
      is_sellable: true,
      status: "active",
      name: { equals: fields.name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new Error("An item with this name is already in the catalogue.");
}
