"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Icon, textStyle } from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Round icon-only back button, then the page title with a line of detail beneath it. */
export default function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  subtitle?: string;
  backHref: string;
  backLabel: string;
  /** Sits at the right edge, level with the title. */
  action?: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const router = useRouter();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing[4],
        marginBottom: spacing[6],
      }}
    >
      <Button
        variant="secondary"
        aria-label={backLabel}
        title={backLabel}
        onClick={() => router.push(backHref)}
        style={{ width: 44, paddingInline: 0, flexShrink: 0 }}
      >
        <Icon name="back" size={20} />
      </Button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ ...textStyle("title1"), color: colors.ink, margin: 0 }}>{title}</h1>
        {subtitle ? (
          <p
            style={{
              ...textStyle("callout"),
              color: colors.inkMuted,
              margin: `${spacing[1]}px 0 0`,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
    </div>
  );
}
