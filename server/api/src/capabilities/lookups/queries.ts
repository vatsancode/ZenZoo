import type { CapabilityActor } from "@zenzoo/types";
import type { TenantTx } from "../../shared/tenantContext";
import { CATEGORY_SELECT, toCategoryDto, type CategoryDto } from "../categories/dto";
import { sortByPlacement } from "../../shared/placement";
import { UNIT_SELECT, toUnitDto, type UnitDto } from "../units/dto";

/**
 * Queries more than one capability runs. The full list reads (listUnits, listCategories) and the
 * lookups that share their data call the same function, so what a unit or category row looks like
 * is decided in one place - only the permission in front of it differs.
 */

/** Tenant-wide, not store-scoped - a business's units don't vary by store. */
export async function unitsInTx(tx: TenantTx, actor: CapabilityActor): Promise<UnitDto[]> {
  const rows = await tx.units.findMany({
    where: { tenant_id: actor.tenantId },
    select: UNIT_SELECT,
  });
  return sortByPlacement(rows).map(toUnitDto);
}

/** Flat, parents before children by name - the screens build the tree themselves. */
export async function categoriesInTx(
  tx: TenantTx,
  actor: CapabilityActor,
  storeId: string,
): Promise<CategoryDto[]> {
  const rows = await tx.categories.findMany({
    where: { tenant_id: actor.tenantId, store_id: storeId },
    orderBy: [{ parent_id: "asc" }, { name: "asc" }],
    select: CATEGORY_SELECT,
  });
  return rows.map(toCategoryDto);
}
