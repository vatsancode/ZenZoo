import { apiFetch } from "./apiFetch";
import { redirectToSignInIfUnauthorized } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Who is asking to connect, for which shop, as which person. */
export interface ConsentDetails {
  clientName: string;
  shopName: string | null;
  userName: string;
  roleName: string | null;
}

export type ConsentLoad =
  | { status: "ok"; details: ConsentDetails }
  | { status: "signed-out" }
  | { status: "invalid" }
  | { status: "error" };

/**
 * The sign-in request Claude sent, as it arrived in this page's address (?client_id=...&...).
 * The server checks every part again; this only passes it along.
 */
export async function loadConsent(search: string): Promise<ConsentLoad> {
  try {
    const response = await apiFetch(`${API_URL}/oauth/consent${search}`, {
      credentials: "include",
    });
    if (response.status === 401) return { status: "signed-out" };
    if (response.status === 400) return { status: "invalid" };
    if (!response.ok) return { status: "error" };
    return { status: "ok", details: (await response.json()) as ConsentDetails };
  } catch {
    return { status: "error" };
  }
}

/** Allow or Cancel. Returns the address to send the browser to (back to Claude), or null on failure. */
export async function decideConsent(
  search: string,
  decision: "allow" | "deny",
): Promise<string | null> {
  try {
    const response = await apiFetch(`${API_URL}/oauth/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...Object.fromEntries(new URLSearchParams(search)), decision }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { redirectUrl: string };
    return data.redirectUrl;
  } catch {
    return null;
  }
}

export interface AgentConnection {
  id: string;
  name: string;
  connectedAt: string;
  lastUsedAt: string | null;
}

/** The AI assistants the signed-in person has connected; null when the list could not be loaded. */
export async function listAgentConnections(): Promise<AgentConnection[] | null> {
  try {
    const response = await apiFetch(`${API_URL}/agent-connections`, { credentials: "include" });
    if (!response.ok) {
      redirectToSignInIfUnauthorized(response);
      return null;
    }
    const data = (await response.json()) as { connections: AgentConnection[] };
    return data.connections;
  } catch {
    return null;
  }
}

/** Disconnect: the assistant can no longer read anything. True when it worked. */
export async function disconnectAgent(id: string): Promise<boolean> {
  try {
    const response = await apiFetch(`${API_URL}/agent-connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}
