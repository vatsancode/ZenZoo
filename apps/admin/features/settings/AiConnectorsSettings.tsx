"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, Icon, LoadError, Notice, Skeleton, textStyle } from "@zenzoo/ui-web";
import { useCallback, useEffect, useState } from "react";
import {
  disconnectAgent,
  listAgentConnections,
  type AgentConnection,
} from "../../lib/agentConnections";
import { useSingleFlight } from "../../lib/useSingleFlight";
import PageHeader from "../../components/PageHeader";
import ConnectClaudeDialog from "./ConnectClaudeDialog";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The AI connectors page: the assistants a shop can connect, and the ones the signed-in person
 * has already connected. Connecting happens in Claude (see ConnectClaudeDialog) and is approved on
 * the /connect page; this page lists what is connected and lets the person disconnect it.
 */
export default function AiConnectorsSettings() {
  const { colors, radius, spacing } = useTheme();
  const [connectingClaude, setConnectingClaude] = useState(false);
  const [connections, setConnections] = useState<AgentConnection[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [disconnectFailed, setDisconnectFailed] = useState(false);
  const { busy, run } = useSingleFlight();

  const load = useCallback(async () => {
    setLoadFailed(false);
    const result = await listAgentConnections();
    if (result === null) setLoadFailed(true);
    else setConnections(result);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function disconnect(connection: AgentConnection) {
    return run(async () => {
      setNotice(null);
      setDisconnectFailed(false);
      const ok = await disconnectAgent(connection.id);
      if (!ok) {
        setDisconnectFailed(true);
        return;
      }
      setNotice(`${connection.name} is disconnected. It can no longer read your shop.`);
      await load();
    });
  }

  const claudeConnected = (connections ?? []).length > 0;

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
              <Badge tone={claudeConnected ? "success" : "neutral"}>
                {claudeConnected ? "Connected" : "Not connected"}
              </Badge>
            </div>
            <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>
              Ask Claude about your sales, stock and customers. It reads what your role allows and
              cannot change anything.
            </span>
          </div>
          <Button type="button" variant="primary" onClick={() => setConnectingClaude(true)}>
            {claudeConnected ? "Connect again" : "Get started"}
          </Button>
        </Card>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
        <h2 style={{ ...textStyle("title3"), color: colors.ink, margin: 0 }}>Connected</h2>

        {notice ? <Notice style={{ maxWidth: 720 }}>{notice}</Notice> : null}
        {disconnectFailed ? (
          <div style={{ ...textStyle("callout"), color: colors.danger }} role="alert">
            Couldn&apos;t disconnect. Try again.
          </div>
        ) : null}

        {loadFailed ? (
          <LoadError
            message="Couldn't load your connected assistants."
            onRetry={() => void load()}
            style={{ maxWidth: 720 }}
          />
        ) : connections === null ? (
          <Skeleton variant="block" height={72} style={{ maxWidth: 720 }} />
        ) : connections.length === 0 ? (
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
            <span style={{ ...textStyle("headline"), color: colors.ink }}>
              No AI connectors yet
            </span>
            <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>
              Once you connect an assistant like Claude, it will show up here.
            </span>
          </div>
        ) : (
          connections.map((connection) => (
            <Card
              key={connection.id}
              style={{ display: "flex", alignItems: "center", gap: spacing[4], maxWidth: 720 }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: spacing[1], flex: 1 }}>
                <span style={{ ...textStyle("headline"), color: colors.ink }}>
                  {connection.name}
                </span>
                <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>
                  Connected {formatWhen(connection.connectedAt)}
                  {connection.lastUsedAt
                    ? `. Last active ${formatWhen(connection.lastUsedAt)}`
                    : ""}
                  .
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void disconnect(connection)}
              >
                Disconnect
              </Button>
            </Card>
          ))
        )}
      </section>

      <ConnectClaudeDialog open={connectingClaude} onClose={() => setConnectingClaude(false)} />
    </div>
  );
}
