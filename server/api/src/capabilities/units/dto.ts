export interface UnitDto {
  id: string;
  code: string;
  name: string;
  allowDecimals: boolean;
  status: "active" | "disabled";
}

interface UnitRow {
  id: string;
  code: string;
  name: string;
  allow_decimals: boolean;
  status: string;
}

export function toUnitDto(row: UnitRow): UnitDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    allowDecimals: row.allow_decimals,
    status: row.status === "disabled" ? "disabled" : "active",
  };
}

export const UNIT_SELECT = {
  id: true,
  code: true,
  name: true,
  allow_decimals: true,
  status: true,
} as const;
