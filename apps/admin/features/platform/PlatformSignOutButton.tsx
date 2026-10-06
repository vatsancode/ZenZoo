"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { signOut } from "../../lib/auth";

export default function PlatformSignOutButton() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        signOut().then(() => router.push("/sign-in"));
      }}
      style={{
        ...textStyle("callout"),
        color: colors.inkMuted,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
    >
      Sign out
    </button>
  );
}
