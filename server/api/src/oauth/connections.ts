import type { Request, Response } from "express";
import { getActor } from "../auth/actor";
import { runInTenantContext } from "../shared/tenantContext";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /agent-connections - the AI assistants the signed-in person has connected (their own only). */
export async function listConnections(req: Request, res: Response): Promise<void> {
  const actor = getActor(req);
  const rows = await runInTenantContext(actor, (tx) =>
    tx.agent_connections.findMany({
      where: { revoked_at: null, tenant_memberships: { user_id: actor.userId } },
      orderBy: { created_at: "desc" },
      select: { id: true, name: true, created_at: true, last_used_at: true },
    }),
  );
  res.json({
    connections: rows.map((row) => ({
      id: row.id,
      name: row.name,
      connectedAt: row.created_at.toISOString(),
      lastUsedAt: row.last_used_at?.toISOString() ?? null,
    })),
  });
}

/** DELETE /agent-connections/:id - Disconnect: switches off the connection and every token it made. */
export async function disconnect(req: Request, res: Response): Promise<void> {
  const actor = getActor(req);
  const id = req.params.id as string;
  if (!UUID.test(id)) {
    res.status(404).json({ error: "That connection was not found." });
    return;
  }

  const now = new Date();
  const switchedOff = await runInTenantContext(actor, async (tx) => {
    const result = await tx.agent_connections.updateMany({
      where: { id, revoked_at: null, tenant_memberships: { user_id: actor.userId } },
      data: { revoked_at: now },
    });
    if (result.count === 0) return false;
    await tx.agent_tokens.updateMany({
      where: { connection_id: id, revoked_at: null },
      data: { revoked_at: now },
    });
    return true;
  });

  if (!switchedOff) {
    res.status(404).json({ error: "That connection was not found." });
    return;
  }
  res.status(204).end();
}
