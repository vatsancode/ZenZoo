import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import EmployeesTable from "../../../features/employees/EmployeesTable";

export const metadata: Metadata = {
  title: "Employees - ZenZoo Admin",
};

export default function EmployeesPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <h1 style={{ ...textStyle("title1"), marginBottom: spacing[6] }}>Employees</h1>
      <EmployeesTable />
    </main>
  );
}
