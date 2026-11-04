"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, IconButton, Modal, Notice, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import ConnectClaudeAnimation from "./ConnectClaudeAnimation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** The address Claude is asked to connect to. */
const MCP_URL = `${API_URL}/mcp`;

/** Opens Claude with its "Add custom connector" form already showing. */
const CLAUDE_CONNECTORS_URL =
  "https://claude.ai/new?modal=add-custom-connector#customize/connectors";

interface ConnectClaudeDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Walks a person through adding ZenZoo to Claude as a connector. */
export default function ConnectClaudeDialog({ open, onClose }: ConnectClaudeDialogProps) {
  const { colors, radius, spacing } = useTheme();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
    } catch {
      // Some browsers refuse; the address stays on screen to select by hand.
    }
  }

  function copyAndOpenClaude() {
    // Opened first, in the click itself, so the browser doesn't block the new tab.
    window.open(CLAUDE_CONNECTORS_URL, "_blank", "noopener,noreferrer");
    void copyAddress();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing[6],
          width: 720,
          maxWidth: "100%",
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
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
          <div style={{ ...textStyle("title2"), color: colors.ink }}>Connect Claude</div>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>

        <ConnectClaudeAnimation address={MCP_URL} />

        <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
          <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>MCP server URL</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing[2],
              padding: spacing[3],
              paddingInlineStart: spacing[4],
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSunken,
            }}
          >
            <span
              style={{
                ...textStyle("dataSmall"),
                color: colors.ink,
                flex: 1,
                minWidth: 0,
                overflowWrap: "anywhere",
                userSelect: "all",
              }}
            >
              {MCP_URL}
            </span>
            <IconButton
              icon={copied ? "check" : "copy"}
              label="Copy address"
              tone={copied ? "success" : "default"}
              onClick={() => void copyAddress()}
            />
          </div>
        </div>

        {copied && <Notice>Address copied. Paste it where Claude asks for it.</Notice>}

        <Button type="button" variant="primary" onClick={copyAndOpenClaude}>
          Copy address and open Claude
        </Button>
      </div>
    </Modal>
  );
}
