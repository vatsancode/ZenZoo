// Mirrors the column sizes on users (see prisma/schema.prisma) so a too-long
// value gets a plain message here instead of Prisma's raw P2000 text.
const MAX_EMAIL = 255;
const MAX_PHONE = 20;
const MAX_NAME_PART = 100;

/** Returns a message a person can act on, or null when everything fits. */
export function fieldLengthProblem(fields: {
  firstName: string;
  lastName: string | null;
  email: string;
  phone?: string;
}): string | null {
  if (fields.firstName.length > MAX_NAME_PART || (fields.lastName?.length ?? 0) > MAX_NAME_PART) {
    return `Each part of the name can be at most ${MAX_NAME_PART} characters.`;
  }
  if (fields.email.length > MAX_EMAIL) {
    return `The email can be at most ${MAX_EMAIL} characters.`;
  }
  if (fields.phone?.trim() && !/^\+?[\d ]+$/.test(fields.phone.trim())) {
    return "The phone number can only have numbers and spaces, with an optional + at the start.";
  }
  if ((fields.phone?.trim().length ?? 0) > MAX_PHONE) {
    return `The phone number can be at most ${MAX_PHONE} characters.`;
  }
  return null;
}
