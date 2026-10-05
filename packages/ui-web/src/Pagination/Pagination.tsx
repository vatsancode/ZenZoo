"use client";

import { useTheme } from "@zenzoo/design-tokens";
import type { ReactNode } from "react";
import { Select } from "../Select";
import { textStyle } from "../internal/textStyle";

export interface PaginationProps {
  /** The page being shown, starting at 1. */
  page: number;
  pageSize: number;
  /** How many rows there are in all, across every page. */
  total: number;
  onPageChange: (page: number) => void;
  /** With both of these, a "Rows per page" picker appears. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
}

/** Page numbers to show: always the first and last, and the ones around the current page. */
function pageItems(page: number, pageCount: number): (number | "gap")[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  pages.forEach((n, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && n - previous > 1) items.push("gap");
    items.push(n);
  });
  return items;
}

function PageButton({
  label,
  onClick,
  disabled,
  selected,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  children: ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={selected ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...textStyle(selected ? "headline" : "callout"),
        minWidth: 36,
        height: 36,
        paddingInline: spacing[2],
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: radius.full,
        backgroundColor: selected ? colors.surfaceSunken : "transparent",
        color: selected ? colors.ink : colors.inkMuted,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationProps) {
  const { colors, spacing } = useTheme();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), pageCount);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);

  const chevron = (direction: "left" | "right") => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M10 4L6 8l4 4" : "M6 4l4 4-4 4"}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: spacing[4],
        marginTop: spacing[4],
      }}
    >
      <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
        Showing {first}-{last} of {total}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: spacing[6], flexWrap: "wrap" }}>
        {pageSizeOptions && onPageSizeChange ? (
          <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
            <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>Rows per page</span>
            <div style={{ width: 88 }}>
              <Select
                aria-label="Rows per page"
                searchable={false}
                options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
                value={String(pageSize)}
                onChange={(next) => onPageSizeChange(Number(next))}
              />
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: spacing[1] }}>
          <PageButton
            label="Previous page"
            disabled={current === 1}
            onClick={() => onPageChange(current - 1)}
          >
            {chevron("left")}
          </PageButton>
          {pageItems(current, pageCount).map((item, index) =>
            item === "gap" ? (
              <span
                key={`gap-${index}`}
                aria-hidden="true"
                style={{ ...textStyle("callout"), color: colors.inkFaint, minWidth: 24, textAlign: "center" }}
              >
                …
              </span>
            ) : (
              <PageButton
                key={item}
                label={`Page ${item}`}
                selected={item === current}
                onClick={() => onPageChange(item)}
              >
                {item}
              </PageButton>
            ),
          )}
          <PageButton
            label="Next page"
            disabled={current === pageCount}
            onClick={() => onPageChange(current + 1)}
          >
            {chevron("right")}
          </PageButton>
        </div>
      </div>
    </nav>
  );
}
