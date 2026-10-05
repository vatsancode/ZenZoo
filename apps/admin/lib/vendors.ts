export interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  /** GSTIN (or local equivalent). */
  taxId?: string;
  /** Google Maps link to the vendor's location. */
  mapUrl?: string;
  status: "active" | "archived";
}

// Sample data standing in for a real capability, same as lib/stocks.ts: there
// is no vendors read capability on the backend yet. Fields mirror the
// `suppliers` table in docs/db-design.md (called vendors in the app), plus `mapUrl`. Swap the bodies of
// listVendors/saveVendors for real API calls once the capability exists.
let store: Vendor[] = [
  {
    id: "sup-1",
    name: "Kumaran Silks",
    phone: "+91 98765 43210",
    email: "orders@kumaransilks.in",
    taxId: "33AABCK1234F1Z5",
    mapUrl: "https://maps.app.goo.gl/kumaransilks",
    status: "active",
  },
  {
    id: "sup-2",
    name: "Varanasi Weavers Co-op",
    phone: "+91 98450 11223",
    email: "sales@vwcoop.in",
    taxId: "09AAAAV5678K1Z2",
    status: "active",
  },
  {
    id: "sup-3",
    name: "Jaipur Block Prints",
    phone: "+91 99280 55671",
    email: "hello@jaipurblock.in",
    taxId: "08AACCJ4321P1Z9",
    status: "active",
  },
  {
    id: "sup-4",
    name: "Surat Textile Hub",
    phone: "+91 98240 77889",
    taxId: "24AAEFS9087L1Z4",
    status: "active",
  },
  {
    id: "sup-5",
    name: "Lucknow Chikan House",
    phone: "+91 94150 33445",
    email: "info@lucknowchikan.in",
    status: "archived",
  },
];

export async function listVendors(): Promise<Vendor[]> {
  return store;
}

export function saveVendors(next: Vendor[]): void {
  store = next;
}

export interface VendorInput {
  name: string;
  phone: string;
  email: string;
  taxId: string;
  mapUrl: string;
}

const blankToUndefined = (value: string) => value.trim() || undefined;

function fromInput(input: VendorInput) {
  return {
    name: input.name.trim(),
    phone: blankToUndefined(input.phone),
    email: blankToUndefined(input.email)?.toLowerCase(),
    taxId: blankToUndefined(input.taxId)?.toUpperCase(),
    mapUrl: blankToUndefined(input.mapUrl),
  };
}

export function addVendor(vendors: Vendor[], input: VendorInput): Vendor[] {
  const vendor: Vendor = { id: `sup-${Date.now()}`, ...fromInput(input), status: "active" };
  return [vendor, ...vendors];
}

export function editVendor(vendors: Vendor[], id: string, input: VendorInput): Vendor[] {
  return vendors.map((vendor) => (vendor.id === id ? { ...vendor, ...fromInput(input) } : vendor));
}

/** Accepts full Google Maps links and the short maps.app.goo.gl / goo.gl/maps forms. */
export function mapUrlProblem(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "Paste the full link, starting with https://.";
  }
  const host = url.hostname.replace(/^www\./, "");
  const isGoogleMaps =
    host === "maps.app.goo.gl" ||
    (host === "goo.gl" && url.pathname.startsWith("/maps")) ||
    (/^(maps\.)?google\.[a-z.]+$/.test(host) &&
      (host.startsWith("maps.") || url.pathname.startsWith("/maps")));
  return url.protocol === "https:" && isGoogleMaps ? null : "Enter a Google Maps link.";
}

export function emailProblem(value: string): string | null {
  const text = value.trim();
  return !text || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? null : "Enter a valid email address.";
}

export async function getVendor(id: string): Promise<Vendor | null> {
  return store.find((vendor) => vendor.id === id) ?? null;
}
