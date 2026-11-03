// Mock data layer for Employees: the screens are built first, the API comes with the workflow.
// Everything the components call is in this file and shaped like features/vendors/vendors.ts
// (an Employee back, or an error message), so wiring the real API changes only this file.

export type Gender = "male" | "female" | "others";
export type EmployeeStatus = "active" | "inactive" | "left";

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  others: "Others",
};

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  left: "Left",
};

/** The Badge tone each status is shown in, on the list and on the employee's own page. */
export const STATUS_TONES: Record<EmployeeStatus, "success" | "neutral" | "warning"> = {
  active: "success",
  inactive: "neutral",
  left: "warning",
};

export interface Employee {
  id: string;
  /** Assigned on creation (EMP-001, EMP-002, ...); never typed in. */
  code: string;
  name: string;
  age: number;
  gender: Gender;
  mobile: string;
  addressLine1: string;
  city: string;
  state: string;
  jobRole: string;
  idType: string;
  idNumber: string;
  /** ISO date, YYYY-MM-DD. */
  joinedOn: string;
  status: EmployeeStatus;
  /** A picture chosen in this tab. Not saved anywhere yet, so it is gone after a reload. */
  photoUrl?: string;
}

/** What the sheet submits: text exactly as typed. */
export interface EmployeeInput {
  name: string;
  age: string;
  gender: Gender | "";
  mobile: string;
  addressLine1: string;
  city: string;
  state: string;
  jobRole: string;
  idType: string;
  idNumber: string;
  joinedOn: string;
  status: EmployeeStatus;
  photoUrl: string;
}

const EMPLOYEES_KEY = "zenzoo.mock.employees.v2";
const JOB_ROLES_KEY = "zenzoo.mock.employee-job-roles";
const ID_TYPES_KEY = "zenzoo.mock.employee-id-types";

const SEED_JOB_ROLES = ["Stylist", "Barber", "Receptionist", "Manager"];
const SEED_ID_TYPES = ["Aadhaar", "PAN", "Driving licence", "Voter ID"];

const SEED_EMPLOYEES: Employee[] = [
  {
    id: "seed-1",
    code: "EMP-001",
    name: "Asha Raman",
    age: 29,
    gender: "female",
    mobile: "9841012345",
    addressLine1: "12, Lake View Road",
    city: "Chennai",
    state: "Tamil Nadu",
    jobRole: "Stylist",
    idType: "Aadhaar",
    idNumber: "4821 7733 9012",
    joinedOn: "2025-02-10",
    status: "active",
  },
  {
    id: "seed-2",
    code: "EMP-002",
    name: "Karthik Subbu",
    age: 34,
    gender: "male",
    mobile: "9790023456",
    addressLine1: "45, Gandhi Street",
    city: "Coimbatore",
    state: "Tamil Nadu",
    jobRole: "Barber",
    idType: "PAN",
    idNumber: "BQKPS1234L",
    joinedOn: "2024-08-01",
    status: "active",
  },
  {
    id: "seed-3",
    code: "EMP-003",
    name: "Meera Nair",
    age: 26,
    gender: "female",
    mobile: "9447034567",
    addressLine1: "7, Palm Grove",
    city: "Kochi",
    state: "Kerala",
    jobRole: "Receptionist",
    idType: "Voter ID",
    idNumber: "TN/12/045/678901",
    joinedOn: "2025-06-15",
    status: "inactive",
  },
  {
    id: "seed-4",
    code: "EMP-004",
    name: "Ravi Chandran",
    age: 31,
    gender: "male",
    mobile: "9962045678",
    addressLine1: "3, Temple Street",
    city: "Madurai",
    state: "Tamil Nadu",
    jobRole: "Barber",
    idType: "Aadhaar",
    idNumber: "5120 8841 3307",
    joinedOn: "2025-09-01",
    status: "active",
  },
  {
    id: "seed-5",
    code: "EMP-005",
    name: "Lakshmi Iyer",
    age: 27,
    gender: "female",
    mobile: "9884056789",
    addressLine1: "21, Anna Nagar",
    city: "Chennai",
    state: "Tamil Nadu",
    jobRole: "Stylist",
    idType: "PAN",
    idNumber: "CDMPI4455K",
    joinedOn: "2025-11-20",
    status: "active",
  },
  {
    id: "seed-6",
    code: "EMP-006",
    name: "Imran Sheikh",
    age: 30,
    gender: "male",
    mobile: "9003067890",
    addressLine1: "88, Market Road",
    city: "Salem",
    state: "Tamil Nadu",
    jobRole: "Stylist",
    idType: "Driving licence",
    idNumber: "TN38 20210045671",
    joinedOn: "2026-03-05",
    status: "active",
  },
];

// The pictures chosen in this tab, by employee id - kept out of storage on purpose.
const photos = new Map<string, string>();

function load<T>(key: string, seed: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // Storage blocked or unreadable: start from the seed.
  }
  return seed;
}

function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the change lasts until the page reloads.
  }
}

// Used when storage can't hold the list, so adding still works within one visit.
let fallback: Employee[] | null = null;

function readAll(): Employee[] {
  const rows = fallback ?? load(EMPLOYEES_KEY, SEED_EMPLOYEES);
  return rows.map((row) => ({ ...row, photoUrl: photos.get(row.id) }));
}

function writeAll(rows: Employee[]) {
  const plain = rows.map(({ photoUrl: _photoUrl, ...rest }) => rest);
  fallback = plain;
  save(EMPLOYEES_KEY, plain);
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 150));

export async function listEmployees(): Promise<Employee[]> {
  await pause();
  return readAll().sort((a, b) => b.code.localeCompare(a.code));
}

export async function listJobRoles(): Promise<string[]> {
  return load(JOB_ROLES_KEY, SEED_JOB_ROLES);
}

export async function listIdTypes(): Promise<string[]> {
  return load(ID_TYPES_KEY, SEED_ID_TYPES);
}

async function addToList(key: string, seed: string[], name: string, what: string) {
  const list = load(key, seed);
  const taken = list.some((item) => item.toLowerCase() === name.trim().toLowerCase());
  if (taken) return `${what} "${name.trim()}" already exists.`;
  save(key, [...list, name.trim()]);
  return null;
}

/** Adds a job role to the list. Resolves to an error message, or null once saved. */
export function addJobRole(name: string): Promise<string | null> {
  return addToList(JOB_ROLES_KEY, SEED_JOB_ROLES, name, "The role");
}

/** Adds an ID proof type to the list. Resolves to an error message, or null once saved. */
export function addIdType(name: string): Promise<string | null> {
  return addToList(ID_TYPES_KEY, SEED_ID_TYPES, name, "The ID type");
}

function nextCode(rows: Employee[]): string {
  const highest = rows.reduce((max, row) => Math.max(max, Number(row.code.slice(4)) || 0), 0);
  return `EMP-${String(highest + 1).padStart(3, "0")}`;
}

function sameId(a: Employee, idType: string, idNumber: string): boolean {
  return (
    a.idType.toLowerCase() === idType.trim().toLowerCase() &&
    a.idNumber.replace(/\s/g, "").toLowerCase() === idNumber.replace(/\s/g, "").toLowerCase()
  );
}

function fromInput(input: EmployeeInput, base: Pick<Employee, "id" | "code">): Employee {
  return {
    ...base,
    name: input.name.trim(),
    age: Number(input.age),
    gender: input.gender as Gender,
    mobile: input.mobile.trim(),
    addressLine1: input.addressLine1.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    jobRole: input.jobRole,
    idType: input.idType,
    idNumber: input.idNumber.trim(),
    joinedOn: input.joinedOn,
    status: input.status,
  };
}

function problemWith(input: EmployeeInput, others: Employee[]): string | null {
  const clash = others.find((row) => sameId(row, input.idType, input.idNumber));
  return clash ? `${clash.name} (${clash.code}) already has this ID.` : null;
}

function keepPhoto(id: string, photoUrl: string) {
  if (photoUrl) photos.set(id, photoUrl);
  else photos.delete(id);
}

/** Creates an employee. Returns the new employee, or an error message. */
export async function addEmployee(input: EmployeeInput): Promise<Employee | string> {
  await pause();
  const rows = readAll();
  const problem = problemWith(input, rows);
  if (problem) return problem;
  const created = fromInput(input, { id: crypto.randomUUID(), code: nextCode(rows) });
  keepPhoto(created.id, input.photoUrl);
  writeAll([created, ...rows]);
  return { ...created, photoUrl: input.photoUrl || undefined };
}

/** Edits an employee. Returns the updated employee, or an error message. */
export async function editEmployee(id: string, input: EmployeeInput): Promise<Employee | string> {
  await pause();
  const rows = readAll();
  const current = rows.find((row) => row.id === id);
  if (!current) return "That employee no longer exists.";
  const problem = problemWith(
    input,
    rows.filter((row) => row.id !== id),
  );
  if (problem) return problem;
  const updated = fromInput(input, { id, code: current.code });
  keepPhoto(id, input.photoUrl);
  writeAll(rows.map((row) => (row.id === id ? updated : row)));
  return { ...updated, photoUrl: input.photoUrl || undefined };
}

export function nameProblem(value: string): string | null {
  return value.trim() === "" ? "Enter the employee's name." : null;
}

export function ageProblem(value: string): string | null {
  const text = value.trim();
  if (!text) return "Enter the age.";
  if (!/^\d{1,3}$/.test(text)) return "Age must be a whole number.";
  const age = Number(text);
  return age >= 14 && age <= 100 ? null : "Age must be between 14 and 100.";
}

/** Ten to fifteen digits, with an optional + and spaces or dashes between them. */
export function mobileProblem(value: string): string | null {
  const text = value.trim();
  if (!text) return "Enter the mobile number.";
  if (!/^\+?[0-9 -]+$/.test(text)) return "Use digits only (spaces, - and a leading + allowed).";
  const digits = text.replace(/\D/g, "").length;
  return digits >= 10 && digits <= 15 ? null : "Enter a valid mobile number (10 to 15 digits).";
}

export function requiredProblem(value: string, message: string): string | null {
  return value.trim() === "" ? message : null;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** One of the employee's own pages. Null when there is no such employee. */
export async function getEmployee(id: string): Promise<Employee | null> {
  await pause();
  return readAll().find((row) => row.id === id) ?? null;
}

/**
 * Salary paid to an employee. The account, method and category are kept as the names they had when
 * paid, so the history reads the same if one is renamed later.
 */
export interface SalaryPayment {
  id: string;
  employeeId: string;
  /** ISO date, YYYY-MM-DD. */
  paidOn: string;
  amount: number;
  /** The bank or cash account the money left. */
  account: string;
  /** How it was paid: cash, UPI, bank transfer... */
  method: string;
  /** The expense category it is filed under. */
  category: string;
  note?: string;
}

/** What the payment sheet submits. */
export interface SalaryPaymentInput {
  paidOn: string;
  amount: number;
  account: string;
  method: string;
  category: string;
  note: string;
}

const SALARY_KEY = "zenzoo.mock.employee-salary-payments";

const SEED_PAYMENTS: SalaryPayment[] = [
  {
    id: "pay-1",
    employeeId: "seed-1",
    paidOn: "2026-10-01",
    amount: 22000,
    account: "HDFC Current",
    method: "Bank transfer",
    category: "Salaries",
  },
  {
    id: "pay-2",
    employeeId: "seed-1",
    paidOn: "2026-09-01",
    amount: 22000,
    account: "HDFC Current",
    method: "Bank transfer",
    category: "Salaries",
    note: "September salary",
  },
  {
    id: "pay-3",
    employeeId: "seed-2",
    paidOn: "2026-10-02",
    amount: 18000,
    account: "Cash drawer",
    method: "Cash",
    category: "Salaries",
  },
];

/** The employee's salary payments, newest first. */
export async function listSalaryPayments(employeeId: string): Promise<SalaryPayment[]> {
  await pause();
  return load(SALARY_KEY, SEED_PAYMENTS)
    .filter((row) => row.employeeId === employeeId)
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn));
}

/** Records a salary payment. Returns it, or an error message. */
export async function addSalaryPayment(
  employeeId: string,
  input: SalaryPaymentInput,
): Promise<SalaryPayment | string> {
  await pause();
  const created: SalaryPayment = {
    id: crypto.randomUUID(),
    employeeId,
    paidOn: input.paidOn,
    amount: input.amount,
    account: input.account,
    method: input.method,
    category: input.category,
    note: input.note.trim() || undefined,
  };
  save(SALARY_KEY, [created, ...load(SALARY_KEY, SEED_PAYMENTS)]);
  return created;
}

/** What has been paid to an employee this month and this year, and the latest payment. */
export function salarySummary(payments: SalaryPayment[], now = new Date()) {
  const year = String(now.getFullYear());
  const month = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const sum = (rows: SalaryPayment[]) => rows.reduce((total, row) => total + row.amount, 0);
  return {
    thisMonth: sum(payments.filter((row) => row.paidOn.startsWith(month))),
    thisYear: sum(payments.filter((row) => row.paidOn.startsWith(year))),
    total: sum(payments),
    // The list is newest first, so the latest is the head.
    latest: payments[0] ?? null,
  };
}
