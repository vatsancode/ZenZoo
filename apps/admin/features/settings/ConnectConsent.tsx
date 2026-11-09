"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, LoadError, Skeleton, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  decideConsent,
  loadConsent,
  type ConsentDetails,
  type ConsentLoad,
} from "../../lib/agentConnections";
import { redirectToSignInThenBack } from "../../lib/auth";
import { useSingleFlight } from "../../lib/useSingleFlight";

type Screen =
  | { kind: "loading" }
  | { kind: "ready"; details: ConsentDetails }
  | { kind: "invalid" }
  | { kind: "error" };

/**
 * The page Claude sends the person to: "Allow Claude to read your shop?". Allow or Cancel both
 * send the browser back to Claude, which finishes (or abandons) the sign-in behind the scenes.
 */
export default function ConnectConsent() {
  const { colors, spacing } = useTheme();
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [failed, setFailed] = useState(false);
  const { busy, run } = useSingleFlight();

  function load() {
    setScreen({ kind: "loading" });
    const search = window.location.search;
    void loadConsent(search).then((result: ConsentLoad) => {
      if (result.status === "signed-out") {
        redirectToSignInThenBack(`/connect${search}`);
      } else if (result.status === "ok") {
        setScreen({ kind: "ready", details: result.details });
      } else {
        setScreen({ kind: result.status });
      }
    });
  }

  useEffect(load, []);

  function decide(decision: "allow" | "deny") {
    return run(async () => {
      setFailed(false);
      const redirectUrl = await decideConsent(window.location.search, decision);
      if (!redirectUrl) {
        setFailed(true);
        return;
      }
      window.location.href = redirectUrl;
      return "leaving";
    });
  }

  if (screen.kind === "error") {
    return (
      <Card style={{ maxWidth: 480, width: "100%" }}>
        <LoadError message="Couldn't load this request." onRetry={load} />
      </Card>
    );
  }

  if (screen.kind === "invalid") {
    return (
      <Card style={{ maxWidth: 480, width: "100%" }}>
        <div style={{ ...textStyle("title2"), color: colors.ink, marginBottom: spacing[2] }}>
          This link isn&apos;t valid
        </div>
        <p style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          Go back to Claude and start connecting again.
        </p>
      </Card>
    );
  }

  if (screen.kind === "loading") {
    return (
      <Card style={{ maxWidth: 480, width: "100%" }}>
        <Skeleton text="title2" style={{ marginBottom: spacing[4] }} />
        <Skeleton variant="block" height={64} />
      </Card>
    );
  }

  const { clientName, shopName, userName, roleName } = screen.details;
  const shop = shopName ?? "your shop";

  return (
    <Card style={{ maxWidth: 480, width: "100%" }}>
      <div style={{ ...textStyle("title2"), color: colors.ink, marginBottom: spacing[2] }}>
        Allow {clientName} to read {shop}?
      </div>
      <p style={{ ...textStyle("callout"), color: colors.inkMuted, marginBottom: spacing[4] }}>
        {clientName} will see {shop} as {userName}
        {roleName ? ` (${roleName})` : ""}. It can read only what your role allows, and it cannot
        change anything.
      </p>
      <p style={{ ...textStyle("callout"), color: colors.inkMuted, marginBottom: spacing[6] }}>
        You can disconnect it any time in Settings, AI connectors.
      </p>

      {failed ? (
        <div
          style={{ ...textStyle("callout"), color: colors.danger, marginBottom: spacing[4] }}
          role="alert"
        >
          Couldn&apos;t finish connecting. Try again.
        </div>
      ) : null}

      <div style={{ display: "flex", gap: spacing[3] }}>
        <Button type="button" variant="primary" loading={busy} onClick={() => void decide("allow")}>
          Allow
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void decide("deny")}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
