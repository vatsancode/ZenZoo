"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Icon, Skeleton, textStyle, type IconName } from "@zenzoo/ui-web";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccess } from "../lib/access";
import { signOut } from "../lib/auth";
import { NAV_ITEMS } from "../lib/pageAccess";

// Links come from lib/pageAccess, filtered to what the signed-in role may open. Pages without a
// real page yet are listed below as coming-soon labels rather than links, so the sidebar never
// points at one that does not exist.
const comingSoon: string[] = [];

const STORAGE_KEY = "zenzoo-sidebar-collapsed";
const WIDTH_OPEN = 240;
const WIDTH_COLLAPSED = 72;

export default function Sidebar() {
  const { colors, spacing, radius } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { me, isReady, canOpen } = useAccess();
  // Collapsed, only each page's icon shows. Remembered on this browser, like the theme.
  const [collapsed, setCollapsed] = useState(false);
  // The row under the pointer, which gets a faint background (the open page keeps its own).
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverProps = (id: string) => ({
    onMouseEnter: () => setHovered(id),
    onMouseLeave: () => setHovered((current) => (current === id ? null : current)),
  });
  const hoverBackground = `color-mix(in srgb, ${colors.ink} 3%, transparent)`;

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // storage blocked: start open
    }
  }, []);

  function toggle() {
    setCollapsed((current) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, current ? "0" : "1");
      } catch {
        // the choice still applies for this visit
      }
      return !current;
    });
  }

  // The same padding open or collapsed, so an icon doesn't shift sideways as the bar slides.
  const rowPadding = `${spacing[2]}px ${spacing[3]}px`;
  const rowStyle = { display: "flex", alignItems: "center", gap: spacing[3], minHeight: 40 };
  // Never shrinks, or the icon would squash to nothing in the narrow collapsed bar.
  const glyph = (name: IconName) => (
    <span style={{ display: "inline-flex", flex: "none" }}>
      <Icon name={name} size={22} />
    </span>
  );
  const label = (text: string) =>
    collapsed ? null : <span style={{ whiteSpace: "nowrap" }}>{text}</span>;

  return (
    <nav
      aria-label="Main"
      className="thin-scroll"
      style={{
        width: collapsed ? WIDTH_COLLAPSED : WIDTH_OPEN,
        flex: "none",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowX: "hidden",
        overflowY: "auto",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: spacing[1],
        padding: collapsed ? spacing[2] : spacing[4],
        borderRight: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceRaised,
        transition: "width 160ms ease",
      }}
    >
      <div
        style={{
          ...rowStyle,
          justifyContent: collapsed ? "center" : "space-between",
          padding: rowPadding,
          marginBottom: spacing[4],
        }}
      >
        {collapsed ? null : (
          <span style={{ ...textStyle("headline"), color: colors.ink }}>ZenZoo</span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand" : "Collapse"}
          style={{
            display: "inline-flex",
            padding: 0,
            border: "none",
            background: "none",
            color: colors.inkMuted,
            cursor: "pointer",
            transform: collapsed ? "rotate(180deg)" : "none",
          }}
        >
          <Icon name="back" size={20} />
        </button>
      </div>

      {/* Until the role is known, placeholders hold the links' space so they don't pop in. */}
      {!isReady
        ? NAV_ITEMS.slice(0, 6).map((item) => (
            <div key={item.href} style={{ padding: rowPadding }}>
              <Skeleton width={collapsed ? "24px" : "60%"} />
            </div>
          ))
        : null}

      {NAV_ITEMS.filter((item) => canOpen(item.href)).map((item) => {
        // Sub-pages (e.g. /stocks/<id>/variants) keep their parent section highlighted.
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            aria-label={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            {...hoverProps(item.href)}
            style={{
              ...textStyle(active ? "bodyMedium" : "body"),
              ...rowStyle,
              color: active || hovered === item.href ? colors.ink : colors.inkMuted,
              backgroundColor: active
                ? colors.surfaceSunken
                : hovered === item.href
                  ? hoverBackground
                  : "transparent",
              borderRadius: radius.md,
              padding: rowPadding,
              textDecoration: "none",
              transition: "background-color 120ms ease",
            }}
          >
            {glyph(item.icon)}
            {label(item.label)}
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
        {me && collapsed ? (
          <div
            title={`${me.name} · ${me.roleName ?? "Signed in"}`}
            style={{ ...rowStyle, padding: rowPadding }}
          >
            {glyph("user")}
          </div>
        ) : me ? (
          // The My profile page is switched off for now (see app/(app)/profile/page.tsx),
          // so this shows who is signed in without linking anywhere.
          <div
            style={{
              ...textStyle("body"),
              color: colors.ink,
              padding: `${spacing[2]}px ${spacing[3]}px`,
            }}
          >
            {me.name}
            <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
              {me.roleName ?? "Signed in"}
            </span>
          </div>
        ) : collapsed ? null : (
          <div style={{ padding: `${spacing[2]}px ${spacing[3]}px` }}>
            <Skeleton width="55%" />
            <Skeleton text="footnote" width="35%" />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            signOut().then(() => router.push("/sign-in"));
          }}
          title={collapsed ? "Sign out" : undefined}
          aria-label="Sign out"
          {...hoverProps("sign-out")}
          style={{
            ...textStyle("body"),
            ...rowStyle,
            color: hovered === "sign-out" ? colors.ink : colors.inkMuted,
            padding: rowPadding,
            textAlign: "left",
            background: hovered === "sign-out" ? hoverBackground : "none",
            border: "none",
            borderRadius: radius.md,
            cursor: "pointer",
            transition: "background-color 120ms ease",
          }}
        >
          {glyph("lock")}
          {label("Sign out")}
        </button>
      </div>
    </nav>
  );
}
