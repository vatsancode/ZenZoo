import { toQuantity } from "../../shared/quantity";

export interface CurrentStockDto {
  variantId: string;
  onHand: number;
}

export interface BatchDto {
  id: string;
  barcode: string;
  receivedQuantity: number;
  availableQuantity: number;
  unitCost: string;
  receivedAt: string;
}

export interface StockMovementDto {
  id: string;
  movementType: string;
  quantity: number;
  batchId: string;
  referenceType: string | null;
  reason: string | null;
  occurredAt: string;
}

interface BatchRow {
  id: string;
  barcode: string;
  received_quantity: { toString(): string };
  available_quantity: { toString(): string };
  unit_cost: { toString(): string };
  received_at: Date;
}

interface StockMovementRow {
  id: string;
  movement_type: string;
  quantity: { toString(): string };
  batch_id: string;
  reference_type: string | null;
  reason: string | null;
  occurred_at: Date;
}

export function toBatchDto(row: BatchRow): BatchDto {
  return {
    id: row.id,
    barcode: row.barcode,
    receivedQuantity: toQuantity(row.received_quantity),
    availableQuantity: toQuantity(row.available_quantity),
    unitCost: row.unit_cost.toString(),
    receivedAt: row.received_at.toISOString(),
  };
}

export function toStockMovementDto(row: StockMovementRow): StockMovementDto {
  return {
    id: row.id,
    movementType: row.movement_type,
    quantity: toQuantity(row.quantity),
    batchId: row.batch_id,
    referenceType: row.reference_type,
    reason: row.reason,
    occurredAt: row.occurred_at.toISOString(),
  };
}

export const BATCH_SELECT = {
  id: true,
  barcode: true,
  received_quantity: true,
  available_quantity: true,
  unit_cost: true,
  received_at: true,
} as const;

export const STOCK_MOVEMENT_SELECT = {
  id: true,
  movement_type: true,
  quantity: true,
  batch_id: true,
  reference_type: true,
  reason: true,
  occurred_at: true,
} as const;
