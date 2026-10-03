import { useTheme } from "@zenzoo/design-tokens";
import type { ReactNode } from "react";
import { textStyle } from "../internal/textStyle";

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  align?: "left" | "right";
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
}

export function Table<Row>({ columns, rows, getRowKey }: TableProps<Row>) {
  const { colors, radius, spacing } = useTheme();

  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.lg,
      }}
    >
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
        {rows.map((row, index) => (
          <tr key={getRowKey(row)}>
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
        ))}
      </tbody>
    </table>
  );
}
