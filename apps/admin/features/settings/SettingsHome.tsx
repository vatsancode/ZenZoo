"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Icon, textStyle, useThemePreference, type IconName } from "@zenzoo/ui-web";
import Link from "next/link";
import { useEffect, useState } from "react";
import { accountMovements, balanceOf, listAccounts } from "./accounts";
import { listCategories, listUnits } from "../../lib/catalogue";
import { listAuditEntries } from "../../lib/audit";
import { listPaymentMethods } from "../../lib/payment-options";
import { listRoles } from "./roles";
import { listUsers } from "./userDirectory";
import { listExpenseCategories } from "../expenses/expenses";
import { formatPrice } from "../../lib/stock-display";

interface Tile {
  href: string;
  icon: IconName;
  name: string;
  description: string;
  /** A live line of detail, such as how many there are. */
  detail: string;
}

/** The settings home: one icon tile per area, each opening its own page. */
export default function SettingsHome() {
  const { colors, radius, spacing, elevation } = useTheme();
  const { preference } = useThemePreference();
  const [hovered, setHovered] = useState<string | null>(null);
  const [auditCount, setAuditCount] = useState(0);
  const [counts, setCounts] = useState({
    categories: 0,
    subcategories: 0,
    units: 0,
    accounts: 0,
    total: 0,
    users: 0,
    roles: 0,
  });

  useEffect(() => {
    async function load() {
      const [categories, units, accounts, movements, users, roles] = await Promise.all([
        listCategories(),
        listUnits(),
        listAccounts(),
        accountMovements(),
        listUsers(),
        listRoles(),
      ]);
      setCounts({
        categories: categories.length,
        subcategories: categories.reduce((sum, category) => sum + category.subcategories.length, 0),
        units: units.length,
        accounts: accounts.length,
        total: accounts.reduce((sum, account) => sum + balanceOf(account, movements), 0),
        users: users.length,
        roles: roles.length,
      });
    }
    void load();
    listAuditEntries().then((list) => setAuditCount(list.length));
  }, []);

  const tiles: Tile[] = [
    {
      href: "/settings/categories",
      icon: "tag",
      name: "Categories",
      description: "Group your products into categories and subcategories.",
      detail: `${counts.categories} categories · ${counts.subcategories} subcategories`,
    },
    {
      href: "/settings/expense-categories",
      icon: "receipt",
      name: "Expense categories",
      description: "The headings your expenses are filed under, like Rent and Salaries.",
      detail: `${listExpenseCategories().length} categories`,
    },
    {
      href: "/settings/units",
      icon: "ruler",
      name: "Units",
      description: "How quantities are counted: pieces, kilograms, litres and your own.",
      detail: `${counts.units} units`,
    },
    {
      href: "/settings/theme",
      icon: "theme",
      name: "Theme",
      description: "Choose a light or dark look, or follow this device.",
      detail:
        preference === "system" ? "Follows this device" : preference === "dark" ? "Dark" : "Light",
    },
    {
      href: "/settings/accounts",
      icon: "bank",
      name: "Accounts",
      description: "The cash drawer and bank accounts that money is received into and paid from.",
      detail: `${counts.accounts} accounts`,
    },
    {
      href: "/settings/transfers",
      icon: "transfer",
      name: "Transfer",
      description: "See what is in each account and move money between them.",
      detail: `${formatPrice(counts.total)} across all accounts`,
    },
    {
      href: "/settings/audit-log",
      icon: "history",
      name: "Audit log",
      description: "Every action, who did it, when and from where, and what changed.",
      detail: `${auditCount} entries`,
    },
    {
      href: "/settings/payment-methods",
      icon: "card",
      name: "Payment methods",
      description: "Choose which ways of paying are offered: Cash, UPI, Card and Bank.",
      detail: `${listPaymentMethods().filter((method) => method.enabled).length} on`,
    },
    {
      href: "/settings/users",
      icon: "users",
      name: "Users and roles",
      description: "Who can sign in, and what each role is allowed to see and do.",
      detail: `${counts.users} users · ${counts.roles} roles`,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: spacing[6],
      }}
    >
      {tiles.map((tile) => (
        <Link
          key={tile.href}
          href={tile.href}
          onMouseEnter={() => setHovered(tile.href)}
          onMouseLeave={() => setHovered((current) => (current === tile.href ? null : current))}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: spacing[5],
            minHeight: 200,
            padding: spacing[6],
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceRaised,
            boxShadow: hovered === tile.href ? elevation.md.web : elevation.sm.web,
            color: colors.ink,
            textDecoration: "none",
            transition: "box-shadow 120ms ease",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: radius.lg,
              backgroundColor: colors.surfaceSunken,
              color: colors.ink,
            }}
          >
            <Icon name={tile.icon} size={26} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: spacing[2], flex: 1 }}>
            <span style={{ ...textStyle("headline"), color: colors.ink }}>{tile.name}</span>
            <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>
              {tile.description}
            </span>
          </span>
          <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>{tile.detail}</span>
        </Link>
      ))}
    </div>
  );
}
