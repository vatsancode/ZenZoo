"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CURRENT_USER_ID, getRole, getUser } from "../features/settings/users";

interface NavItem {
  label: string;
  href: string;
}

// Only sections with a real page behind them. The rest are shown below as
// coming-soon labels rather than links, so the sidebar never points at a
// page that doesn't exist yet.
const navItems: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Vendors", href: "/vendors" },
  { label: "Purchases", href: "/purchases" },
  { label: "Expenses", href: "/expenses" },
  { label: "Catalogue", href: "/catalogue" },
  { label: "Point of Sale", href: "/point-of-sale" },
  { label: "Sales", href: "/sales" },
  { label: "Customers", href: "/customers" },
  { label: "Stocks", href: "/stocks" },
  { label: "Settings", href: "/settings" },
  { label: "Style guide", href: "/style-guide" },
];

const comingSoon: string[] = [];

export default function Sidebar() {
  const { colors, spacing, radius } = useTheme();
  const pathname = usePathname();
  const me = getUser(CURRENT_USER_ID);

  return (
    <nav
      style={{
        width: 240,
        flex: "none",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
        boxSizing: "border-box",
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
        // Sub-pages (e.g. /stocks/<id>/variants) keep their parent section highlighted.
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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

      {comingSoon.length > 0 ? (
        <>
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
        </>
      ) : null}

      <div style={{ flex: 1 }} />

      <div
        style={{
          borderTop: `1px solid ${colors.border}`,
          marginTop: spacing[2],
          paddingTop: spacing[2],
          display: "flex",
          flexDirection: "column",
        }}
      >
        {me ? (
          <Link
            href="/profile"
            style={{
              ...textStyle("body"),
              color: colors.ink,
              padding: `${spacing[2]}px ${spacing[3]}px`,
              textDecoration: "none",
              borderRadius: radius.md,
              backgroundColor: pathname === "/profile" ? colors.surfaceSunken : "transparent",
            }}
          >
            {me.name}
            <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
              {getRole(me.roleId)?.name ?? "My profile"}
            </span>
          </Link>
        ) : null}
        <Link
          href="/sign-in"
          style={{
            ...textStyle("body"),
            color: colors.inkMuted,
            padding: `${spacing[2]}px ${spacing[3]}px`,
            textDecoration: "none",
          }}
        >
          Sign out
        </Link>
      </div>
    </nav>
  );
}
