"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  Chips,
  DatePicker,
  Input,
  MultiChips,
  Pagination,
  Sheet,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import {
  AUDIT_ACTION_LABEL,
  dayOf,
  formatWhen,
  listAuditEntries,
  type AuditAction,
  type AuditEntry,
  type FieldChange,
} from "../lib/audit";
import { datePresets } from "../lib/date-ranges";
import FilterPills, { type FilterGroup } from "./FilterPills";
import FormField from "./FormField";
import PageHeader from "./PageHeader";

interface AuditFilters {
  /** Empty lists mean "everything" for that filter. */
  modules: string[];
  actions: string[];
  actors: string[];
  /** ISO dates, YYYY-MM-DD, or "" for no limit on that side. */
  from: string;
  to: string;
}

const NO_FILTERS: AuditFilters = { modules: [], actions: [], actors: [], from: "", to: "" };

const TONE: Record<AuditAction, "success" | "warning" | "danger" | "neutral"> = {
  created: "success",
  updated: "warning",
  deleted: "danger",
  signed_in: "neutral",
  sign_in_failed: "danger",
};

/** One line saying what changed, for the list: "Total: ₹6,000 → ₹6,500". */
function summarise(action: AuditAction, change: FieldChange): string {
  if (action === "created") return `${change.field}: ${change.after ?? "-"}`;
  if (action === "deleted") return `${change.field}: ${change.before ?? "-"}`;
  return `${change.field}: ${change.before ?? "-"} → ${change.after ?? "-"}`;
}

/** Everything that has been done, and by whom: when, from where, and what changed. */
export default function AuditLog() {
  const { colors, radius, spacing } = useTheme();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AuditFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<AuditFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState<AuditEntry | null>(null);

  useEffect(() => {
    listAuditEntries().then((list) => setEntries([...list]));
  }, []);

  const all = useMemo(() => entries ?? [], [entries]);
  const modules = useMemo(
    () => Array.from(new Set(all.map((entry) => entry.module))).sort(),
    [all],
  );
  const actors = useMemo(
    () => Array.from(new Set(all.map((entry) => entry.actor.name))).sort(),
    [all],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((entry) => {
        const day = dayOf(entry.at);
        if (filters.from !== "" && day < filters.from) return false;
        if (filters.to !== "" && day > filters.to) return false;
        if (filters.modules.length > 0 && !filters.modules.includes(entry.module)) return false;
        if (filters.actions.length > 0 && !filters.actions.includes(entry.action)) return false;
        if (filters.actors.length > 0 && !filters.actors.includes(entry.actor.name)) return false;
        if (!q) return true;
        return (
          entry.label.toLowerCase().includes(q) ||
          entry.entity.toLowerCase().includes(q) ||
          entry.module.toLowerCase().includes(q) ||
          entry.actor.name.toLowerCase().includes(q) ||
          entry.ip.includes(q) ||
          entry.changes.some(
            (change) =>
              change.field.toLowerCase().includes(q) ||
              (change.before ?? "").toLowerCase().includes(q) ||
              (change.after ?? "").toLowerCase().includes(q),
          )
        );
      })
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }, [all, query, filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const presets = datePresets();
  const presetMatch = presets.find((p) => p.from === filters.from && p.to === filters.to);
  const rangeLabel =
    filters.from === "" && filters.to === ""
      ? ""
      : (presetMatch?.label ?? `${filters.from || "Any"} - ${filters.to || "Any"}`);
  const groups: FilterGroup[] = [
    ...(rangeLabel
      ? [
          {
            key: "range",
            label: "Date",
            values: [rangeLabel],
            onClear: () => setFilters({ ...filters, from: "", to: "" }),
          },
        ]
      : []),
    ...(filters.modules.length > 0
      ? [
          {
            key: "modules",
            label: "Area",
            values: filters.modules,
            onClear: () => setFilters({ ...filters, modules: [] }),
          },
        ]
      : []),
    ...(filters.actions.length > 0
      ? [
          {
            key: "actions",
            label: "Action",
            values: filters.actions.map((action) => AUDIT_ACTION_LABEL[action as AuditAction]),
            onClear: () => setFilters({ ...filters, actions: [] }),
          },
        ]
      : []),
    ...(filters.actors.length > 0
      ? [
          {
            key: "actors",
            label: "By",
            values: filters.actors,
            onClear: () => setFilters({ ...filters, actors: [] }),
          },
        ]
      : []),
  ];

  const draftPreset = presets.find((p) => p.from === draft.from && p.to === draft.to);
  const backwards = draft.from !== "" && draft.to !== "" && draft.from > draft.to;

  const columns: TableColumn<AuditEntry>[] = [
    {
      key: "when",
      header: "When",
      width: "15%",
      render: (entry) => {
        // "5 Oct 2026, 4:12 pm" splits at its last comma into the date and the time.
        const text = formatWhen(entry.at);
        const cut = text.lastIndexOf(", ");
        const date = text.slice(0, cut);
        const time = text.slice(cut + 2);
        return (
          <span>
            {date}
            <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
              {time}
            </span>
          </span>
        );
      },
    },
    {
      key: "who",
      header: "Who",
      width: "13%",
      render: (entry) => (
        <span>
          {entry.actor.name}
          <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
            {entry.actor.role}
          </span>
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      width: "12%",
      render: (entry) => (
        <Badge tone={TONE[entry.action]}>{AUDIT_ACTION_LABEL[entry.action]}</Badge>
      ),
    },
    {
      key: "what",
      header: "What",
      width: "22%",
      render: (entry) => (
        <span>
          {entry.label}
          <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
            {entry.module} · {entry.entity}
          </span>
        </span>
      ),
    },
    {
      key: "changes",
      header: "What changed",
      render: (entry) =>
        entry.changes.length === 0 ? (
          <span style={{ color: colors.inkFaint }}>{entry.note ?? "-"}</span>
        ) : (
          <span>
            {summarise(entry.action, entry.changes[0]!)}
            {entry.changes.length > 1 ? (
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
                + {entry.changes.length - 1} more{" "}
                {entry.changes.length === 2 ? "change" : "changes"}
              </span>
            ) : null}
          </span>
        ),
    },
    {
      key: "ip",
      header: "IP address",
      render: (entry) => (
        <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{entry.ip}</span>
      ),
    },
  ];

  const value = (text: string | null, muted: boolean, struck = false) => (
    <span
      style={{
        ...textStyle("body"),
        color: text === null ? colors.inkFaint : muted ? colors.inkMuted : colors.ink,
        textDecoration: struck && text !== null ? "line-through" : "none",
        overflowWrap: "anywhere",
      }}
    >
      {text ?? "(empty)"}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Audit log"
        subtitle="Every action: who did it, when, from where, and what changed."
        backHref="/settings"
        backLabel="Back to settings"
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[4],
        }}
      >
        <div style={{ maxWidth: 380, width: "100%" }}>
          <Input
            type="search"
            placeholder="Search who, what, IP, a value..."
            aria-label="Search the audit log"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setDraft(filters);
            setFiltersOpen(true);
          }}
          style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
        >
          Filters{groups.length > 0 ? ` · ${groups.length}` : ""}
        </Button>
      </div>

      <FilterPills
        groups={groups}
        onEdit={() => {
          setDraft(filters);
          setFiltersOpen(true);
        }}
        onClearAll={() => {
          setFilters(NO_FILTERS);
          setPage(1);
        }}
      />

      {entries === null ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          Loading the audit log...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          No entries match.
        </div>
      ) : (
        <div>
          <Table
            columns={columns}
            rows={visible}
            getRowKey={(entry) => entry.id}
            onRowClick={setOpen}
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
        </div>
      )}

      {/* One entry in full. */}
      <Sheet open={open !== null} onClose={() => setOpen(null)} title="Audit entry" width={560}>
        {open ? (
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[8] }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: spacing[4],
              }}
            >
              <div>
                <div style={{ ...textStyle("headline"), color: colors.ink }}>{open.label}</div>
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  {open.module} · {open.entity}
                </div>
              </div>
              <Badge tone={TONE[open.action]}>{AUDIT_ACTION_LABEL[open.action]}</Badge>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                columnGap: spacing[5],
                rowGap: spacing[6],
              }}
            >
              {[
                { label: "When", value: formatWhen(open.at, true) },
                { label: "Who", value: `${open.actor.name} (${open.actor.role})` },
                { label: "IP address", value: open.ip },
                { label: "Area", value: open.module },
              ].map((fact) => (
                <div key={fact.label}>
                  <div
                    style={{
                      ...textStyle("caption"),
                      color: colors.inkMuted,
                      textTransform: "uppercase",
                    }}
                  >
                    {fact.label}
                  </div>
                  <div style={{ ...textStyle("body"), color: colors.ink, marginTop: spacing[1] }}>
                    {fact.value}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
              <div style={{ ...textStyle("headline"), color: colors.ink }}>What changed</div>
              {open.changes.length === 0 ? (
                <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
                  No fields changed in this action.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px minmax(0, 1fr) minmax(0, 1fr)",
                      columnGap: spacing[4],
                      paddingBottom: spacing[2],
                      ...textStyle("caption"),
                      color: colors.inkMuted,
                    }}
                  >
                    <span>FIELD</span>
                    <span>BEFORE</span>
                    <span>AFTER</span>
                  </div>
                  {open.changes.map((change, index) => (
                    <div
                      key={change.field}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px minmax(0, 1fr) minmax(0, 1fr)",
                        columnGap: spacing[4],
                        alignItems: "start",
                        padding: `${spacing[3]}px 0`,
                        borderTop: `1px solid ${colors.border}`,
                        borderBottom:
                          index === open.changes.length - 1 ? `1px solid ${colors.border}` : "none",
                      }}
                    >
                      <span style={{ ...textStyle("body"), color: colors.inkMuted }}>
                        {change.field}
                      </span>
                      {value(change.before, true, true)}
                      {value(change.after, false)}
                    </div>
                  ))}
                </div>
              )}
              {open.note ? (
                <div
                  style={{
                    ...textStyle("callout"),
                    color: colors.inkMuted,
                    padding: spacing[4],
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceSunken,
                  }}
                >
                  {open.note}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* Narrowing the log. */}
      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        width={480}
        footer={
          <div style={{ display: "flex", gap: spacing[3] }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDraft(NO_FILTERS)}
              style={{ flex: 1 }}
            >
              Reset
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={backwards}
              onClick={() => {
                setFilters(draft);
                setPage(1);
                setFiltersOpen(false);
              }}
              style={{ flex: 2 }}
            >
              Apply filters
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[8] }}>
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
            <div style={{ ...textStyle("headline"), color: colors.ink }}>Timeline</div>
            <Chips
              aria-label="Date range"
              options={presets.map(({ id, label }) => ({ value: id, label }))}
              value={draftPreset?.id ?? ""}
              columns={3}
              onChange={(id) => {
                const range = presets.find((item) => item.id === id);
                if (range) setDraft((current) => ({ ...current, from: range.from, to: range.to }));
              }}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                columnGap: spacing[4],
                alignItems: "start",
              }}
            >
              <FormField id="audit-from" label="FROM" span={1}>
                <DatePicker
                  id="audit-from"
                  value={draft.from}
                  placeholder="Any date"
                  max={draft.to || undefined}
                  onChange={(from) => setDraft((c) => ({ ...c, from }))}
                />
              </FormField>
              <FormField
                id="audit-to"
                label="TO"
                span={1}
                error={backwards ? "Must be after the start date." : null}
              >
                <DatePicker
                  id="audit-to"
                  value={draft.to}
                  placeholder="Any date"
                  min={draft.from || undefined}
                  align="right"
                  onChange={(to) => setDraft((c) => ({ ...c, to }))}
                />
              </FormField>
            </div>
          </div>

          {[
            {
              key: "modules",
              title: "Area",
              options: modules.map((name) => ({ value: name, label: name })),
              value: draft.modules,
              columns: 2,
            },
            {
              key: "actions",
              title: "Action",
              options: (Object.keys(AUDIT_ACTION_LABEL) as AuditAction[]).map((action) => ({
                value: action,
                label: AUDIT_ACTION_LABEL[action],
              })),
              value: draft.actions,
              columns: 2,
            },
            {
              key: "actors",
              title: "Done by",
              options: actors.map((name) => ({ value: name, label: name })),
              value: draft.actors,
              columns: 2,
            },
          ].map((section) => (
            <div
              key={section.key}
              style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}
            >
              <div style={{ ...textStyle("headline"), color: colors.ink }}>{section.title}</div>
              <MultiChips
                aria-label={section.title}
                options={section.options}
                value={section.value}
                columns={section.columns}
                onChange={(next) => setDraft((current) => ({ ...current, [section.key]: next }))}
              />
              <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                {section.value.length === 0 ? "Showing everything." : "Pick as many as you like."}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
