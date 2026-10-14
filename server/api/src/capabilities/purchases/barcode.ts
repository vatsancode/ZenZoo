import { randomUUID } from "crypto";

/**
 * Short, greppable, origin-tagged - "B" for a purchase-origin batch, as
 * docs/db-design.md's own B001/R001 example illustrates. No sequence table
 * backs this (there is none in the schema), so the random suffix is what
 * actually guarantees inventory_batches_tenant_barcode_unique never
 * collides, not the prefix.
 */
export function generateBarcode(): string {
  return `B${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 6).toUpperCase()}`;
}
