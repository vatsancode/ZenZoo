export type AuditAction = "created" | "updated" | "deleted" | "signed_in" | "sign_in_failed";

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  signed_in: "Signed in",
  sign_in_failed: "Sign-in failed",
};

/** One field that changed: what it was and what it became. Null means it had no value. */
export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface AuditEntry {
  id: string;
  /** When it happened, as an ISO date-time. */
  at: string;
  actor: { name: string; role: string };
  /** The address the action came from. */
  ip: string;
  action: AuditAction;
  /** The area of the app, e.g. "Expenses". */
  module: string;
  /** What was acted on, e.g. "Expense" or "Vendor". */
  entity: string;
  /** A readable name for it, e.g. "Rent · ₹45,000". */
  label: string;
  changes: FieldChange[];
  /** Anything worth saying that isn't a field change. */
  note?: string;
}

// Who is signed in, and where they are signing in from. In this stand-in both are fixed:
// the person comes from the session and the address can only be read by the server, which
// is where real entries should be written. Replace with the real session and request values.
export const CURRENT_ACTOR = { name: "Vatsan S", role: "Owner" };
export const CURRENT_IP = "49.37.201.14";

type Snapshot = Record<string, string | null | undefined>;

/** The fields that differ between two snapshots. A created record has no "before"; a deleted one no "after". */
export function changesBetween(before: Snapshot | null, after: Snapshot | null): FieldChange[] {
  const fields = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  return fields
    .map((field) => ({
      field,
      before: before ? (before[field] ?? null) : null,
      after: after ? (after[field] ?? null) : null,
    }))
    .filter((change) => change.before !== change.after);
}

const entry = (
  id: string,
  at: string,
  actor: AuditEntry["actor"],
  ip: string,
  action: AuditAction,
  module: string,
  entity: string,
  label: string,
  changes: [string, string | null, string | null][],
  note?: string,
): AuditEntry => ({
  id,
  at,
  actor,
  ip,
  action,
  module,
  entity,
  label,
  changes: changes.map(([field, before, after]) => ({ field, before, after })),
  note,
});

const OWNER = { name: "Vatsan S", role: "Owner" };
const CASHIER = { name: "Meena R", role: "Cashier" };
const MANAGER = { name: "Karthik P", role: "Manager" };

// Sample entries standing in for a real audit capability: none exists on the backend yet.
// Real entries are written on the server, in the same transaction as the change they describe.
let entries: AuditEntry[] = [
  entry(
    "aud-14",
    "2026-10-05T16:40:00",
    CASHIER,
    "49.37.201.15",
    "created",
    "Sales",
    "Customer return",
    "RET-0002 on INV-0008",
    [
      ["Reason", null, "Changed their mind"],
      ["Goods returned", null, "Georgette party-wear saree, wine × 1"],
      ["Value", null, "₹5,800"],
      ["Refund", null, "Store credit ₹5,800"],
    ],
  ),
  entry(
    "aud-13",
    "2026-10-05T16:12:00",
    CASHIER,
    "49.37.201.15",
    "created",
    "Sales",
    "Sale",
    "INV-0008 · Meenakshi Iyer",
    [
      ["Customer", null, "Meenakshi Iyer"],
      ["Items", null, "Anarkali salwar set - M × 1, Georgette party-wear saree × 1"],
      ["Total", null, "₹9,200"],
      ["Payment", null, "Card into HDFC Current Account"],
    ],
  ),
  entry(
    "aud-12",
    "2026-10-05T11:03:00",
    OWNER,
    "49.37.201.14",
    "updated",
    "Catalogue",
    "Catalogue item",
    "Gift wrapping",
    [["Price", "₹40", "₹50"]],
  ),
  entry(
    "aud-11",
    "2026-10-04T18:20:00",
    OWNER,
    "49.37.201.14",
    "created",
    "Expenses",
    "Expense",
    "Tea and snacks · ₹420",
    [
      ["Date", null, "4 Oct 2026"],
      ["Category", null, "Tea and snacks"],
      ["Total", null, "₹420"],
      ["Paid from", null, "Cash drawer"],
    ],
  ),
  entry(
    "aud-10",
    "2026-10-04T10:02:00",
    MANAGER,
    "103.211.45.9",
    "updated",
    "Purchases",
    "Purchase",
    "JBP/09/231 · Jaipur Block Prints",
    [
      ["Status", "Ordered", "Partially received"],
      ["Received", "20 of 60", "30 of 60"],
    ],
    "Delivery recorded on 4 Oct 2026.",
  ),
  entry(
    "aud-09",
    "2026-10-03T15:45:00",
    OWNER,
    "49.37.201.14",
    "updated",
    "Vendors",
    "Vendor",
    "Kumaran Silks",
    [
      ["Phone", "+91 98765 43200", "+91 98765 43210"],
      ["Google Maps link", null, "https://maps.app.goo.gl/kumaransilks"],
    ],
  ),
  entry(
    "aud-08",
    "2026-10-03T12:30:00",
    OWNER,
    "49.37.201.14",
    "updated",
    "Expenses",
    "Expense",
    "Festival hoardings · Bright Signs",
    [
      ["Total", "₹6,000", "₹6,500"],
      ["Bill number", null, "BS/0917"],
    ],
  ),
  entry(
    "aud-07",
    "2026-10-02T09:15:00",
    OWNER,
    "49.37.201.14",
    "created",
    "Accounts",
    "Transfer",
    "Cash drawer to HDFC Current Account",
    [
      ["From", null, "Cash drawer"],
      ["To", null, "HDFC Current Account"],
      ["Amount", null, "₹12,000"],
      ["Note", null, "Cash deposited at the bank"],
    ],
  ),
  entry(
    "aud-06",
    "2026-10-02T09:10:00",
    OWNER,
    "49.37.201.14",
    "signed_in",
    "Security",
    "Session",
    "Vatsan S signed in",
    [],
  ),
  entry(
    "aud-05",
    "2026-10-02T03:48:00",
    { name: "Unknown", role: "-" },
    "185.220.101.4",
    "sign_in_failed",
    "Security",
    "Session",
    "Failed sign-in for vatsan.designs@gmail.com",
    [],
    "Wrong password. Three attempts in two minutes.",
  ),
  entry(
    "aud-04",
    "2026-10-01T17:00:00",
    MANAGER,
    "103.211.45.9",
    "updated",
    "Stocks",
    "Product",
    "Kanchipuram silk saree, maroon",
    [
      ["Selling price", "₹14,000", "₹14,500"],
      ["Purchase price", "₹10,500", "₹11,000"],
    ],
  ),
  entry(
    "aud-03",
    "2026-09-29T11:00:00",
    OWNER,
    "49.37.201.14",
    "updated",
    "Settings",
    "Category",
    "Sarees",
    [["Name", "Saris", "Sarees"]],
    "Products in the category followed the new name.",
  ),
  entry(
    "aud-02",
    "2026-09-28T10:30:00",
    OWNER,
    "49.37.201.14",
    "created",
    "Accounts",
    "Account",
    "ICICI Savings Account",
    [
      ["Name", null, "ICICI Savings Account"],
      ["Opening balance", null, "₹80,000"],
    ],
  ),
  entry(
    "aud-01",
    "2026-09-28T10:20:00",
    OWNER,
    "49.37.201.14",
    "deleted",
    "Expenses",
    "Expense",
    "Courier charges · ₹350",
    [
      ["Date", "27 Sep 2026", null],
      ["Category", "Transport", null],
      ["Total", "₹350", null],
      ["Paid from", "Cash drawer", null],
    ],
    "Entered twice by mistake.",
  ),
];

export async function listAuditEntries(): Promise<AuditEntry[]> {
  return entries;
}

interface LogInput {
  action: AuditAction;
  module: string;
  entity: string;
  label: string;
  before: Snapshot | null;
  after: Snapshot | null;
  note?: string;
}

/** Records an action by the signed-in person. Call it next to the change it describes. */
export function logAudit(input: LogInput): void {
  entries = [
    {
      id: `aud-${Date.now()}-${entries.length}`,
      at: new Date().toISOString(),
      actor: CURRENT_ACTOR,
      ip: CURRENT_IP,
      action: input.action,
      module: input.module,
      entity: input.entity,
      label: input.label,
      changes: changesBetween(input.before, input.after),
      note: input.note,
    },
    ...entries,
  ];
}

/** "5 Oct 2026, 4:12 pm" */
export function formatWhen(iso: string, withSeconds = false): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: true,
  });
}

/** Just the date part, as an ISO date (YYYY-MM-DD), for filtering. */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}
