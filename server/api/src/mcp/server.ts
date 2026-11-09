import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CapabilityActor } from "@zenzoo/types";
import type { Request, Response } from "express";
import { z } from "zod";
import { hashAgentToken } from "../auth/agentToken";
import { capabilityRegistry, type AnyReadCapability } from "../capabilities/registry";
import { prisma } from "../shared/prisma";

/**
 * The MCP endpoint (POST /mcp). An outside tool such as Claude sends a token it was given; the
 * token is scrambled and looked up (find_agent_actor, see the agent_tokens migration) to find the
 * person it acts as, then each tool call goes through the same capability pipeline as the admin
 * and POS - permission check, policies, handler - so an agent never sees more than that person's
 * role allows.
 *
 * Reads only: a capability is offered only if its kind is "read" and it has a description and an
 * input schema. Actions are never registered.
 */

/** The tools offered to agents: every read that says what it does and what it takes. */
function offeredReads(): AnyReadCapability[] {
  return capabilityRegistry
    .map((entry) => entry.capability)
    .filter(
      (capability) => capability.kind === "read" && capability.description && capability.input,
    );
}

/** Who a Bearer token belongs to, or null if it is missing, unknown, revoked or switched off. */
async function actorFromToken(header: string | undefined): Promise<CapabilityActor | null> {
  const match = header?.match(/^Bearer (.+)$/i);
  if (!match?.[1]) return null;
  const rows = await prisma.$queryRaw<{ user_id: string; tenant_id: string }[]>`
    SELECT user_id, tenant_id FROM find_agent_actor(${hashAgentToken(match[1])})
  `;
  const row = rows[0];
  return row ? { userId: row.user_id, tenantId: row.tenant_id } : null;
}

/** Turns a capability result into what an MCP tool returns. */
function toToolResult(result: Awaited<ReturnType<AnyReadCapability["execute"]>>) {
  if (result.ok) {
    return { content: [{ type: "text" as const, text: JSON.stringify(result.data) }] };
  }
  return {
    isError: true,
    content: [{ type: "text" as const, text: `${result.error.code}: ${result.error.message}` }],
  };
}

function buildServer(actor: CapabilityActor): McpServer {
  const server = new McpServer({ name: "zenzoo", version: "0.1.0" });

  for (const capability of offeredReads()) {
    const description = capability.description;
    if (capability.input instanceof z.ZodVoid) {
      // A read that takes nothing has no arguments to publish.
      server.registerTool(capability.name, { description }, async () =>
        toToolResult(await capability.execute(actor, undefined)),
      );
    } else if (capability.input instanceof z.ZodObject) {
      server.registerTool(
        capability.name,
        { description, inputSchema: capability.input },
        async (args) => toToolResult(await capability.execute(actor, args)),
      );
    } else {
      console.warn(`[mcp] ${capability.name} skipped: input must be z.void() or z.object()`);
    }
  }
  return server;
}

export async function handleMcpPost(req: Request, res: Response): Promise<void> {
  try {
    const actor = await actorFromToken(req.headers.authorization);
    if (!actor) {
      res.status(401).json({ error: "A valid agent token is required" });
      return;
    }

    // Stateless: each request gets its own server and transport, so nothing is remembered between
    // calls and a token revoked a moment ago stops working on the very next one.
    const server = buildServer(actor);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[mcp] request failed:", error);
    if (!res.headersSent) {
      res.status(503).json({ error: "Temporary problem, please try again." });
    }
  }
}

/** GET and DELETE are for sessions, which this server doesn't keep. */
export function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({ error: "Use POST" });
}
