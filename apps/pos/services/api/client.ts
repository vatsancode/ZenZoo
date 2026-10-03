/**
 * The one place POS screens/features reach the backend from. Nothing else
 * in this app should call `fetch` directly - that's what keeps this app
 * able to become offline-first later without a UI rewrite (see README).
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) {
    throw new ApiError(`GET ${path} failed`, response.status);
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(`POST ${path} failed`, response.status);
  }
  return (await response.json()) as T;
}
