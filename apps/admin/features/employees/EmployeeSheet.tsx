"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, DatePicker, Input, Select, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import FormField from "../../components/FormField";
import FormSection from "../../components/FormSection";
import NewCategoryDialog from "../../components/NewCategoryDialog";
import { useSingleFlight } from "../../lib/useSingleFlight";
import {
  ageProblem,
  GENDER_LABELS,
  mobileProblem,
  nameProblem,
  requiredProblem,
  STATUS_LABELS,
  type Employee,
  type EmployeeInput,
  type EmployeeStatus,
  type Gender,
} from "./employees";
import ProfilePhotoPicker from "./ProfilePhotoPicker";
import { cleanPhoneInput } from "../settings/users";

interface EmployeeSheetProps {
  open: boolean;
  /** When set, the sheet edits this employee instead of adding a new one. */
  employee?: Employee | null;
  jobRoles: string[];
  idTypes: string[];
  /** Saves a new job role / ID type. Resolves to an error message, or null once saved. */
  onAddJobRole: (name: string) => Promise<string | null>;
  onAddIdType: (name: string) => Promise<string | null>;
  onClose: () => void;
  /** Saves the employee; resolves to an error message to show, or null when it went through. */
  onSubmit: (input: EmployeeInput) => Promise<string | null>;
}

const ORDER = [
  "employee-name",
  "employee-job-role",
  "employee-age",
  "employee-gender",
  "employee-mobile",
  "employee-address",
  "employee-city",
  "employee-state",
  "employee-id-type",
  "employee-id-number",
  "employee-joined-on",
];

const GENDER_OPTIONS = (Object.keys(GENDER_LABELS) as Gender[]).map((value) => ({
  value,
  label: GENDER_LABELS[value],
}));
const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as EmployeeStatus[]).map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

/** Today as YYYY-MM-DD in the browser's own timezone. */
function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Adding = { kind: "role" | "idType"; typed: string } | null;

export default function EmployeeSheet({
  open,
  employee = null,
  jobRoles,
  idTypes,
  onAddJobRole,
  onAddIdType,
  onClose,
  onSubmit,
}: EmployeeSheetProps) {
  const { colors, spacing } = useTheme();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [mobile, setMobile] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [joinedOn, setJoinedOn] = useState("");
  const [status, setStatus] = useState<EmployeeStatus>("active");
  const [photoUrl, setPhotoUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Adding>(null);
  const { busy: saving, run: runSave } = useSingleFlight();

  useEffect(() => {
    const source = open ? employee : null;
    setName(source?.name ?? "");
    setAge(source ? String(source.age) : "");
    setGender(source?.gender ?? "");
    setMobile(source?.mobile ?? "");
    setAddressLine1(source?.addressLine1 ?? "");
    setCity(source?.city ?? "");
    setState(source?.state ?? "");
    setJobRole(source?.jobRole ?? "");
    setIdType(source?.idType ?? "");
    setIdNumber(source?.idNumber ?? "");
    setJoinedOn(source?.joinedOn ?? todayIso());
    setStatus(source?.status ?? "active");
    setPhotoUrl(source?.photoUrl ?? "");
    setTouched(false);
    setSubmitError(null);
    setAdding(null);
  }, [open, employee]);

  const isEditing = employee !== null;
  const roleOptions = useMemo(
    () => jobRoles.map((value) => ({ value, label: value })).sort(byLabel),
    [jobRoles],
  );
  const idTypeOptions = useMemo(
    () => idTypes.map((value) => ({ value, label: value })).sort(byLabel),
    [idTypes],
  );

  const errors = {
    name: nameProblem(name),
    age: ageProblem(age),
    gender: gender === "" ? "Choose a gender." : null,
    mobile: mobileProblem(mobile),
    address: requiredProblem(addressLine1, "Enter the address."),
    city: requiredProblem(city, "Enter the city."),
    state: requiredProblem(state, "Enter the state."),
    jobRole: jobRole === "" ? "Choose a job role." : null,
    joinedOn: joinedOn === "" ? "Pick the joining date." : null,
    idType: idType === "" ? "Choose an ID type." : null,
    idNumber: requiredProblem(idNumber, "Enter the ID number."),
  };
  const valid = Object.values(errors).every((problem) => problem === null);
  const shown = (problem: string | null) => (touched ? problem : null);

  function submit() {
    setTouched(true);
    if (!valid) return;
    return runSave(async () => {
      setSubmitError(
        await onSubmit({
          name,
          age,
          gender,
          mobile,
          addressLine1,
          city,
          state,
          jobRole,
          idType,
          idNumber,
          joinedOn,
          status,
          photoUrl,
        }),
      );
    });
  }

  // Enter moves to the next field, or submits from the last one.
  function enterFrom(id: string) {
    return (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const next = ORDER[ORDER.indexOf(id) + 1];
      if (next) document.getElementById(next)?.focus();
      else submit();
    };
  }

  function closeDialog() {
    const fieldId = adding?.kind === "role" ? "employee-job-role" : "employee-id-type";
    setAdding(null);
    setTimeout(() => document.getElementById(fieldId)?.focus(), 0);
  }

  // Saves the new option, then selects it so the form never needs a second trip to Settings.
  async function saveNew(value: string): Promise<string | null> {
    if (!adding) return null;
    const problem = await (adding.kind === "role" ? onAddJobRole(value) : onAddIdType(value));
    if (problem) return problem;
    if (adding.kind === "role") setJobRole(value);
    else setIdType(value);
    closeDialog();
    return null;
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit employee" : "Add employee"}
      width={560}
      footer={
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="employee-form"
            variant="primary"
            loading={saving}
            style={{ flex: 2 }}
          >
            {isEditing ? "Save changes" : "Add employee"}
          </Button>
        </div>
      }
    >
      <form
        id="employee-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
          <FormSection title="Basic details" divider={false}>
            <FormField id="employee-name" label="NAME" span={12} error={shown(errors.name)}>
              <Input
                id="employee-name"
                autoFocus
                autoComplete="off"
                maxLength={120}
                placeholder="e.g. Asha Raman"
                value={name}
                aria-invalid={shown(errors.name) ? true : undefined}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={enterFrom("employee-name")}
              />
            </FormField>
            <FormField
              id="employee-job-role"
              label="JOB ROLE"
              span={12}
              error={shown(errors.jobRole)}
            >
              <Select
                id="employee-job-role"
                options={roleOptions}
                value={jobRole}
                placeholder="Select a role"
                creatable
                createLabel="Add new role"
                onCreateRequest={(typed) => setAdding({ kind: "role", typed })}
                aria-invalid={shown(errors.jobRole) ? true : undefined}
                onChange={setJobRole}
                onKeyDown={enterFrom("employee-job-role")}
              />
            </FormField>
            <FormField id="employee-age" label="AGE" span={4} error={shown(errors.age)}>
              <Input
                id="employee-age"
                inputMode="numeric"
                autoComplete="off"
                maxLength={3}
                placeholder="e.g. 28"
                value={age}
                aria-invalid={shown(errors.age) ? true : undefined}
                onChange={(event) => setAge(event.target.value)}
                onKeyDown={enterFrom("employee-age")}
              />
            </FormField>
            <FormField id="employee-gender" label="GENDER" span={8} error={shown(errors.gender)}>
              <Select
                id="employee-gender"
                options={GENDER_OPTIONS}
                value={gender}
                placeholder="Select gender"
                searchable={false}
                aria-invalid={shown(errors.gender) ? true : undefined}
                onChange={(next) => setGender(next as Gender)}
                onKeyDown={enterFrom("employee-gender")}
              />
            </FormField>
          </FormSection>

          <FormSection title="Contact">
            <FormField id="employee-mobile" label="MOBILE" span={12} error={shown(errors.mobile)}>
              <Input
                id="employee-mobile"
                type="tel"
                autoComplete="off"
                maxLength={20}
                placeholder="+91 98765 43210"
                value={mobile}
                aria-invalid={shown(errors.mobile) ? true : undefined}
                onChange={(event) => setMobile(cleanPhoneInput(event.target.value))}
                onKeyDown={enterFrom("employee-mobile")}
              />
            </FormField>
          </FormSection>

          <FormSection title="Address">
            <FormField
              id="employee-address"
              label="ADDRESS LINE 1"
              span={12}
              error={shown(errors.address)}
            >
              <Input
                id="employee-address"
                autoComplete="off"
                maxLength={200}
                placeholder="House / street / area"
                value={addressLine1}
                aria-invalid={shown(errors.address) ? true : undefined}
                onChange={(event) => setAddressLine1(event.target.value)}
                onKeyDown={enterFrom("employee-address")}
              />
            </FormField>
            <FormField id="employee-city" label="CITY" span={6} error={shown(errors.city)}>
              <Input
                id="employee-city"
                autoComplete="off"
                maxLength={100}
                value={city}
                aria-invalid={shown(errors.city) ? true : undefined}
                onChange={(event) => setCity(event.target.value)}
                onKeyDown={enterFrom("employee-city")}
              />
            </FormField>
            <FormField id="employee-state" label="STATE" span={6} error={shown(errors.state)}>
              <Input
                id="employee-state"
                autoComplete="off"
                maxLength={100}
                value={state}
                aria-invalid={shown(errors.state) ? true : undefined}
                onChange={(event) => setState(event.target.value)}
                onKeyDown={enterFrom("employee-state")}
              />
            </FormField>
          </FormSection>

          <FormSection title="ID and employment">
            <FormField id="employee-id-type" label="ID TYPE" span={6} error={shown(errors.idType)}>
              <Select
                id="employee-id-type"
                options={idTypeOptions}
                value={idType}
                placeholder="Select an ID type"
                creatable
                createLabel="Add new ID type"
                onCreateRequest={(typed) => setAdding({ kind: "idType", typed })}
                aria-invalid={shown(errors.idType) ? true : undefined}
                onChange={setIdType}
                onKeyDown={enterFrom("employee-id-type")}
              />
            </FormField>
            <FormField
              id="employee-id-number"
              label="ID NUMBER"
              span={6}
              error={shown(errors.idNumber)}
            >
              <Input
                id="employee-id-number"
                autoComplete="off"
                maxLength={40}
                value={idNumber}
                aria-invalid={shown(errors.idNumber) ? true : undefined}
                onChange={(event) => setIdNumber(event.target.value)}
                onKeyDown={enterFrom("employee-id-number")}
              />
            </FormField>
            <FormField
              id="employee-joined-on"
              label="JOINING DATE"
              span={isEditing ? 6 : 12}
              error={shown(errors.joinedOn)}
            >
              <DatePicker
                id="employee-joined-on"
                value={joinedOn}
                onChange={setJoinedOn}
                clearable={false}
                aria-invalid={shown(errors.joinedOn) ? true : undefined}
              />
            </FormField>
            {isEditing ? (
              <FormField id="employee-status" label="STATUS" span={6}>
                <Select
                  id="employee-status"
                  options={STATUS_OPTIONS}
                  value={status}
                  searchable={false}
                  onChange={(next) => setStatus(next as EmployeeStatus)}
                />
              </FormField>
            ) : null}
          </FormSection>

          <FormSection title="Profile picture" description="Optional. Shown next to their name.">
            <ProfilePhotoPicker name={name} value={photoUrl} onChange={setPhotoUrl} />
          </FormSection>

          {submitError ? (
            <div style={{ ...textStyle("callout"), color: colors.danger }} role="alert">
              {submitError}
            </div>
          ) : null}
        </div>
      </form>
      <NewCategoryDialog
        open={adding !== null}
        title={adding?.kind === "role" ? "New job role" : "New ID type"}
        initialName={adding?.typed ?? ""}
        onSave={saveNew}
        onClose={closeDialog}
      />
    </Sheet>
  );
}
