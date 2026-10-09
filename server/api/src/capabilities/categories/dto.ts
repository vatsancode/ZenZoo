export interface CategoryDto {
  id: string;
  storeId: string;
  name: string;
  parentId: string | null;
}

interface CategoryRow {
  id: string;
  store_id: string;
  name: string;
  parent_id: string | null;
}

export function toCategoryDto(row: CategoryRow): CategoryDto {
  return { id: row.id, storeId: row.store_id, name: row.name, parentId: row.parent_id };
}

export const CATEGORY_SELECT = {
  id: true,
  store_id: true,
  name: true,
  parent_id: true,
} as const;
