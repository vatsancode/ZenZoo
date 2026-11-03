import { useTheme } from "@zenzoo/design-tokens";
import type { HTMLAttributes, ReactNode } from "react";
import { textStyle } from "../internal/textStyle";

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  align?: "left" | "right";
  /** Any CSS width (e.g. "30%", "80px"). Columns without one share the remaining width equally. */
  width?: string;
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  /** Makes each row clickable (and reachable with Enter from the keyboard). */
  onRowClick?: (row: Row) => void;
  /** Extra props for a row, such as the drag handlers and look of a reorderable list. */
  rowProps?: (row: Row, index: number) => HTMLAttributes<HTMLTableRowElement>;
}

export function Table<Row>({ columns, rows, getRowKey, onRowClick, rowProps }: TableProps<Row>) {
  const { colors, radius, spacing } = useTheme();

  return (
    <table
      style={{
        width: "100%",
        tableLayout: "fixed",
        borderCollapse: "collapse",
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.lg,
      }}
    >
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={column.width ? { width: column.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              style={{
                ...textStyle("caption"),
                textAlign: column.align ?? "left",
                textTransform: "uppercase",
                color: colors.inkMuted,
                padding: `${spacing[3]}px ${spacing[5]}px`,
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const extra = rowProps?.(row, index);
          return (
            <tr
              key={getRowKey(row)}
              {...extra}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" && event.target === event.currentTarget)
                        onRowClick(row);
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              style={
                onRowClick || extra?.style
                  ? { ...(onRowClick ? { cursor: "pointer" } : null), ...extra?.style }
                  : undefined
              }
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={{
                    ...textStyle("body"),
                    textAlign: column.align ?? "left",
                    color: colors.ink,
                    padding: `${spacing[4]}px ${spacing[5]}px`,
                    borderBottom: index === rows.length - 1 ? "none" : `1px solid ${colors.border}`,
                  }}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
