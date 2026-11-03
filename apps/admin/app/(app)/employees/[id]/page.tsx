import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import EmployeeDetail from "../../../../features/employees/EmployeeDetail";

export const metadata: Metadata = {
  title: "Employee - ZenZoo Admin",
};

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main style={{ padding: spacing[10] }}>
      <EmployeeDetail employeeId={decodeURIComponent(id)} />
    </main>
  );
}
