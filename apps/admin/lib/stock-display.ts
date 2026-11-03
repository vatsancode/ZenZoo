export function stockStatus(quantity: number): {
  tone: "success" | "danger";
  label: string;
} {
  if (quantity === 0) return { tone: "danger", label: "Out of stock" };
  return { tone: "success", label: "In stock" };
}

export function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** An ISO date (YYYY-MM-DD) as "4 Oct 2026". */
export function formatDate(iso: string): string {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A timestamp's calendar day (YYYY-MM-DD) where the viewer is, not in UTC. */
export function localDay(timestamp: string): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
