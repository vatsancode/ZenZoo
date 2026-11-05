import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { type UnitDto } from "../units/dto";
import { unitsInTx } from "../lookups/queries";

/** Tenant-wide, not store-scoped - a business's units don't vary by store. */
export const listUnits = defineCapability<void, UnitDto[]>({
  name: "listUnits",
  kind: "read",
  description:
    "List the units the shop counts and sells in, such as pieces, kilograms and litres, each with its id, short code, name, whether it allows decimal quantities, and whether it is active or disabled. The unitId on a product variant matches an id here. The same units apply to every store. Takes no input.",
  input: z.void(),
  requiredPermission: "stocks:view",
  async handler(actor) {
    return runInTenantContext(actor, (tx) => unitsInTx(tx, actor));
  },
});
