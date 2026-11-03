export const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server. Check your connection and try again.";

/** Fired on window when a request can't reach the server; NetworkErrorBanner listens for it. */
export const NETWORK_ERROR_EVENT = "zenzoo:network-error";

/** A request that never got an answer - offline, server down, or blocked. Nothing was saved. */
export class NetworkError extends Error {
  constructor() {
    super(NETWORK_ERROR_MESSAGE);
    this.name = "NetworkError";
  }
}

/**
 * fetch, except a request that can't reach the server shows one readable message on screen
 * and throws a NetworkError instead of the browser's bare "Failed to fetch". Anything that
 * did get an answer (including 4xx/5xx) passes through untouched.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    // fetch rejects with a TypeError when the network fails; an AbortError is a deliberate cancel.
    if (error instanceof TypeError) {
      if (typeof window !== "undefined") window.dispatchEvent(new Event(NETWORK_ERROR_EVENT));
      throw new NetworkError();
    }
    throw error;
  }
}
