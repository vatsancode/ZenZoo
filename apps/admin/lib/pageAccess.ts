import type { AccessLevel, PermissionArea } from "../features/settings/users";

/** The pages in the sidebar, in order. */
export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Vendors", href: "/vendors" },
  { label: "Purchases", href: "/purchases" },
  { label: "Stocks", href: "/stocks" },
  { label: "Expenses", href: "/expenses" },
  { label: "Catalogue", href: "/catalogue" },
  { label: "Point of Sale", href: "/point-of-sale" },
  { label: "Sales", href: "/sales" },
  { label: "Customers", href: "/customers" },
  { label: "Settings", href: "/settings" },
  { label: "Style guide", href: "/style-guide" },
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
  // The Settings home is for anyone with a card to open; each card checks its own page.
  { path: "/settings", exact: true, any: ["settings", "users"] },
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
