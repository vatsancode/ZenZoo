"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAccess } from "../lib/access";
import { firstAllowedPage } from "../lib/pageAccess";

/**
 * Holds a page back until we know who is looking, then shows it only if their role may open it
 * (lib/pageAccess). Waiting matters: otherwise the page would mount and ask the API for data a
 * role can't have, and flash errors. Landing on the dashboard without access moves on to the
 * first page they do have.
 */
export default function AccessGate({ children }: { children: ReactNode }) {
  const { colors, spacing } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { me, can, canOpen } = useAccess();

  const allowed = canOpen(pathname);
  const fallback = me && !allowed ? firstAllowedPage(can) : null;

  useEffect(() => {
    if (pathname === "/" && fallback) router.replace(fallback.href);
  }, [pathname, fallback, router]);

  if (!me || (pathname === "/" && fallback)) {
    return (
      <main style={{ padding: spacing[10] }}>
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>Loading...</div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main style={{ padding: spacing[10] }}>
        <h1 style={{ ...textStyle("title1"), marginBottom: spacing[3] }}>No access</h1>
        <p style={{ ...textStyle("callout"), color: colors.inkMuted, marginBottom: spacing[5] }}>
          Your role doesn&apos;t include this page. If you need it, ask the owner of the shop.
        </p>
        {fallback ? (
          <Link
            href={fallback.href}
            style={{ ...textStyle("bodyMedium"), color: colors.ink }}
          >
            Go to {fallback.label}
          </Link>
        ) : null}
      </main>
    );
  }

  return <>{children}</>;
}
