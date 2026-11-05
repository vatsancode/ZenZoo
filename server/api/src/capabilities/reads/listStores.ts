import { z } from "zod";
import { defineCapability } from "../capability";
import { listMyStores, type MyStoreDto } from "../../modules/self/listMyStores";

/**
 * The stores this person may work in. The same lookup the admin's store switcher uses, so an
 * agent sees exactly the stores the person does. Behind settings:view for now; a dedicated
 * permission can replace it once store access is split out of Settings.
 */
export const listStores = defineCapability<void, MyStoreDto[]>({
  name: "listStores",
  kind: "read",
  description:
    "List the stores this person can work in, by name, with each store's id and code. Other tools that take a storeId need an id from this list. Takes no input.",
  input: z.void(),
  requiredPermission: "settings:view",
  async handler(actor) {
    return listMyStores(actor);
  },
});
