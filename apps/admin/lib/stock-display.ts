export function stockStatus(quantity: number): {
  tone: "success" | "warning" | "danger";
  label: string;
} {
  if (quantity === 0) return { tone: "danger", label: "Out of stock" };
  if (quantity <= 10) return { tone: "warning", label: "Low stock" };
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
