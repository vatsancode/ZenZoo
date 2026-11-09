import { useCallback, useRef, useState } from "react";
import { NetworkError } from "./apiFetch";

/**
 * Lets a save run once at a time. A ref blocks a second click in the same moment
 * (state wouldn't have updated yet); `busy` drives the button's loading look.
 *
 * A task that sends the browser to another page returns "leaving" once it has done so: the
 * button then stays locked until the page actually goes, instead of flickering clickable.
 */
export function useSingleFlight() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (task: () => Promise<void | "leaving">): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let leaving = false;
    try {
      leaving = (await task()) === "leaving";
    } catch (error) {
      // Already on screen via the network banner; the form keeps what was typed.
      if (!(error instanceof NetworkError)) throw error;
    } finally {
      if (!leaving) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, []);

  return { busy, run };
}
