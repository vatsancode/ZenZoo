import { useCallback, useRef, useState } from "react";
import { NetworkError } from "./apiFetch";

/**
 * Lets a save run once at a time. A ref blocks a second click in the same moment
 * (state wouldn't have updated yet); `busy` drives the button's loading look.
 */
export function useSingleFlight() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (task: () => Promise<void>): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      // Already on screen via the network banner; the form keeps what was typed.
      if (!(error instanceof NetworkError)) throw error;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
