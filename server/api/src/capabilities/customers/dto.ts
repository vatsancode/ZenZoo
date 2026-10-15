import { Prisma } from "@prisma/client";
import type { CapabilityActor } from "@zenzoo/types";
import type { TenantTx } from "../../shared/tenantContext";

/** Tenant-wide, not store-scoped - customers has no store_id, so one customer is known at every store. */
export interface CustomerDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "archived";
  /** When they were first added, as YYYY-MM-DD. */
  since: string;
  /** What they owe the shop (above 0) or hold as store credit (below 0), as "250.00" / "-100.00". */
  balance: string;
}

export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: Date;
}

export const CUSTOMER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
  status: true,
  created_at: true,
} as const;

/** `balancePaise` is their ledger balance (see ledger.ts); a customer with no entries owes nothing. */
export function toCustomerDto(row: CustomerRow, balancePaise = 0): CustomerDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    status: row.status === "archived" ? "archived" : "active",
    since: row.created_at.toISOString().slice(0, 10),
    balance: (balancePaise / 100).toFixed(2),
  };
}

const blankToNull = (value?: string) => value?.trim() || null;

/**
 * Digits and an optional leading + - so "98765 43210", "98765-43210" and
 * "(98765) 43210" are one number, which the active-phone unique index then
 * enforces (customers_tenant_phone_active_unique).
 */
export function normalisePhone(value?: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return raw.startsWith("+") ? `+${digits}` : digits;
}

/** Checks and normalises a customer form - throws the message the person should see. */
export function cleanCustomerInput(input: CustomerInput) {
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("Enter the customer's name.");
  if (name.length > 200) throw new Error("That name is too long.");

  const phone = normalisePhone(input.phone);
  if (phone && (phone.replace("+", "").length < 6 || phone.length > 20)) {
    throw new Error("That phone number doesn't look right.");
  }

  // customers_email_lowercase_check
  const email = blankToNull(input.email)?.toLowerCase() ?? null;
  if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("That email address doesn't look right.");
  }

  return {
    name,
    phone,
    email,
    address: blankToNull(input.address),
    notes: blankToNull(input.notes),
  };
}

/** Throws "This number belongs to …" when another active customer already has the phone. */
export async function assertPhoneFree(
  tx: TenantTx,
  actor: CapabilityActor,
  phone: string | null,
  excludeId?: string,
) {
  if (!phone) return;
  const owner = await tx.customers.findFirst({
    where: {
      tenant_id: actor.tenantId,
      phone,
      status: "active",
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { name: true },
  });
  if (owner) throw new Error(`This number belongs to ${owner.name}.`);
}

/** The index catches the race assertPhoneFree can't (two saves at once) - same message, minus the name. */
export function rethrowPhoneTaken(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new Error("This number belongs to another customer.");
  }
  throw error;
}
