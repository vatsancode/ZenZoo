"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  IconButton,
  Input,
  LoadError,
  Notice,
  Pagination,
  Select,
  SkeletonTable,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "../../lib/stock-display";
import { useSingleFlight } from "../../lib/useSingleFlight";
import EmployeeAvatar from "./EmployeeAvatar";
import EmployeeSheet from "./EmployeeSheet";
import {
  addEmployee,
  addIdType,
  addJobRole,
  editEmployee,
  listEmployees,
  listIdTypes,
  listJobRoles,
  STATUS_LABELS,
  STATUS_TONES,
  type Employee,
  type EmployeeInput,
  type EmployeeStatus,
} from "./employees";

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  ...(Object.keys(STATUS_LABELS) as EmployeeStatus[]).map((value) => ({
    value,
    label: STATUS_LABELS[value],
  })),
];

export default function EmployeesTable() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [jobRoles, setJobRoles] = useState<string[]>([]);
  const [idTypes, setIdTypes] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set when fetching the list failed: before anything loaded, or after a save went through.
  const [loadProblem, setLoadProblem] = useState<"load" | "refresh" | null>(null);
  const { busy: reloading, run: runReload } = useSingleFlight();

  /** Fetches the list; `problem` says what to tell the person if that fails. */
  const reload = useCallback(
    (problem: "load" | "refresh") =>
      runReload(async () => {
        try {
          const [rows, roles, types] = await Promise.all([
            listEmployees(),
            listJobRoles(),
            listIdTypes(),
          ]);
          setEmployees(rows);
          setJobRoles(roles);
          setIdTypes(types);
          setLoadProblem(null);
        } catch {
          setLoadProblem(problem);
        }
      }),
    [runReload],
  );

  useEffect(() => {
    void reload("load");
  }, [reload]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function closeSheet() {
    setAddOpen(false);
    setEditing(null);
  }

  // One sheet serves both: adding a new employee, or editing the clicked row.
  async function handleSubmit(input: EmployeeInput): Promise<string | null> {
    const result = editing ? await editEmployee(editing.id, input) : await addEmployee(input);
    // Refused: the sheet stays open and shows why.
    if (typeof result === "string") return result;

    setEmployees((current) =>
      editing
        ? (current ?? []).map((row) => (row.id === result.id ? result : row))
        : [result, ...(current ?? [])],
    );
    // A new employee lands at the top of the list, so go there to show it.
    if (!editing) setPage(1);
    setNotice(editing ? `${result.name} updated.` : `${result.name} added.`);
    closeSheet();
    return null;
  }

  // Saves a new option and refreshes the lists the sheet and the filter read from.
  async function handleAddJobRole(name: string): Promise<string | null> {
    const problem = await addJobRole(name);
    if (!problem) setJobRoles(await listJobRoles());
    return problem;
  }

  async function handleAddIdType(name: string): Promise<string | null> {
    const problem = await addIdType(name);
    if (!problem) setIdTypes(await listIdTypes());
    return problem;
  }

  const roleFilterOptions = useMemo(
    () => [
      { value: "", label: "All roles" },
      ...[...jobRoles].sort().map((role) => ({ value: role, label: role })),
    ],
    [jobRoles],
  );

  const filtered = useMemo(() => {
    if (!employees) return [];
    const q = query.trim().toLowerCase();
    return employees.filter(
      (row) =>
        (statusFilter === "" || row.status === statusFilter) &&
        (roleFilter === "" || row.jobRole === roleFilter) &&
        (q === "" ||
          row.name.toLowerCase().includes(q) ||
          row.code.toLowerCase().includes(q) ||
          row.mobile.toLowerCase().includes(q) ||
          row.jobRole.toLowerCase().includes(q) ||
          row.city.toLowerCase().includes(q)),
    );
  }, [employees, query, statusFilter, roleFilter]);

  // Stay on a real page even if the list shrinks (e.g. after typing in the search box).
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const muted = (value?: string) => (
    <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{value || "-"}</span>
  );

  const columns: TableColumn<Employee>[] = [
    {
      key: "name",
      header: "Employee",
      width: "30%",
      render: (row) => (
        <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
          <EmployeeAvatar name={row.name} photoUrl={row.photoUrl} size={36} />
          <div style={{ minWidth: 0 }}>
            <div>{row.name}</div>
            <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>{row.code}</div>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Job role", render: (row) => muted(row.jobRole) },
    { key: "mobile", header: "Mobile", render: (row) => muted(row.mobile) },
    { key: "joined", header: "Joined", render: (row) => muted(formatDate(row.joinedOn)) },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge tone={STATUS_TONES[row.status]}>{STATUS_LABELS[row.status]}</Badge>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      width: "88px",
      render: (row) => (
        <IconButton
          icon="edit"
          label={`Edit ${row.name}`}
          onClick={(event) => {
            event.stopPropagation();
            setEditing(row);
          }}
        />
      ),
    },
  ];

  const message = (text: string) => (
    <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
      {text}
    </div>
  );

  const nothingYet = employees !== null && employees.length === 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[4],
          marginBottom: spacing[6],
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: spacing[3], flex: 1 }}>
          <div style={{ maxWidth: 360, width: "100%" }}>
            <Input
              type="search"
              placeholder="Search name, ID, mobile, role, city..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              aria-label="Search employees"
            />
          </div>
          <div style={{ width: 160 }}>
            <Select
              options={STATUS_FILTER_OPTIONS}
              value={statusFilter}
              searchable={false}
              aria-label="Filter by status"
              onChange={(next) => {
                setStatusFilter(next);
                setPage(1);
              }}
            />
          </div>
          <div style={{ width: 180 }}>
            <Select
              options={roleFilterOptions}
              value={roleFilter}
              aria-label="Filter by job role"
              onChange={(next) => {
                setRoleFilter(next);
                setPage(1);
              }}
            />
          </div>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          Add employee
        </Button>
      </div>

      {notice ? <Notice style={{ marginBottom: spacing[4] }}>{notice}</Notice> : null}

      {loadProblem === "refresh" ? (
        <LoadError
          message="Saved, but couldn't refresh the list."
          onRetry={() => void reload("refresh")}
          retrying={reloading}
          style={{ marginBottom: spacing[4] }}
        />
      ) : null}

      {employees === null && loadProblem === "load" ? (
        <LoadError
          message="Couldn't load the employees."
          onRetry={() => void reload("load")}
          retrying={reloading}
        />
      ) : employees === null ? (
        // Same columns as the real table, so the headers are already in place.
        <SkeletonTable columns={columns} rows={5} />
      ) : filtered.length === 0 ? (
        message(
          nothingYet
            ? "No employees yet. Add the first one."
            : "No employees match your search or filters.",
        )
      ) : (
        <>
          <Table
            columns={columns}
            rows={visible}
            getRowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/employees/${encodeURIComponent(row.id)}`)}
          />
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            pageSizeOptions={[10, 25, 50]}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      <EmployeeSheet
        open={addOpen || editing !== null}
        employee={editing}
        jobRoles={jobRoles}
        idTypes={idTypes}
        onAddJobRole={handleAddJobRole}
        onAddIdType={handleAddIdType}
        onClose={closeSheet}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
