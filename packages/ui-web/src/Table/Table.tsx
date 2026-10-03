import { colors, spacing, typography } from "@zenzoo/design-tokens";
import type { ReactNode } from "react";

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
}

export function Table<Row>({ columns, rows, getRowKey }: TableProps<Row>) {
  return (
    <table
      style={{ width: "100%", borderCollapse: "collapse", fontFamily: typography.fontFamily.base }}
    >
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              style={{
                textAlign: "left",
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.semibold,
                color: colors.textSecondary,
                padding: spacing[2],
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={getRowKey(row)}>
            {columns.map((column) => (
              <td
                key={column.key}
                style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.textPrimary,
                  padding: spacing[2],
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
