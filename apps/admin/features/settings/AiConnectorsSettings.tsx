"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, Icon, textStyle } from "@zenzoo/ui-web";
import { useState } from "react";
import PageHeader from "../../components/PageHeader";
import ConnectClaudeDialog from "./ConnectClaudeDialog";

/**
 * The AI connectors page: the assistants a shop can connect, and the ones already connected.
 * Connecting is the front end only for now - nothing is saved, so every connector shows as not
 * connected.
 */
export default function AiConnectorsSettings() {
  const { colors, radius, spacing } = useTheme();
  const [connectingClaude, setConnectingClaude] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="AI connectors"
        subtitle="AI assistants that can read your shop's data."
        backHref="/settings"
        backLabel="Back to settings"
      />

      <section style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
        <h2 style={{ ...textStyle("title3"), color: colors.ink, margin: 0 }}>Available</h2>
        <Card
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing[4],
            maxWidth: 720,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              flexShrink: 0,
              borderRadius: radius.lg,
              backgroundColor: colors.surfacePlayful,
              color: colors.ink,
            }}
          >
            <Icon name="plug" size={26} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[1], flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
              <span style={{ ...textStyle("headline"), color: colors.ink }}>Claude</span>
              <Badge>Not connected</Badge>
            </div>
            <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>
              Ask Claude about your sales, stock and customers. It reads what your role allows and
              cannot change anything.
            </span>
          </div>
          <Button type="button" variant="primary" onClick={() => setConnectingClaude(true)}>
            Get started
          </Button>
        </Card>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
        <h2 style={{ ...textStyle("title3"), color: colors.ink, margin: 0 }}>Connected</h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: spacing[2],
            padding: spacing[8],
            borderRadius: radius.lg,
            backgroundColor: colors.surfacePlayful,
            textAlign: "center",
            maxWidth: 720,
          }}
        >
          <span style={{ ...textStyle("headline"), color: colors.ink }}>No AI connectors yet</span>
          <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>
            Once you connect an assistant like Claude, it will show up here.
          </span>
        </div>
      </section>

      <ConnectClaudeDialog open={connectingClaude} onClose={() => setConnectingClaude(false)} />
    </div>
  );
}
