"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { LoadError, Skeleton, textStyle } from "@zenzoo/ui-web";
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
  const { isReady, loadFailed, retrying, retry, can, canOpen } = useAccess();

  const allowed = canOpen(pathname);
  const fallback = isReady && !allowed ? firstAllowedPage(can) : null;

  useEffect(() => {
    if (pathname === "/" && fallback) router.replace(fallback.href);
  }, [pathname, fallback, router]);

  if (loadFailed && !isReady) {
    return (
      <main style={{ padding: spacing[10] }}>
        <LoadError
          message="Couldn't load your access. Check your connection and try again."
          onRetry={retry}
          retrying={retrying}
        />
      </main>
    );
  }

  if (!isReady || (pathname === "/" && fallback)) {
    // Roughly a page's shape - a title, then its content - so the real page drops into place.
    return (
      <main style={{ padding: spacing[10] }}>
        <Skeleton text="title1" width="28%" style={{ marginBottom: spacing[6] }} />
        <Skeleton variant="block" height={spacing[16] * 4} />
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
          <Link href={fallback.href} style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
            Go to {fallback.label}
          </Link>
        ) : null}
      </main>
    );
  }

  return <>{children}</>;
}
