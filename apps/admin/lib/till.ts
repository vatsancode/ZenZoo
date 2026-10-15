import { redirectToSignInIfUnauthorized } from "./auth";
import { ensureStoreId } from "./storeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** One thing the till can ring up - the server's TillItemDto (server/api/src/capabilities/reads/listTillItems.ts). */
export interface TillItem {
  variantId: string;
  sellableId: string;
  name: string;
  sku: string | null;
  categoryName: string;
  kind: "product" | "made_to_order";
  price: string;
  customPrice: boolean;
  unit: string;
  /** null for made-to-order items, which aren't counted. */
  onHand: number | null;
  nextUnitCost: string | null;
}

/** The real catalogue, one row per variant, with stock on hand - requires "pos:view". */
export async function listTillItems(): Promise<TillItem[]> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/till/items?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    let message = "Couldn't load the catalogue.";
    try {
      message = ((await response.json()) as { error?: string }).error ?? message;
    } catch {
      // keep the default
    }
    throw new Error(message);
  }
  return (await response.json()) as TillItem[];
}

/** What the till offers at checkout - the server's TillPaymentOptionsDto. */
export interface TillPaymentOptions {
  /** Ways to take money now (customer credit isn't one). */
  methods: { id: string; code: string; name: string }[];
  /** This store's accounts the money can land in. */
  accounts: { id: string; code: string; name: string }[];
}

/** The active payment methods and accounts the till can use - requires "pos:view", not Settings access. */
export async function listTillPaymentOptions(): Promise<TillPaymentOptions> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/till/payment-options?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    let message = "Couldn't load the payment options.";
    try {
      message = ((await response.json()) as { error?: string }).error ?? message;
    } catch {
      // keep the default
    }
    throw new Error(message);
  }
  return (await response.json()) as TillPaymentOptions;
}
