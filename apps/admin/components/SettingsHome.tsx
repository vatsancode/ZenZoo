"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Icon, textStyle, useThemePreference, type IconName } from "@zenzoo/ui-web";
import Link from "next/link";
import { useEffect, useState } from "react";
import { accountMovements, balanceOf, listAccounts } from "../lib/accounts";
import { listCategories, listUnits } from "../lib/catalogue";
import { listExpenseCategories } from "../lib/expenses";
import { formatPrice } from "../lib/stock-display";

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
  const [counts, setCounts] = useState({
    categories: 0,
    subcategories: 0,
    units: 0,
    accounts: 0,
    total: 0,
  });

  useEffect(() => {
    async function load() {
      const [categories, units, accounts, movements] = await Promise.all([
        listCategories(),
        listUnits(),
        listAccounts(),
        accountMovements(),
      ]);
      setCounts({
        categories: categories.length,
        subcategories: categories.reduce((sum, category) => sum + category.subcategories.length, 0),
        units: units.length,
        accounts: accounts.length,
        total: accounts.reduce((sum, account) => sum + balanceOf(account, movements), 0),
      });
    }
    void load();
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
