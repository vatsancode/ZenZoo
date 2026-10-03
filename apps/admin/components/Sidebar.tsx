"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
}

// Only sections with a real page behind them. The rest are shown below as
// coming-soon labels rather than links, so the sidebar never points at a
// page that doesn't exist yet.
const navItems: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Style guide", href: "/style-guide" },
];

const comingSoon = ["Sales", "Inventory", "Purchases", "Customers", "Settings"];

export default function Sidebar() {
  const { colors, spacing, radius } = useTheme();
  const pathname = usePathname();

  return (
    <nav
      style={{
        width: 240,
        flex: "none",
        display: "flex",
        flexDirection: "column",
        gap: spacing[1],
        padding: spacing[4],
        borderRight: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <div
        style={{
          ...textStyle("headline"),
          color: colors.ink,
          padding: `${spacing[2]}px ${spacing[3]}px`,
          marginBottom: spacing[4],
        }}
      >
        ZenZoo
      </div>

      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              ...textStyle(active ? "bodyMedium" : "body"),
              color: active ? colors.ink : colors.inkMuted,
              backgroundColor: active ? colors.surfaceSunken : "transparent",
              borderRadius: radius.md,
              padding: `${spacing[2]}px ${spacing[3]}px`,
              textDecoration: "none",
            }}
          >
            {item.label}
          </Link>
        );
      })}

      <div
        style={{
          ...textStyle("caption"),
          color: colors.inkFaint,
          padding: `${spacing[4]}px ${spacing[3]}px ${spacing[2]}px`,
        }}
      >
        COMING SOON
      </div>
      {comingSoon.map((label) => (
        <div
          key={label}
          style={{
            ...textStyle("body"),
            color: colors.inkFaint,
            padding: `${spacing[2]}px ${spacing[3]}px`,
          }}
        >
          {label}
        </div>
      ))}

      <div style={{ flex: 1 }} />

      <Link
        href="/sign-in"
        style={{
          ...textStyle("body"),
          color: colors.inkMuted,
          padding: `${spacing[3]}px ${spacing[3]}px ${spacing[2]}px`,
          borderTop: `1px solid ${colors.border}`,
          marginTop: spacing[2],
          textDecoration: "none",
        }}
      >
        Sign out
      </Link>
    </nav>
  );
}
