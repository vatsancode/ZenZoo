import type { IconName } from "@zenzoo/ui-web";
import type { AccessLevel, PermissionArea } from "../features/settings/users";

/** The pages in the sidebar, in order. */
export interface NavItem {
  label: string;
  href: string;
  /** Shown alone when the sidebar is collapsed. */
  icon: IconName;
}

// The icons are stand-ins from the shared set until each page gets its own drawn icon.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "layout" },
  { label: "Vendors", href: "/vendors", icon: "bank" },
  { label: "Purchases", href: "/purchases", icon: "receipt" },
  { label: "Stocks", href: "/stocks", icon: "ruler" },
  { label: "Expenses", href: "/expenses", icon: "card" },
  { label: "Catalogue", href: "/catalogue", icon: "tag" },
  { label: "Point of Sale", href: "/point-of-sale", icon: "plus" },
  { label: "Sales", href: "/sales", icon: "history" },
  { label: "Customers", href: "/customers", icon: "user" },
  { label: "Employees", href: "/employees", icon: "users" },
  { label: "Slot management", href: "/slots", icon: "calendar" },
  { label: "Transactions", href: "/transactions", icon: "transfer" },
  { label: "Settings", href: "/settings", icon: "settings" },
  { label: "Style guide", href: "/style-guide", icon: "theme" },
];

interface PageRule {
  path: string;
  /** Matches only this exact path; otherwise it also covers everything beneath it. */
  exact?: boolean;
  /** Every one of these areas is needed (at `level`, or better). */
  all?: PermissionArea[];
  /** At least one of these areas is needed. */
  any?: PermissionArea[];
  /** The level needed in those areas; "view" when left out. */
  level?: AccessLevel;
  /** Match with this instead of the path prefix (for a page under an id, like /purchases/<id>/edit). */
  pattern?: RegExp;
}

/**
 * Which areas a page needs - the one place the admin decides who sees what. The first rule that
 * matches wins, so the more specific paths come first. A page no rule matches is open to anyone
 * signed in (their profile, the style guide). This only decides what to show: the API refuses
 * the same requests on its own, whatever a screen offers.
 */
const RULES: PageRule[] = [
  { path: "/", exact: true, all: ["dashboard"] },
  // Theme is the person's own choice, not a shop setting.
  { path: "/settings/theme" },
  { path: "/settings/users", all: ["users"] },
  // The page lists and totals expenses, so it needs Expenses as well as Settings.
  { path: "/settings/expense-categories", all: ["settings", "expenses"] },
  // Accounts and the money moving between them have their own area, not Settings.
  { path: "/settings/accounts", all: ["accounts"] },
  { path: "/settings/transfers", all: ["accounts"] },
  // The Settings home is for anyone with a card to open; each card checks its own page.
  { path: "/settings", exact: true, any: ["settings", "users", "accounts"] },
  { path: "/settings", all: ["settings"] },
  { path: "/vendors", all: ["vendors"] },
  // Writing a purchase takes more than looking at one.
  { path: "/purchases/new", exact: true, all: ["purchases"], level: "edit" },
  { path: "/purchases", pattern: /^\/purchases\/[^/]+\/edit$/, all: ["purchases"], level: "edit" },
  { path: "/purchases", all: ["purchases"] },
  { path: "/stocks", all: ["stocks"] },
  { path: "/expenses", all: ["expenses"] },
  { path: "/catalogue", all: ["catalogue"] },
  { path: "/point-of-sale", all: ["pos"] },
  { path: "/sales", all: ["sales"] },
  { path: "/customers", all: ["customers"] },
  { path: "/transactions", all: ["accounts"] },
];

export type CanFn = (area: PermissionArea, level: AccessLevel) => boolean;

function matches(rule: PageRule, pathname: string): boolean {
  if (rule.pattern) return rule.pattern.test(pathname);
  if (rule.exact) return pathname === rule.path;
  return pathname === rule.path || pathname.startsWith(`${rule.path}/`);
}

/** Whether the role may open `pathname`. */
export function pageAllowed(pathname: string, can: CanFn): boolean {
  const rule = RULES.find((item) => matches(item, pathname));
  if (!rule) return true;
  const level = rule.level ?? "view";
  if (rule.all && !rule.all.every((area) => can(area, level))) return false;
  if (rule.any && !rule.any.some((area) => can(area, level))) return false;
  return true;
}

/** The first sidebar page the role may open - where to send someone who landed on one they can't. */
export function firstAllowedPage(can: CanFn): NavItem | null {
  return (
    NAV_ITEMS.find((item) => item.href !== "/style-guide" && pageAllowed(item.href, can)) ?? null
  );
}
