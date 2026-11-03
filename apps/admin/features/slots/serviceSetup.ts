// Mock store for how long each service takes and who does it, at what price and time. Keyed by the
// catalogue item's id, so it sits on top of the real catalogue. Shaped so the real API can replace
// this file without the screens changing.

/** How long a service takes when nobody has said. */
export const DEFAULT_MINUTES = 30;

/** One employee a service is customised for. */
export interface ProviderTerms {
  employeeId: string;
  /** What this employee charges; none when `customPrice` is on. */
  price?: number;
  /** The price is agreed at the till for this employee. */
  customPrice?: boolean;
  /** How long this employee takes; the default time when empty. */
  minutes?: number;
}

export interface ServiceSetup {
  /**
   * Off: everyone does it at the service's own price and time. On: only the employees listed in
   * `providers`, each at their own price and time. Setups saved before this existed have no value,
   * and count as on when they list providers.
   */
  customised?: boolean;
  /** How long it takes when not customised; empty means the default. */
  minutes?: number;
  providers: ProviderTerms[];
}

const KEY = "zenzoo.mock.service-setups";

function readAll(): Record<string, ServiceSetup> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, ServiceSetup>;
  } catch {
    // Storage blocked or unreadable: nothing is set up.
  }
  return {};
}

let fallback: Record<string, ServiceSetup> | null = null;

export async function listServiceSetups(): Promise<Record<string, ServiceSetup>> {
  return fallback ?? readAll();
}

export async function getServiceSetup(serviceId: string): Promise<ServiceSetup | null> {
  return (await listServiceSetups())[serviceId] ?? null;
}

export async function saveServiceSetup(serviceId: string, setup: ServiceSetup): Promise<void> {
  const next = { ...(await listServiceSetups()), [serviceId]: setup };
  fallback = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change lasts until the page reloads.
  }
}

export const isCustomised = (setup: ServiceSetup) => setup.customised ?? setup.providers.length > 0;

/** What one employee charges and how long they take for a service; null when they don't do it. */
export function termsFor(
  setup: ServiceSetup,
  employeeId: string,
  basePrice: number | undefined,
): { price: number | undefined; minutes: number } | null {
  if (!isCustomised(setup)) {
    return { price: basePrice, minutes: setup.minutes ?? DEFAULT_MINUTES };
  }
  const row = setup.providers.find((item) => item.employeeId === employeeId);
  if (!row) return null;
  return {
    price: row.customPrice ? undefined : (row.price ?? basePrice),
    minutes: row.minutes ?? DEFAULT_MINUTES,
  };
}

/** The catalogue form's view of a setup: every field as the text typed, one row per employee. */
export interface SetupForm {
  customised: boolean;
  /** The service's own time, used while not customised. Optional. */
  minutes: string;
  rows: Record<string, { on: boolean; price: string; custom: boolean; minutes: string }>;
}

export const EMPTY_SETUP_FORM: SetupForm = { customised: false, minutes: "", rows: {} };

export function formFromSetup(setup: ServiceSetup | null): SetupForm {
  if (!setup) return EMPTY_SETUP_FORM;
  return {
    customised: isCustomised(setup),
    minutes: setup.minutes === undefined ? "" : String(setup.minutes),
    rows: Object.fromEntries(
      setup.providers.map((row) => [
        row.employeeId,
        {
          on: true,
          price: row.price === undefined ? "" : String(row.price),
          custom: row.customPrice ?? false,
          minutes: row.minutes === undefined ? "" : String(row.minutes),
        },
      ]),
    ),
  };
}

export function setupFromForm(form: SetupForm): ServiceSetup {
  if (!form.customised) {
    return {
      customised: false,
      minutes: form.minutes.trim() === "" ? undefined : Number(form.minutes),
      providers: [],
    };
  }
  return {
    customised: true,
    providers: Object.entries(form.rows)
      .filter(([, row]) => row.on)
      .map(([employeeId, row]) => ({
        employeeId,
        price: row.custom ? undefined : Number(row.price),
        customPrice: row.custom,
        minutes: row.minutes.trim() === "" ? undefined : Number(row.minutes),
      })),
  };
}

const validMinutes = (text: string) =>
  /^\d{1,3}$/.test(text.trim()) && Number(text) >= 5 && Number(text) <= 720;
const optionalMinutes = (text: string) => text.trim() === "" || validMinutes(text);

/** Why the setup can't be saved, or null when it can. */
export function setupProblem(form: SetupForm): string | null {
  if (!form.customised) {
    return optionalMinutes(form.minutes) ? null : "Time must be from 5 to 720 minutes.";
  }
  const added = Object.values(form.rows).filter((row) => row.on);
  if (added.length === 0) {
    return "Add at least one employee, or use one price and time for everyone.";
  }
  if (added.some((row) => !optionalMinutes(row.minutes))) {
    return "Times must be from 5 to 720 minutes.";
  }
  return added.some((row) => !row.custom && !(Number(row.price) > 0))
    ? "Enter a price for every employee, or turn on custom price."
    : null;
}

/**
 * The price and pricing the catalogue item itself is saved with. Customised, there is no single
 * price: the item shows its lowest, or is priced at the till when every employee's is.
 */
export function itemTerms(
  form: SetupForm,
  pricing: "fixed" | "custom",
  price: number,
): { pricing: "fixed" | "custom"; price: number } {
  if (!form.customised) return { pricing, price: pricing === "custom" ? 0 : price };
  const prices = Object.values(form.rows)
    .filter((row) => row.on && !row.custom)
    .map((row) => Number(row.price));
  return prices.length === 0
    ? { pricing: "custom", price: 0 }
    : { pricing: "fixed", price: Math.min(...prices) };
}
