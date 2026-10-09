import { redirectToSignInIfUnauthorized } from "../../lib/auth";

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
  const response = await fetch(`${API_URL}/suppliers`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as SupplierResponse[];
  return data.map(toVendor);
}

/** No GET /suppliers/:id route - the list is small, so this just fetches it and finds the one row. */
export async function getVendor(id: string): Promise<Vendor | null> {
  const vendors = await listVendors();
  return vendors.find((vendor) => vendor.id === id) ?? null;
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
  const response = await fetch(`${API_URL}/suppliers`, {
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
  const response = await fetch(`${API_URL}/suppliers/${id}`, {
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
  const response = await fetch(`${API_URL}/suppliers/${id}/status`, {
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

export function emailProblem(value: string): string | null {
  const text = value.trim();
  return !text || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? null : "Enter a valid email address.";
}
