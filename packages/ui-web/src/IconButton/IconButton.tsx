import { useTheme } from "@zenzoo/design-tokens";
import type { MouseEvent } from "react";
import { Icon, type IconName } from "../Icon";

export interface IconButtonProps {
  icon: IconName;
  /** What the button does. Used as the tooltip and for screen readers. */
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** "success" is for a brief confirmation, such as a tick after copying. */
  tone?: "default" | "success";
  disabled?: boolean;
}

/** A round, icon-only button for actions inside rows and headers. */
export function IconButton({ icon, label, onClick, tone = "default", disabled }: IconButtonProps) {
  const { colors, radius } = useTheme();

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        flexShrink: 0,
        padding: 0,
        border: "none",
        borderRadius: radius.full,
        background: "none",
        color: tone === "success" ? colors.success : colors.inkMuted,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <Icon name={icon} />
    </button>
  );
}
