import { logAudit } from "../../lib/audit";

// Sample data standing in for a real capability: there is no users, roles or auth read
// capability on the backend yet. Replace with real calls once they exist.

export const ACCESS_LEVELS = ["none", "view", "edit", "delete"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  none: "No access",
  view: "Can view",
  edit: "Can view and change",
  delete: "Can view, change and delete",
};

/** The areas of the app a role can be given access to. */
export const PERMISSION_AREAS = [
  { id: "dashboard", label: "Dashboard", note: "Sales, profit and the numbers that matter." },
  { id: "stocks", label: "Stocks", note: "Products, variants, batches and stock movements." },
  { id: "catalogue", label: "Catalogue", note: "Services and other items that aren't stock." },
  { id: "vendors", label: "Vendors", note: "Who you buy from." },
  { id: "purchases", label: "Purchases", note: "Buying, receiving, paying and returning." },
  { id: "expenses", label: "Expenses", note: "Running costs like rent and salaries." },
  { id: "pos", label: "Point of Sale", note: "Making a sale at the till." },
  { id: "sales", label: "Sales", note: "Past sales and customer returns." },
  { id: "customers", label: "Customers", note: "Customers, store credit and dues." },
  {
    id: "settings",
    label: "Settings",
    note: "Categories, accounts, payment methods and the audit log.",
  },
  { id: "users", label: "Users and roles", note: "Who can sign in and what they can do." },
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number]["id"];
export type Permissions = Record<PermissionArea, AccessLevel>;

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permissions;
  /** The Owner role can't be changed or removed, so there is always someone who can do everything. */
  locked?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  roleId: string;
  status: "active" | "disabled";
  /** ISO date-time of the last sign-in. */
  lastSignIn?: string;
}

const all = (level: AccessLevel): Permissions =>
  Object.fromEntries(PERMISSION_AREAS.map((area) => [area.id, level])) as Permissions;

const withLevels = (base: AccessLevel, overrides: Partial<Permissions>): Permissions => ({
  ...all(base),
  ...overrides,
});

let roles: Role[] = [
  {
    id: "owner",
    name: "Owner",
    description: "Everything, including users and settings.",
    permissions: all("delete"),
    locked: true,
  },
  {
    id: "manager",
    name: "Manager",
    description: "Runs the shop day to day. Can't manage users.",
    permissions: withLevels("edit", { users: "none", settings: "view" }),
  },
  {
    id: "cashier",
    name: "Cashier",
    description: "Works the till and looks up customers.",
    permissions: withLevels("none", {
      pos: "edit",
      sales: "view",
      customers: "edit",
      stocks: "view",
      catalogue: "view",
    }),
  },
  {
    id: "accountant",
    name: "Accountant",
    description: "Sees the money side. Changes nothing in stock or sales.",
    permissions: withLevels("view", {
      expenses: "edit",
      pos: "none",
      settings: "none",
      users: "none",
    }),
  },
];

let users: User[] = [
  {
    id: "usr-1",
    name: "Vatsan S",
    email: "vatsan.designs@gmail.com",
    phone: "98400 11223",
    roleId: "owner",
    status: "active",
    lastSignIn: "2026-10-05T09:12:00.000Z",
  },
  {
    id: "usr-2",
    name: "Meena Krishnan",
    email: "meena@zenzoo.example",
    phone: "98410 55661",
    roleId: "manager",
    status: "active",
    lastSignIn: "2026-10-04T16:40:00.000Z",
  },
  {
    id: "usr-3",
    name: "Arun Kumar",
    email: "arun@zenzoo.example",
    roleId: "cashier",
    status: "active",
    lastSignIn: "2026-10-05T08:55:00.000Z",
  },
  {
    id: "usr-4",
    name: "Lakshmi Iyer",
    email: "lakshmi@zenzoo.example",
    roleId: "accountant",
    status: "disabled",
    lastSignIn: "2026-09-12T11:05:00.000Z",
  },
];

/** Who is signed in. In this stand-in it is always the owner; replace with the real session. */
export const CURRENT_USER_ID = "usr-1";

export const listRoles = (): Role[] => roles;
export const listUsers = (): User[] => users;
export const getUser = (id: string): User | undefined => users.find((user) => user.id === id);
export const getRole = (id: string): Role | undefined => roles.find((role) => role.id === id);

export function roleSummary(role: Role): string {
  const levels = Object.values(role.permissions);
  const canChange = levels.filter((level) => level === "edit" || level === "delete").length;
  const viewOnly = levels.filter((level) => level === "view").length;
  if (levels.every((level) => level === "delete")) return "Full access";
  return `${canChange} can change · ${viewOnly} view only`;
}

const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export interface UserInput {
  name: string;
  email: string;
  phone?: string;
  roleId: string;
}

function checkUser(input: UserInput, ignoreId?: string): string | null {
  if (input.name.trim() === "") return "Enter the person's name.";
  if (!emailOk(input.email)) return "Enter a valid email address.";
  if (
    users.some(
      (user) =>
        user.id !== ignoreId && user.email.toLowerCase() === input.email.trim().toLowerCase(),
    )
  ) {
    return "Someone with that email already exists.";
  }
  if (!getRole(input.roleId)) return "Choose a role.";
  return null;
}

export function addUser(input: UserInput): string | null {
  const problem = checkUser(input);
  if (problem) return problem;
  const user: User = {
    id: `usr-${Date.now()}`,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim() || undefined,
    roleId: input.roleId,
    status: "active",
  };
  users = [...users, user];
  logAudit({
    action: "created",
    module: "Users",
    entity: "User",
    label: user.name,
    before: null,
    after: { Name: user.name, Email: user.email, Role: getRole(user.roleId)?.name ?? "" },
  });
  return null;
}

export function editUser(id: string, input: UserInput): string | null {
  const previous = getUser(id);
  if (!previous) return "That user no longer exists.";
  const problem = checkUser(input, id);
  if (problem) return problem;
  if (previous.roleId === "owner" && input.roleId !== "owner" && owners().length <= 1) {
    return "There has to be at least one owner.";
  }
  const next: User = {
    ...previous,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim() || undefined,
    roleId: input.roleId,
  };
  users = users.map((user) => (user.id === id ? next : user));
  logAudit({
    action: "updated",
    module: "Users",
    entity: "User",
    label: next.name,
    before: {
      Name: previous.name,
      Email: previous.email,
      Phone: previous.phone ?? null,
      Role: getRole(previous.roleId)?.name ?? "",
    },
    after: {
      Name: next.name,
      Email: next.email,
      Phone: next.phone ?? null,
      Role: getRole(next.roleId)?.name ?? "",
    },
  });
  return null;
}

const owners = () => users.filter((user) => user.roleId === "owner" && user.status === "active");

/** Turns a user off or back on. A disabled user can't sign in; their history stays. */
export function setUserDisabled(id: string, disabled: boolean): string | null {
  const previous = getUser(id);
  if (!previous) return "That user no longer exists.";
  if (disabled && id === CURRENT_USER_ID) return "You can't turn off your own access.";
  if (disabled && previous.roleId === "owner" && owners().length <= 1) {
    return "There has to be at least one active owner.";
  }
  users = users.map((user) =>
    user.id === id ? { ...user, status: disabled ? "disabled" : "active" } : user,
  );
  logAudit({
    action: "updated",
    module: "Users",
    entity: "User",
    label: previous.name,
    before: { Status: previous.status === "active" ? "Active" : "Disabled" },
    after: { Status: disabled ? "Disabled" : "Active" },
  });
  return null;
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: Permissions;
}

function checkRole(input: RoleInput, ignoreId?: string): string | null {
  if (input.name.trim() === "") return "Give the role a name.";
  if (
    roles.some(
      (role) => role.id !== ignoreId && role.name.toLowerCase() === input.name.trim().toLowerCase(),
    )
  ) {
    return "There is already a role with that name.";
  }
  return null;
}

const describePermissions = (permissions: Permissions) =>
  Object.fromEntries(
    PERMISSION_AREAS.map((area) => [area.label, ACCESS_LABEL[permissions[area.id]]]),
  );

export function addRole(input: RoleInput): string | null {
  const problem = checkRole(input);
  if (problem) return problem;
  const role: Role = {
    id: `role-${Date.now()}`,
    name: input.name.trim(),
    description: input.description.trim(),
    permissions: input.permissions,
  };
  roles = [...roles, role];
  logAudit({
    action: "created",
    module: "Users",
    entity: "Role",
    label: role.name,
    before: null,
    after: describePermissions(role.permissions),
  });
  return null;
}

export function editRole(id: string, input: RoleInput): string | null {
  const previous = getRole(id);
  if (!previous) return "That role no longer exists.";
  if (previous.locked) return "The Owner role can't be changed.";
  const problem = checkRole(input, id);
  if (problem) return problem;
  const next: Role = {
    ...previous,
    name: input.name.trim(),
    description: input.description.trim(),
    permissions: input.permissions,
  };
  roles = roles.map((role) => (role.id === id ? next : role));
  logAudit({
    action: "updated",
    module: "Users",
    entity: "Role",
    label: next.name,
    before: { Name: previous.name, ...describePermissions(previous.permissions) },
    after: { Name: next.name, ...describePermissions(next.permissions) },
  });
  return null;
}

export function removeRole(id: string): string | null {
  const previous = getRole(id);
  if (!previous) return null;
  if (previous.locked) return "The Owner role can't be removed.";
  const holders = users.filter((user) => user.roleId === id).length;
  if (holders > 0) {
    return `${holders} ${holders === 1 ? "person has" : "people have"} this role. Give them another role first.`;
  }
  roles = roles.filter((role) => role.id !== id);
  logAudit({
    action: "deleted",
    module: "Users",
    entity: "Role",
    label: previous.name,
    before: { Name: previous.name },
    after: null,
  });
  return null;
}

// ------------------------------------------------------------------ profile

export interface ProfileInput {
  name: string;
  email: string;
  phone?: string;
}

/** The signed-in person changes their own details. Their role is not theirs to change. */
export function updateProfile(input: ProfileInput): string | null {
  const me = getUser(CURRENT_USER_ID);
  if (!me) return "Your profile couldn't be found.";
  return editUser(CURRENT_USER_ID, { ...input, roleId: me.roleId });
}

export const MIN_PASSWORD_LENGTH = 8;

/** What is wrong with a new password, or null when it is fine. */
export function passwordProblem(current: string, next: string, confirm: string): string | null {
  if (current === "") return "Enter your current password.";
  if (next.length < MIN_PASSWORD_LENGTH) {
    return `The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(next) || !/\d/.test(next)) {
    return "Use letters and at least one number in the new password.";
  }
  if (next === current) return "The new password must be different from the current one.";
  if (next !== confirm) return "The two new passwords don't match.";
  return null;
}

/**
 * Not wired to a real capability: the backend has no password-change route yet, so this only
 * checks the form and records that it happened. The password itself is never stored or logged.
 */
export function changePassword(current: string, next: string, confirm: string): string | null {
  const problem = passwordProblem(current, next, confirm);
  if (problem) return problem;
  logAudit({
    action: "updated",
    module: "Users",
    entity: "Password",
    label: getUser(CURRENT_USER_ID)?.name ?? "You",
    before: null,
    after: null,
    note: "Password changed.",
  });
  return null;
}
