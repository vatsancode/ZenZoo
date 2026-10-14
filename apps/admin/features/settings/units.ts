import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { logAudit } from "../../lib/audit";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Unit {
  id: string;
  code: string;
  name: string;
  allowDecimals: boolean;
  status: "active" | "disabled";
}

interface UnitResponse {
  id: string;
  code: string;
  name: string;
  allowDecimals: boolean;
  status: "active" | "disabled";
}

function toUnit(response: UnitResponse): Unit {
  return {
    id: response.id,
    code: response.code,
    name: response.name,
    allowDecimals: response.allowDecimals,
    status: response.status,
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/** Lists this tenant's units from the real API - requires at least "settings:view". */
export async function listUnits(): Promise<Unit[]> {
  const response = await fetch(`${API_URL}/units`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as UnitResponse[];
  return data.map(toUnit);
}

/** Adds a unit of the shop's own, like "doz" - requires "settings:edit". */
export async function addUnit(code: string, name: string, allowDecimals: boolean): Promise<Unit | string> {
  const response = await fetch(`${API_URL}/units`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code, name, allowDecimals }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const unit = toUnit((await response.json()) as UnitResponse);
  logAudit({
    action: "created",
    module: "Settings",
    entity: "Unit",
    label: unit.name,
    before: null,
    after: { Code: unit.code, "Allows decimals": unit.allowDecimals ? "Yes" : "No" },
  });
  return unit;
}

/** Switches a unit on or off - requires "settings:edit". At least one stays on. */
export async function setUnitEnabled(id: string, enabled: boolean): Promise<string | null> {
  const response = await fetch(`${API_URL}/units/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ disabled: !enabled }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const unit = toUnit((await response.json()) as UnitResponse);
  logAudit({
    action: "updated",
    module: "Settings",
    entity: "Unit",
    label: unit.name,
    before: { Status: enabled ? "Off" : "On" },
    after: { Status: enabled ? "On" : "Off" },
  });
  return null;
}

/** The active units, shaped for a Select - value is the unit's real id, not its code. */
export function unitOptions(units: Unit[]): { value: string; label: string }[] {
  return units
    .filter((unit) => unit.status === "active")
    .map((unit) => ({ value: unit.id, label: unit.code }));
}
