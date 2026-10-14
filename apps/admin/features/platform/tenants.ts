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

/** Resets a tenant's owner's password via the platform admin API. */
export async function resetTenantOwnerPassword(tenantId: string, newPassword: string): Promise<void> {
  const response = await fetch(`${API_URL}/platform-admin/tenants/${tenantId}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ newPassword }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Couldn't reset the password.");
  }
}

/** Corrects a tenant's owner's email via the platform admin API. Returns the saved (lowercased) email. */
export async function updateTenantOwnerEmail(tenantId: string, newEmail: string): Promise<string> {
  const response = await fetch(`${API_URL}/platform-admin/tenants/${tenantId}/owner-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ newEmail }),
  });
  const data = (await response.json().catch(() => ({}))) as { email?: string; error?: string };
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(data.error ?? "Couldn't update the email.");
  }
  return data.email ?? newEmail.toLowerCase();
}
