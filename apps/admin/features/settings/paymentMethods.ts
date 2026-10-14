import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { logAudit } from "../../lib/audit";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  status: "active" | "disabled";
}

interface PaymentMethodResponse {
  id: string;
  name: string;
  code: string;
  status: "active" | "disabled";
}

function toPaymentMethod(response: PaymentMethodResponse): PaymentMethod {
  return { id: response.id, name: response.name, code: response.code, status: response.status };
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/** Lists this tenant's payment methods from the real API - requires at least "settings:view". */
export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const response = await fetch(`${API_URL}/payment-methods`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as PaymentMethodResponse[];
  return data.map(toPaymentMethod);
}

/** Adds a payment method of the shop's own, like Cheque or a wallet - requires "settings:edit". */
export async function addPaymentMethod(name: string): Promise<PaymentMethod | string> {
  const response = await fetch(`${API_URL}/payment-methods`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const method = toPaymentMethod((await response.json()) as PaymentMethodResponse);
  logAudit({
    action: "created",
    module: "Settings",
    entity: "Payment method",
    label: method.name,
    before: null,
    after: { Status: "On" },
  });
  return method;
}

/** Switches a payment method on or off - requires "settings:edit". At least one stays on. */
export async function setPaymentMethodEnabled(id: string, enabled: boolean): Promise<string | null> {
  const response = await fetch(`${API_URL}/payment-methods/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ disabled: !enabled }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const method = toPaymentMethod((await response.json()) as PaymentMethodResponse);
  logAudit({
    action: "updated",
    module: "Settings",
    entity: "Payment method",
    label: method.name,
    before: { Status: enabled ? "Off" : "On" },
    after: { Status: enabled ? "On" : "Off" },
  });
  return null;
}

/** The active methods, shaped for a Select - value is the method's real id, not its code. */
export function methodOptions(methods: PaymentMethod[]): { value: string; label: string }[] {
  return methods
    .filter((method) => method.status === "active")
    .map((method) => ({ value: method.id, label: method.name }));
}
