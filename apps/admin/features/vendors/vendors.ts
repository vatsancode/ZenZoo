import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { apiFetch } from "../../lib/apiFetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

interface SupplierResponse {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  mapUrl: string | null;
  status: "active" | "archived";
}

function toVendor(response: SupplierResponse): Vendor {
  return {
    id: response.id,
    name: response.name,
    phone: response.phone ?? undefined,
    email: response.email ?? undefined,
    taxId: response.taxId ?? undefined,
    mapUrl: response.mapUrl ?? undefined,
    status: response.status,
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/** Lists this tenant's vendors (the `suppliers` table) from the real API - requires at least "vendors:view". */
export async function listVendors(): Promise<Vendor[]> {
  const response = await apiFetch(`${API_URL}/suppliers`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as SupplierResponse[];
  const vendors = data.map(toVendor);
  lastSeen = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  return vendors;
}

// The vendors from the last list this tab loaded, so a vendor opened from the list can show
// straight away while its own fresh copy loads. Only a head start - never trusted on its own.
let lastSeen = new Map<string, Vendor>();

/** The copy of this vendor from the last list loaded, if there was one. */
export function lastSeenVendor(id: string): Vendor | undefined {
  return lastSeen.get(id);
}

/**
 * One vendor - requires "vendors:view". Null when there is no such vendor (including another
 * shop's id); any other failure throws, so the page can offer Try again instead of "not found".
 */
export async function getVendor(id: string): Promise<Vendor | null> {
  const response = await apiFetch(`${API_URL}/suppliers/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  return toVendor((await response.json()) as SupplierResponse);
}

export interface VendorInput {
  name: string;
  phone: string;
  email: string;
  taxId: string;
  mapUrl: string;
}

/** Creates a vendor - requires "vendors:edit". Returns the new vendor, or an error message. */
export async function addVendor(input: VendorInput): Promise<Vendor | string> {
  const response = await apiFetch(`${API_URL}/suppliers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return toVendor((await response.json()) as SupplierResponse);
}

/** Edits an existing vendor - requires "vendors:edit". Returns the updated vendor, or an error message. */
export async function editVendor(id: string, input: VendorInput): Promise<Vendor | string> {
  const response = await apiFetch(`${API_URL}/suppliers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return toVendor((await response.json()) as SupplierResponse);
}

/** Archives or reactivates a vendor - requires "vendors:edit". Returns the updated vendor, or an error message. */
export async function setVendorStatus(id: string, archived: boolean): Promise<Vendor | string> {
  const response = await apiFetch(`${API_URL}/suppliers/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ archived }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return toVendor((await response.json()) as SupplierResponse);
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

/** Digits with spaces, + - ( ) between them, up to 20 characters (the database limit). Optional. */
export function phoneProblem(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (text.length > 20) return "Phone is too long (max 20 characters).";
  return /^[0-9+()\- ]+$/.test(text) && /\d/.test(text)
    ? null
    : "Use digits only (spaces, + - ( ) allowed).";
}

export function emailProblem(value: string): string | null {
  const text = value.trim();
  return !text || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(text)
    ? null
    : "Enter a valid email address.";
}
