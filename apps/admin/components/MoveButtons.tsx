"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { IconButton } from "@zenzoo/ui-web";

/** Up and down arrows for a row in a reorderable list - the keyboard and touch way to do what dragging does. */
export default function MoveButtons({
  name,
  index,
  count,
  disabled,
  onMove,
}: {
  name: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (toIndex: number) => void;
}) {
  const { spacing } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: spacing[1] }}>
      <IconButton
        icon="chevronUp"
        label={`Move ${name} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(index - 1)}
      />
      <IconButton
        icon="chevronDown"
        label={`Move ${name} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index + 1)}
      />
    </div>
  );
}
