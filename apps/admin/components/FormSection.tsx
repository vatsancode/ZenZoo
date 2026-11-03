"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { ReactNode } from "react";

interface FormSectionProps {
  title: string;
  /** One line under the title saying what the section is for. */
  description?: string;
  /** Fields, each a `FormField` that sets its own column span on the 12-column grid. */
  children: ReactNode;
  /** The hairline above the section; turn it off for the first one on a form. On by default. */
  divider?: boolean;
  /** Sits at the right end of the title row, e.g. a button that changes how the section works. */
  action?: ReactNode;
}

/**
 * A titled group of fields on a form, set apart from the one above by a hairline. It owns the
 * 12-column grid, so a form is just a stack of sections.
 */
export default function FormSection({
  title,
  description,
  children,
  divider = true,
  action,
}: FormSectionProps) {
  const { colors, spacing } = useTheme();
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing[5],
        paddingTop: divider ? spacing[6] : 0,
        borderTop: divider ? `1px solid ${colors.border}` : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[3],
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
          <h3 style={{ ...textStyle("title3"), margin: 0, color: colors.ink }}>{title}</h3>
          {description ? (
            <p style={{ ...textStyle("footnote"), margin: 0, color: colors.inkMuted }}>
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          columnGap: spacing[3],
          rowGap: spacing[6],
          alignItems: "start",
        }}
      >
        {children}
      </div>
    </section>
  );
}
