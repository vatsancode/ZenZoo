export interface UnitDto {
  id: string;
  code: string;
  name: string;
  allowDecimals: boolean;
  status: "active" | "disabled";
  /** The one unit every shop has to keep (Pieces): it can't be deleted, whatever its code is now. */
  permanent: boolean;
  /** Where the shop placed it, or null while it follows the A-Z default. */
  sortOrder: number | null;
}

interface UnitRow {
  id: string;
  code: string;
  name: string;
  allow_decimals: boolean;
  status: string;
  system_key: string | null;
  sort_order: number | null;
}

export function toUnitDto(row: UnitRow): UnitDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    allowDecimals: row.allow_decimals,
    status: row.status === "disabled" ? "disabled" : "active",
    permanent: row.system_key === "pieces",
    sortOrder: row.sort_order,
  };
}

export const UNIT_SELECT = {
  id: true,
  code: true,
  name: true,
  allow_decimals: true,
  status: true,
  system_key: true,
  sort_order: true,
} as const;
