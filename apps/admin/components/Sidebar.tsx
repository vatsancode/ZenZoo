"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAccess } from "../lib/access";
import { signOut } from "../lib/auth";
import { NAV_ITEMS } from "../lib/pageAccess";

// Links come from lib/pageAccess, filtered to what the signed-in role may open. Pages without a
// real page yet are listed below as coming-soon labels rather than links, so the sidebar never
// points at one that does not exist.
const comingSoon: string[] = [];

export default function Sidebar() {
  const { colors, spacing, radius } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { me, canOpen } = useAccess();

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

      {NAV_ITEMS.filter((item) => canOpen(item.href)).map((item) => {
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
              {me.roleName ?? "My profile"}
            </span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => {
            signOut().then(() => router.push("/sign-in"));
          }}
          style={{
            ...textStyle("body"),
            color: colors.inkMuted,
            padding: `${spacing[2]}px ${spacing[3]}px`,
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
