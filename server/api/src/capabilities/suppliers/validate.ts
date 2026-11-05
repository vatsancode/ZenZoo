import { UserFacingError } from "../../shared/errors";
interface SupplierFields {
  name: string;
  phone?: string;
  email?: string;
  taxId?: string;
  mapUrl?: string;
}

// Same rules as the admin's vendor form (apps/admin/features/vendors/vendors.ts) - the form is
// only a convenience, so the server refuses the same things when called directly. Limits match
// the suppliers columns.
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

const PHONE_PATTERN = /^[0-9+()\- ]+$/;

const LIMITS = { name: 200, phone: 20, email: 255, taxId: 50, mapUrl: 500 } as const;

const LABELS = {
  name: "Vendor name",
  phone: "Phone",
  email: "Email",
  taxId: "GSTIN",
  mapUrl: "Map link",
} as const;

function mapUrlProblem(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "Paste the full link, starting with https://.";
  }
  const host = url.hostname.replace(/^www\./, "");
  const isGoogleMaps =
    host === "maps.app.goo.gl" ||
    (host === "goo.gl" && url.pathname.startsWith("/maps")) ||
    (/^(maps\.)?google\.[a-z.]+$/.test(host) &&
      (host.startsWith("maps.") || url.pathname.startsWith("/maps")));
  return url.protocol === "https:" && isGoogleMaps ? null : "Enter a Google Maps link.";
}

/** Throws a plain-words message for the first field that breaks a rule; blank optional fields pass. */
export function assertSupplierFields(input: SupplierFields): void {
  for (const field of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") throw new UserFacingError(`${LABELS[field]} must be text.`);
    if (value.trim().length > LIMITS[field]) {
      throw new UserFacingError(`${LABELS[field]} is too long (max ${LIMITS[field]} characters).`);
    }
  }

  const phone = input.phone?.trim();
  if (phone && !(PHONE_PATTERN.test(phone) && /\d/.test(phone))) {
    throw new UserFacingError("Use digits only (spaces, + - ( ) allowed).");
  }

  const email = input.email?.trim();
  if (email && !EMAIL_PATTERN.test(email))
    throw new UserFacingError("Enter a valid email address.");

  const mapUrl = input.mapUrl?.trim();
  if (mapUrl) {
    const problem = mapUrlProblem(mapUrl);
    if (problem) throw new UserFacingError(problem);
  }
}
