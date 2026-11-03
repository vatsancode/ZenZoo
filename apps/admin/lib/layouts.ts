"use client";

import { useEffect, useState } from "react";

export interface LayoutOption {
  id: string;
  name: string;
}

export interface LayoutArea {
  /** Stable key the choice is saved under. */
  key: string;
  name: string;
  description: string;
  options: LayoutOption[];
}

/**
 * Every screen that comes in more than one layout. Adding a layout to a screen is one line in its
 * `options`; adding a screen is one more entry here, and the Layout settings page lists it.
 * The first option is the default.
 */
export const LAYOUT_AREAS: LayoutArea[] = [
  {
    key: "pos",
    name: "POS layout",
    description: "How the Point of Sale screen is arranged.",
    options: [
      { id: "layout-1", name: "Layout 1" },
      { id: "layout-2", name: "Layout 2" },
    ],
  },
];

const STORAGE_PREFIX = "zenzoo-layout-";
const CHANGE_EVENT = "zenzoo-layout-change";

function areaFor(key: string): LayoutArea | undefined {
  return LAYOUT_AREAS.find((area) => area.key === key);
}

function read(key: string): string {
  const area = areaFor(key);
  const fallback = area?.options[0]?.id ?? "";
  try {
    const saved = window.localStorage.getItem(STORAGE_PREFIX + key);
    return area?.options.some((option) => option.id === saved) ? (saved as string) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The layout chosen for a screen, and a way to change it. The choice is remembered on this
 * browser, like the theme, and every open screen using it updates at once. Starts on the default
 * on the server and corrects itself on mount.
 */
export function useLayout(key: string): [string, (id: string) => void] {
  const [layout, setLayoutState] = useState(() => areaFor(key)?.options[0]?.id ?? "");

  useEffect(() => {
    setLayoutState(read(key));
    const sync = () => setLayoutState(read(key));
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key]);

  function setLayout(id: string) {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, id);
    } catch {
      // the choice still applies for this visit
    }
    setLayoutState(id);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return [layout, setLayout];
}
