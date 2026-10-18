"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCurrentUser, type CurrentUser } from "./me";
import type { AccessLevel, PermissionArea } from "../features/settings/users";

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2, delete: 3 };

interface Access {
  /** The signed-in person, or null until /me has answered. */
  me: CurrentUser | null;
  /**
   * Whether the role holds at least `level` in `area` - false until /me has answered. This only
   * decides what to show; the API refuses anything the role can't do whatever the screen offers.
   */
  can: (area: PermissionArea, level: AccessLevel) => boolean;
}

const AccessContext = createContext<Access>({ me: null, can: () => false });

/** Loads the signed-in person once for the whole admin shell. */
export function AccessProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<CurrentUser | null>(null);

  useEffect(() => {
    getCurrentUser().then(setMe);
  }, []);

  const value = useMemo<Access>(
    () => ({
      me,
      can: (area, level) => (me ? RANK[me.permissions[area] ?? "none"] >= RANK[level] : false),
    }),
    [me],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): Access {
  return useContext(AccessContext);
}
