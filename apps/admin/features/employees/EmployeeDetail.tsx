"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, Notice, Tabs, textStyle } from "@zenzoo/ui-web";
import { useCallback, useEffect, useState } from "react";
import DetailList from "../../components/DetailList";
import DetailPageLoading from "../../components/DetailPageLoading";
import PageHeader from "../../components/PageHeader";
import StatTile, { StatRow } from "../../components/StatTile";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { useSingleFlight } from "../../lib/useSingleFlight";
import EmployeeAvatar from "./EmployeeAvatar";
import EmployeeSheet from "./EmployeeSheet";
import {
  addIdType,
  addJobRole,
  addSalaryPayment,
  editEmployee,
  GENDER_LABELS,
  getEmployee,
  listIdTypes,
  listJobRoles,
  listSalaryPayments,
  STATUS_LABELS,
  STATUS_TONES,
  type Employee,
  type SalaryPayment,
  type SalaryPaymentInput,
} from "./employees";
import SalaryTab from "./SalaryTab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "salary", label: "Salary" },
];

/** One employee: who they are, and the salary paid to them. */
export default function EmployeeDetail({ employeeId }: { employeeId: string }) {
  const { colors, spacing } = useTheme();
  // undefined while loading, null when there is no such employee.
  const [employee, setEmployee] = useState<Employee | null | undefined>(undefined);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [jobRoles, setJobRoles] = useState<string[]>([]);
  const [idTypes, setIdTypes] = useState<string[]>([]);
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { busy: loading, run: runLoad } = useSingleFlight();

  const load = useCallback(
    () =>
      runLoad(async () => {
        setLoadFailed(false);
        try {
          const [row, roles, types, paid] = await Promise.all([
            getEmployee(employeeId),
            listJobRoles(),
            listIdTypes(),
            listSalaryPayments(employeeId),
          ]);
          setEmployee(row);
          setJobRoles(roles);
          setIdTypes(types);
          setPayments(paid);
        } catch {
          setLoadFailed(true);
        }
      }),
    [runLoad, employeeId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (employee === undefined) {
    return (
      <DetailPageLoading
        backHref="/employees"
        backLabel="Back to employees"
        failed={loadFailed}
        failedTitle="Employee"
        failedMessage="Couldn't load this employee."
        onRetry={() => void load()}
        retrying={loading}
      />
    );
  }

  if (employee === null) {
    return (
      <>
        <PageHeader
          title="Employee not found"
          backHref="/employees"
          backLabel="Back to employees"
        />
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          This employee doesn&apos;t exist.
        </div>
      </>
    );
  }

  async function recordPayment(input: SalaryPaymentInput): Promise<string | null> {
    const result = await addSalaryPayment(employeeId, input);
    if (typeof result === "string") return result;
    setPayments((current) => [result, ...current].sort((a, b) => b.paidOn.localeCompare(a.paidOn)));
    setNotice(`Recorded ${formatPrice(input.amount)} salary paid to ${employee?.name}.`);
    return null;
  }

  const statusBadge = (
    <Badge tone={STATUS_TONES[employee.status]}>{STATUS_LABELS[employee.status]}</Badge>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title={employee.name}
        subtitle={`${employee.code} · ${employee.jobRole}`}
        backHref="/employees"
        backLabel="Back to employees"
        action={
          <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
            {statusBadge}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditOpen(true)}
              style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
            >
              Edit employee
            </Button>
          </div>
        }
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <Tabs aria-label="Employee sections" tabs={TABS} value={tab} onChange={setTab} />

      <div
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}
      >
        {tab === "overview" ? (
          <>
            <StatRow>
              <StatTile label="Job role" value={employee.jobRole} />
              <StatTile label="Status" value={statusBadge} />
              <StatTile label="Joined" value={formatDate(employee.joinedOn)} />
              <StatTile label="Age" value={`${employee.age} years`} />
            </StatRow>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: spacing[6],
                alignItems: "start",
              }}
            >
              <Card>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing[4],
                    marginBottom: spacing[5],
                  }}
                >
                  <EmployeeAvatar name={employee.name} photoUrl={employee.photoUrl} size={64} />
                  <div style={{ ...textStyle("headline"), color: colors.ink }}>Personal</div>
                </div>
                <DetailList
                  rows={[
                    { label: "Employee ID", value: employee.code },
                    { label: "Gender", value: GENDER_LABELS[employee.gender] },
                    { label: "Age", value: employee.age },
                    { label: "Mobile", value: employee.mobile },
                  ]}
                />
              </Card>
              <Card>
                <div
                  style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[5] }}
                >
                  Address and ID
                </div>
                <DetailList
                  rows={[
                    { label: "Address", value: employee.addressLine1 },
                    { label: "City", value: employee.city },
                    { label: "State", value: employee.state },
                    { label: employee.idType, value: employee.idNumber },
                  ]}
                />
              </Card>
            </div>
          </>
        ) : (
          <SalaryTab employee={employee} payments={payments} onRecord={recordPayment} />
        )}
      </div>

      <EmployeeSheet
        open={editOpen}
        employee={employee}
        jobRoles={jobRoles}
        idTypes={idTypes}
        onAddJobRole={async (name) => {
          const problem = await addJobRole(name);
          if (!problem) setJobRoles(await listJobRoles());
          return problem;
        }}
        onAddIdType={async (name) => {
          const problem = await addIdType(name);
          if (!problem) setIdTypes(await listIdTypes());
          return problem;
        }}
        onClose={() => setEditOpen(false)}
        onSubmit={async (input) => {
          const result = await editEmployee(employee.id, input);
          if (typeof result === "string") return result;
          setEmployee(result);
          setEditOpen(false);
          setNotice("Employee updated.");
          return null;
        }}
      />
    </div>
  );
}
