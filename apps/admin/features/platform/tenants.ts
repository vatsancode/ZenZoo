import { redirectToSignInIfUnauthorized } from "../../lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  ownerEmail: string | null;
}

/** Fetches tenants from the platform admin API, optionally filtered by `search`. */
export async function listTenants(search?: string): Promise<Tenant[]> {
  const url = new URL(`${API_URL}/platform-admin/tenants`);
  if (search?.trim()) url.searchParams.set("search", search.trim());

  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error("Couldn't load tenants.");
  }
  const data = (await response.json()) as { tenants: Tenant[] };
  return data.tenants;
}
