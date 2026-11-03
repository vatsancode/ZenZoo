import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { logAudit } from "../../lib/audit";
import { apiFetch } from "../../lib/apiFetch";
import { rememberUnits } from "../../lib/unitRules";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Unit {
  id: string;
  code: string;
  name: string;
  allowDecimals: boolean;
  status: "active" | "disabled";
  /** The built-in Pieces unit: it can be renamed, but never deleted. */
  permanent: boolean;
  /** Where the shop placed it, or null while it follows the A-Z default. */
  sortOrder: number | null;
}

interface UnitResponse {
  id: string;
  code: string;
  name: string;
  allowDecimals: boolean;
  status: "active" | "disabled";
  permanent?: boolean;
  sortOrder?: number | null;
}

function toUnit(response: UnitResponse): Unit {
  return {
    id: response.id,
    code: response.code,
    name: response.name,
    allowDecimals: response.allowDecimals,
    status: response.status,
    permanent: response.permanent ?? false,
    sortOrder: response.sortOrder ?? null,
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

/** Lists this tenant's units from the real API - the lookup, which Stocks, Purchases and Settings roles can each read. */
export async function listUnits(): Promise<Unit[]> {
  const response = await apiFetch(`${API_URL}/lookups/units`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as UnitResponse[];
  const units = data.map(toUnit);
  rememberUnits(units);
  return units;
}

/** Adds a unit of the shop's own, like "doz" - requires "settings:edit". */
export async function addUnit(
  code: string,
  name: string,
  allowDecimals: boolean,
): Promise<Unit | string> {
  const response = await apiFetch(`${API_URL}/units`, {
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

/** Changes a unit's name and short code - requires "settings:edit". Products follow the unit, not its code. Returns the reason it failed, or null. */
export async function updateUnit(unit: Unit, name: string, code: string): Promise<string | null> {
  const response = await apiFetch(`${API_URL}/units/${unit.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, code }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const renamed = toUnit((await response.json()) as UnitResponse);
  logAudit({
    action: "updated",
    module: "Settings",
    entity: "Unit",
    label: renamed.name,
    before: { Name: unit.name, Code: unit.code },
    after: { Name: renamed.name, Code: renamed.code },
  });
  return null;
}

/** Saves the shop's own order, top to bottom - requires "settings:edit". Returns the reason it failed, or null. */
export async function reorderUnits(units: Unit[]): Promise<string | null> {
  const response = await apiFetch(`${API_URL}/units/order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ orderedIds: units.map((unit) => unit.id) }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  logAudit({
    action: "updated",
    module: "Settings",
    entity: "Unit order",
    label: "Display order",
    before: null,
    after: { Order: units.map((unit) => unit.name).join(", ") },
  });
  return null;
}

/** Goes back to A-Z (English, then Tamil, then the rest) - requires "settings:edit". Returns the reason it failed, or null. */
export async function resetUnitOrder(): Promise<string | null> {
  const response = await apiFetch(`${API_URL}/units/order`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  logAudit({
    action: "updated",
    module: "Settings",
    entity: "Unit order",
    label: "Display order",
    before: null,
    after: { Order: "A to Z" },
  });
  return null;
}

/** Switches a unit on or off - requires "settings:edit". At least one stays on. */
export async function setUnitEnabled(id: string, enabled: boolean): Promise<string | null> {
  const response = await apiFetch(`${API_URL}/units/${id}/status`, {
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

/** Deletes a unit no product uses - requires "settings:delete". Returns the reason when it can't. */
export async function deleteUnit(unit: Unit): Promise<string | null> {
  const response = await apiFetch(`${API_URL}/units/${unit.id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  logAudit({
    action: "deleted",
    module: "Settings",
    entity: "Unit",
    label: unit.name,
    before: { Code: unit.code, "Allows decimals": unit.allowDecimals ? "Yes" : "No" },
    after: null,
  });
  return null;
}

/** The active units, shaped for a Select - value is the unit's real id, not its code. */
export function unitOptions(units: Unit[]): { value: string; label: string }[] {
  return units
    .filter((unit) => unit.status === "active")
    .map((unit) => ({ value: unit.id, label: unit.code }));
}
