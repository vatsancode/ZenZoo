"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import { initials } from "./employees";

interface EmployeeAvatarProps {
  name: string;
  photoUrl?: string;
  /** Width and height in px. */
  size: number;
}

/** A round profile picture, or the person's initials until one is chosen. */
export default function EmployeeAvatar({ name, photoUrl, size }: EmployeeAvatarProps) {
  const { colors, radius } = useTheme();
  const shape = {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: radius.full,
  } as const;

  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- a local preview, not a hosted image
    return <img src={photoUrl} alt="" style={{ ...shape, objectFit: "cover" }} />;
  }
  return (
    <span
      aria-hidden="true"
      style={{
        ...shape,
        ...textStyle(size >= 56 ? "title2" : "bodyMedium"),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.surfaceSunken,
        color: colors.inkMuted,
      }}
    >
      {initials(name) || "?"}
    </span>
  );
}
