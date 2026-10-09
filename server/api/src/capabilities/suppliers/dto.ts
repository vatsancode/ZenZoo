export interface SupplierDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  mapUrl: string | null;
  status: "active" | "archived";
}

interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  map_url: string | null;
  status: string;
}

export function toSupplierDto(row: SupplierRow): SupplierDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    taxId: row.tax_id,
    mapUrl: row.map_url,
    status: row.status === "active" ? "active" : "archived",
  };
}

export const SUPPLIER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  tax_id: true,
  map_url: true,
  status: true,
} as const;
