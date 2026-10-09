import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { generatePassword, passwordStrengthProblem, MIN_PASSWORD_LENGTH } from "./users";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export { generatePassword, passwordStrengthProblem, MIN_PASSWORD_LENGTH };

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  roleId: string;
  status: "active" | "disabled";
  /** This is the signed-in person themself - from the server, not a local guess. */
  isSelf: boolean;
}

export interface UserInput {
  name: string;
  email: string;
  phone?: string;
  roleId: string;
  /** Only read when creating a user - see addUser. There is no invite link: whoever adds a person types their password here and shares it with them directly. */
  password?: string;
}

interface UserResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roleId: string;
  status: "active" | "disabled";
  isSelf: boolean;
}

function toUser(response: UserResponse): User {
  return {
    id: response.id,
    name: response.name,
    email: response.email,
    phone: response.phone ?? undefined,
    roleId: response.roleId,
    status: response.status,
    isSelf: response.isSelf,
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

/** Lists this tenant's people from the real API - requires at least "users:view". */
export async function listUsers(): Promise<User[]> {
  const response = await fetch(`${API_URL}/users`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as UserResponse[];
  return data.map(toUser);
}

/** Creates a person with a password - requires "users:edit". Returns an error message, or null on success. */
export async function addUser(input: UserInput): Promise<string | null> {
  const response = await fetch(`${API_URL}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}

/** Edits an existing person's name/email/phone/role - requires "users:edit". Returns an error message, or null on success. */
export async function editUser(id: string, input: UserInput): Promise<string | null> {
  const response = await fetch(`${API_URL}/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}

/** Turns a person off or back on at this tenant - requires "users:edit". Returns an error message, or null on success. */
export async function setUserDisabled(id: string, disabled: boolean): Promise<string | null> {
  const response = await fetch(`${API_URL}/users/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ disabled }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}

/** Resets someone else's password - requires "users:edit". Returns an error message, or null on success. */
export async function resetUserPassword(id: string, password: string): Promise<string | null> {
  const response = await fetch(`${API_URL}/users/${id}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}
