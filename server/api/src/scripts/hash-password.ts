import { hashPassword } from "../shared/password";

// Prints a bcrypt hash for a password, for creating or rotating a
// platform_admins row by hand (that table has no INSERT/UPDATE grant for
// app_role - see its migration - so this is the only supported path).
// Usage: pnpm exec tsx src/scripts/hash-password.ts '<password>'

const plain = process.argv[2];
if (!plain) {
  console.error("Usage: tsx src/scripts/hash-password.ts '<password>'");
  process.exit(1);
}

hashPassword(plain).then((hash) => {
  console.log(hash);
});
