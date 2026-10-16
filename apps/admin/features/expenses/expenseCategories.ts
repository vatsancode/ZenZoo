import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { logAudit } from "../../lib/audit";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** A heading expenses are filed under. "Other" is the catch-all and always stays. */
export interface ExpenseCategory {
  id: string;
  name: string;
  isCatchAll: boolean;
  /** Items filed under it, the bills they sit on, and what has been billed. */
  items: number;
  bills: number;
  spent: number;
}

interface ExpenseCategoryResponse extends Omit<ExpenseCategory, "spent"> {
  spent: string;
}

const toCategory = (response: ExpenseCategoryResponse): ExpenseCategory => ({
  ...response,
  spent: Number(response.spent),
});

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

const audit = (
  action: "created" | "updated" | "deleted",
  name: string,
  before: Record<string, string> | null,
  after: Record<string, string> | null,
) =>
  logAudit({
    action,
    module: "Settings",
    entity: "Expense category",
    label: name,
    before,
    after,
  });

/** Lists this tenant's expense categories, "Other" last - requires at least "expenses:view". */
export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const response = await fetch(`${API_URL}/expense-categories`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  return ((await response.json()) as ExpenseCategoryResponse[]).map(toCategory);
}

/** Adds a category; returns the new one, or an error message - requires "expenses:edit". */
export async function addExpenseCategory(name: string): Promise<ExpenseCategory | string> {
  const response = await fetch(`${API_URL}/expense-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const created = toCategory((await response.json()) as ExpenseCategoryResponse);
  audit("created", created.name, null, { Name: created.name });
  return created;
}

/** Renames a category; bills follow it because they point at it by id. Returns an error message, or null. */
export async function renameExpenseCategory(
  category: ExpenseCategory,
  to: string,
): Promise<string | null> {
  const response = await fetch(`${API_URL}/expense-categories/${category.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: to }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const renamed = toCategory((await response.json()) as ExpenseCategoryResponse);
  audit("updated", renamed.name, { Name: category.name }, { Name: renamed.name });
  return null;
}

/** Deletes an unused category; returns an error message, or null - requires "expenses:delete". */
export async function deleteExpenseCategory(category: ExpenseCategory): Promise<string | null> {
  const response = await fetch(`${API_URL}/expense-categories/${category.id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  audit("deleted", category.name, { Name: category.name }, null);
  return null;
}

/**
 * Looks up the id of every category name an expense uses, creating the ones typed in on the
 * fly ("Add new category" in the expense form). Returns name (lower-cased) to id, or an error
 * message.
 */
export async function resolveExpenseCategories(
  names: string[],
): Promise<Map<string, string> | string> {
  const ids = new Map((await listExpenseCategories()).map((item) => [item.name.toLowerCase(), item.id]));
  for (const name of new Set(names.map((item) => item.trim()).filter(Boolean))) {
    if (ids.has(name.toLowerCase())) continue;
    const created = await addExpenseCategory(name);
    if (typeof created === "string") return created;
    ids.set(created.name.toLowerCase(), created.id);
  }
  return ids;
}
