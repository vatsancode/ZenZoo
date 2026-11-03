"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCurrentUser, type CurrentUser } from "./me";
import { pageAllowed } from "./pageAccess";
import { useSingleFlight } from "./useSingleFlight";
import type { AccessLevel, PermissionArea } from "../features/settings/users";

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2, delete: 3 };

interface Access {
  /** The signed-in person, or null until /me has answered. */
  me: CurrentUser | null;
  /** True once /me has answered, so what the role may see is known. */
  isReady: boolean;
  /** True when asking /me failed; `retry` asks again. */
  loadFailed: boolean;
  /** True while a retry is running. */
  retrying: boolean;
  retry: () => void;
  /**
   * Whether the role holds at least `level` in `area` - false until /me has answered. This only
   * decides what to show; the API refuses anything the role can't do whatever the screen offers.
   */
  can: (area: PermissionArea, level: AccessLevel) => boolean;
  /** Whether the role may open a page (see lib/pageAccess) - false until /me has answered. */
  canOpen: (pathname: string) => boolean;
}

const AccessContext = createContext<Access>({
  me: null,
  isReady: false,
  loadFailed: false,
  retrying: false,
  retry: () => undefined,
  can: () => false,
  canOpen: () => false,
});

/** Loads the signed-in person once for the whole admin shell. */
export function AccessProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { busy: retrying, run } = useSingleFlight();

  const load = useCallback(
    () =>
      run(async () => {
        setLoadFailed(false);
        try {
          const user = await getCurrentUser();
          // null means the server answered with an error (a signed-out session is sent to
          // sign-in by getCurrentUser itself); either way there is nothing to show yet.
          if (user) setMe(user);
          else setLoadFailed(true);
        } catch {
          setLoadFailed(true);
        }
      }),
    [run],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<Access>(() => {
    const can: Access["can"] = (area, level) =>
      me ? RANK[me.permissions[area] ?? "none"] >= RANK[level] : false;
    return {
      me,
      isReady: me !== null,
      loadFailed,
      retrying,
      retry: () => void load(),
      can,
      canOpen: (pathname) => (me ? pageAllowed(pathname, can) : false),
    };
  }, [me, loadFailed, retrying, load]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): Access {
  return useContext(AccessContext);
}
