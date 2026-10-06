"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  Card,
  IconButton,
  Input,
  Modal,
  Notice,
  Select,
  Switch,
  Tabs,
  textStyle,
} from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  ACCESS_LABEL,
  ACCESS_LEVELS,
  CURRENT_USER_ID,
  PERMISSION_AREAS,
  addRole,
  addUser,
  editRole,
  editUser,
  getRole,
  listRoles,
  listUsers,
  removeRole,
  roleSummary,
  setUserDisabled,
  type AccessLevel,
  type Permissions,
  type Role,
  type User,
} from "./users";
import { formatWhen } from "../../lib/audit";
import FormField from "../../components/FormField";
import PageHeader from "../../components/PageHeader";

const TABS = [
  { id: "users", label: "Users" },
  { id: "roles", label: "Roles" },
];

const ACCESS_OPTIONS = ACCESS_LEVELS.map((level) => ({ value: level, label: ACCESS_LABEL[level] }));

const noAccess = (): Permissions =>
  Object.fromEntries(PERMISSION_AREAS.map((area) => [area.id, "none"])) as Permissions;

/** Who can sign in, and what each role is allowed to see and do. */
export default function UsersSettings() {
  const { colors, radius, spacing } = useTheme();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // null = closed; "new" = adding; otherwise the one being edited.
  const [userForm, setUserForm] = useState<User | "new" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState("");
  const [userError, setUserError] = useState<string | null>(null);

  const [roleForm, setRoleForm] = useState<Role | "new" | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleNote, setRoleNote] = useState("");
  const [permissions, setPermissions] = useState<Permissions>(noAccess());
  const [roleError, setRoleError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Role | null>(null);

  function reload() {
    setUsers([...listUsers()]);
    setRoles([...listRoles()]);
  }

  useEffect(reload, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function openUser(target: User | "new") {
    setUserForm(target);
    setName(target === "new" ? "" : target.name);
    setEmail(target === "new" ? "" : target.email);
    setPhone(target === "new" ? "" : (target.phone ?? ""));
    setRoleId(target === "new" ? "" : target.roleId);
    setUserError(null);
  }

  function submitUser() {
    const input = { name, email, phone, roleId };
    const problem =
      userForm === "new" ? addUser(input) : userForm ? editUser(userForm.id, input) : null;
    if (problem) {
      setUserError(problem);
      return;
    }
    setNotice(userForm === "new" ? `${name.trim()} added.` : `${name.trim()} updated.`);
    setUserForm(null);
    reload();
  }

  function openRole(target: Role | "new") {
    setRoleForm(target);
    setRoleName(target === "new" ? "" : target.name);
    setRoleNote(target === "new" ? "" : target.description);
    setPermissions(target === "new" ? noAccess() : { ...target.permissions });
    setRoleError(null);
  }

  function submitRole() {
    const input = { name: roleName, description: roleNote, permissions };
    const problem =
      roleForm === "new" ? addRole(input) : roleForm ? editRole(roleForm.id, input) : null;
    if (problem) {
      setRoleError(problem);
      return;
    }
    setNotice(roleForm === "new" ? `${roleName.trim()} added.` : `${roleName.trim()} updated.`);
    setRoleForm(null);
    reload();
  }

  const peopleIn = (role: Role) => users.filter((user) => user.roleId === role.id).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Users and roles"
        subtitle="Who can sign in, and what each role can see and do."
        backHref="/settings"
        backLabel="Back to settings"
        action={
          tab === "users" ? (
            <Button type="button" variant="primary" onClick={() => openUser("new")}>
              Add user
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={() => openRole("new")}>
              Add role
            </Button>
          )
        }
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <Tabs aria-label="Users and roles" tabs={TABS} value={tab} onChange={setTab} />

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "users" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
            {users.map((user) => {
              const role = getRole(user.roleId);
              const isMe = user.id === CURRENT_USER_ID;
              return (
                <Card
                  key={user.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing[5],
                    padding: `${spacing[5]}px ${spacing[6]}px`,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 44,
                      height: 44,
                      flex: "none",
                      borderRadius: radius.full,
                      backgroundColor: colors.surfaceSunken,
                      color: colors.ink,
                      ...textStyle("bodyMedium"),
                    }}
                  >
                    {user.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        ...textStyle("headline"),
                        color: user.status === "disabled" ? colors.inkMuted : colors.ink,
                        display: "flex",
                        alignItems: "center",
                        gap: spacing[3],
                      }}
                    >
                      {user.name}
                      {isMe ? <Badge tone="neutral">You</Badge> : null}
                      {user.status === "disabled" ? <Badge tone="neutral">Disabled</Badge> : null}
                    </div>
                    <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      {user.email}
                      {user.phone ? ` · ${user.phone}` : ""}
                    </div>
                  </div>
                  <div style={{ minWidth: 150 }}>
                    <div style={{ ...textStyle("body"), color: colors.ink }}>
                      {role?.name ?? "No role"}
                    </div>
                    <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      {user.lastSignIn
                        ? `Last in ${formatWhen(user.lastSignIn)}`
                        : "Never signed in"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
                    <Switch
                      checked={user.status === "active"}
                      aria-label={
                        user.status === "active" ? `Turn ${user.name} off` : `Turn ${user.name} on`
                      }
                      onChange={(on) => {
                        const problem = setUserDisabled(user.id, !on);
                        if (problem) setNotice(problem);
                        else {
                          setNotice(
                            on
                              ? `${user.name} can sign in again.`
                              : `${user.name} can no longer sign in. Their history stays.`,
                          );
                          reload();
                        }
                      }}
                    />
                    <IconButton
                      icon="edit"
                      label={`Edit ${user.name}`}
                      onClick={() => openUser(user)}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
            {roles.map((role) => {
              const count = peopleIn(role);
              return (
                <Card
                  key={role.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing[5],
                    padding: `${spacing[5]}px ${spacing[6]}px`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        ...textStyle("headline"),
                        color: colors.ink,
                        display: "flex",
                        alignItems: "center",
                        gap: spacing[3],
                      }}
                    >
                      {role.name}
                      {role.locked ? <Badge tone="neutral">Fixed</Badge> : null}
                    </div>
                    <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      {role.description || "No description"}
                    </div>
                  </div>
                  <div style={{ minWidth: 190 }}>
                    <div style={{ ...textStyle("body"), color: colors.ink }}>
                      {roleSummary(role)}
                    </div>
                    <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      {count} {count === 1 ? "person" : "people"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
                    <IconButton
                      icon="edit"
                      label={role.locked ? `See what ${role.name} can do` : `Edit ${role.name}`}
                      onClick={() => openRole(role)}
                    />
                    {!role.locked ? (
                      <IconButton
                        icon="close"
                        label={`Remove ${role.name}`}
                        onClick={() =>
                          count > 0
                            ? setNotice(
                                `${count} ${count === 1 ? "person has" : "people have"} the ${role.name} role. Give them another role first.`,
                              )
                            : setRemoving(role)
                        }
                      />
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={userForm !== null} onClose={() => setUserForm(null)}>
        <form
          style={{ width: 460, maxWidth: "100%" }}
          onSubmit={(event) => {
            event.preventDefault();
            submitUser();
          }}
        >
          <div style={{ ...textStyle("title3"), color: colors.ink }}>
            {userForm === "new" ? "Add user" : "Edit user"}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[6],
              marginTop: spacing[6],
            }}
          >
            <FormField id="user-name" label="NAME" span={12}>
              <Input
                id="user-name"
                autoFocus
                autoComplete="off"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setUserError(null);
                }}
              />
            </FormField>
            <FormField id="user-email" label="EMAIL" span={12}>
              <Input
                id="user-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setUserError(null);
                }}
              />
            </FormField>
            <FormField id="user-phone" label="PHONE (OPTIONAL)" span={12}>
              <Input
                id="user-phone"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </FormField>
            <FormField id="user-role" label="ROLE" span={12}>
              <Select
                options={roles.map((role) => ({ value: role.id, label: role.name }))}
                value={roleId}
                placeholder="Choose a role"
                searchable={false}
                aria-label="Role"
                onChange={(next) => {
                  setRoleId(next);
                  setUserError(null);
                }}
              />
              {roleId ? (
                <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  {getRole(roleId)?.description}
                </span>
              ) : null}
            </FormField>
            {userError ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {userError}
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={() => setUserForm(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {userForm === "new" ? "Add user" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={roleForm !== null} onClose={() => setRoleForm(null)}>
        <form
          style={{ width: 560, maxWidth: "100%" }}
          onSubmit={(event) => {
            event.preventDefault();
            if (roleForm !== "new" && roleForm?.locked) setRoleForm(null);
            else submitRole();
          }}
        >
          <div style={{ ...textStyle("title3"), color: colors.ink }}>
            {roleForm === "new"
              ? "Add role"
              : roleForm?.locked
                ? `${roleForm.name} role`
                : "Edit role"}
          </div>
          {roleForm !== "new" && roleForm?.locked ? (
            <div
              style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}
            >
              The Owner can do everything and can&apos;t be changed.
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[5],
              marginTop: spacing[6],
            }}
          >
            <FormField id="role-name" label="NAME" span={12}>
              <Input
                id="role-name"
                autoFocus
                autoComplete="off"
                placeholder="e.g. Store helper"
                value={roleName}
                disabled={roleForm !== "new" && roleForm?.locked}
                onChange={(event) => {
                  setRoleName(event.target.value);
                  setRoleError(null);
                }}
              />
            </FormField>
            <FormField id="role-note" label="DESCRIPTION (OPTIONAL)" span={12}>
              <Input
                id="role-note"
                autoComplete="off"
                value={roleNote}
                disabled={roleForm !== "new" && roleForm?.locked}
                onChange={(event) => setRoleNote(event.target.value)}
              />
            </FormField>

            <div>
              <div
                style={{
                  ...textStyle("caption"),
                  color: colors.inkMuted,
                  textTransform: "uppercase",
                  marginBottom: spacing[3],
                }}
              >
                What this role can do
              </div>
              <div
                style={{
                  maxHeight: 340,
                  overflowY: "auto",
                  borderTop: `1px solid ${colors.border}`,
                }}
              >
                {PERMISSION_AREAS.map((area) => (
                  <div
                    key={area.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) 200px",
                      alignItems: "center",
                      columnGap: spacing[4],
                      minHeight: 60,
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                  >
                    <div>
                      <div style={{ ...textStyle("body"), color: colors.ink }}>{area.label}</div>
                      <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                        {area.note}
                      </div>
                    </div>
                    <Select
                      options={ACCESS_OPTIONS}
                      value={permissions[area.id]}
                      searchable={false}
                      disabled={roleForm !== "new" && roleForm?.locked}
                      aria-label={`${area.label} access`}
                      onChange={(next) =>
                        setPermissions((current) => ({
                          ...current,
                          [area.id]: next as AccessLevel,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {roleError ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {roleError}
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={() => setRoleForm(null)}>
              {roleForm !== "new" && roleForm?.locked ? "Close" : "Cancel"}
            </Button>
            {roleForm === "new" || (roleForm && !roleForm.locked) ? (
              <Button type="submit" variant="primary">
                {roleForm === "new" ? "Add role" : "Save changes"}
              </Button>
            ) : null}
          </div>
        </form>
      </Modal>

      <Modal open={removing !== null} onClose={() => setRemoving(null)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Remove {removing?.name}?</div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            No one has this role, so nobody loses access.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                const problem = removing ? removeRole(removing.id) : null;
                if (problem) setNotice(problem);
                setRemoving(null);
                reload();
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
