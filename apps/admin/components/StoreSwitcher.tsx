"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { ensureStoreId, listMyStores, setCurrentStoreId, type Store } from "../lib/storeContext";

/**
 * Hidden when there's only one store (the common Phase 1 case) - no point
 * asking someone to pick between options they don't have. Reusable by any
 * store-scoped screen, not just categories.
 */
export default function StoreSwitcher({ onChange }: { onChange?: (storeId: string) => void }) {
  const { colors, radius, spacing } = useTheme();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [list, current] = await Promise.all([listMyStores(), ensureStoreId()]);
      setStores(list);
      setStoreId(current);
    })();
  }, []);

  if (stores.length <= 1) return null;

  return (
    <select
      aria-label="Current store"
      value={storeId ?? ""}
      onChange={(event) => {
        const id = event.target.value;
        setCurrentStoreId(id);
        setStoreId(id);
        onChange?.(id);
      }}
      style={{
        ...textStyle("callout"),
        height: 40,
        paddingInline: spacing[3],
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        background: colors.surface,
        color: colors.ink,
      }}
    >
      {stores.map((store) => (
        <option key={store.id} value={store.id}>
          {store.name}
        </option>
      ))}
    </select>
  );
}
