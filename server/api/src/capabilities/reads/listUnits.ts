import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { type UnitDto } from "../units/dto";
import { unitsInTx } from "../lookups/queries";

/** Tenant-wide, not store-scoped - a business's units don't vary by store. */
export const listUnits = defineCapability<void, UnitDto[]>({
  name: "listUnits",
  kind: "read",
  requiredPermission: "stocks:view",
  async handler(actor) {
    return runInTenantContext(actor, (tx) => unitsInTx(tx, actor));
  },
});
