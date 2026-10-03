"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, textStyle } from "@zenzoo/ui-web";

export default function HomePage() {
  const { colors, spacing } = useTheme();

  return (
    <main style={{ padding: spacing[10], display: "flex", justifyContent: "center" }}>
      <Card style={{ maxWidth: 360, width: "100%" }}>
        <div style={{ ...textStyle("title2"), color: colors.ink }}>ZenZoo Admin</div>
        <p style={{ ...textStyle("callout"), color: colors.inkMuted, marginTop: spacing[2] }}>
          Foundation is running. Product workflows are built feature by feature from here.
        </p>
        <div
          style={{ display: "flex", alignItems: "center", gap: spacing[3], marginTop: spacing[6] }}
        >
          <Button variant="primary">Get started</Button>
          <Badge tone="success">Connected</Badge>
        </div>
      </Card>
    </main>
  );
}
