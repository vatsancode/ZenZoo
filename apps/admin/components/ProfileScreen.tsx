"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, Input, Notice, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  CURRENT_USER_ID,
  MIN_PASSWORD_LENGTH,
  PERMISSION_AREAS,
  ACCESS_LABEL,
  changePassword,
  getRole,
  getUser,
  updateProfile,
  type User,
} from "../features/settings/users";
import FormField from "./FormField";
import PageHeader from "./PageHeader";

/** The signed-in person's own details, what their role allows, and a way to change their password. */
export default function ProfileScreen() {
  const { colors, spacing } = useTheme();
  const [me, setMe] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser(CURRENT_USER_ID) ?? null;
    setMe(user);
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setPhone(user.phone ?? "");
    }
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!me) {
    return (
      <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>Loading profile...</div>
    );
  }

  const role = getRole(me.roleId);
  const unchanged =
    name.trim() === me.name && email.trim() === me.email && phone.trim() === (me.phone ?? "");

  function saveProfile() {
    const problem = updateProfile({ name, email, phone });
    if (problem) {
      setProfileError(problem);
      return;
    }
    setMe(getUser(CURRENT_USER_ID) ?? null);
    setNotice("Your details are saved.");
  }

  function savePassword() {
    const problem = changePassword(current, next, confirm);
    if (problem) {
      setPasswordError(problem);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setNotice("Your password is changed.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="My profile"
        subtitle={`${me.email}${role ? ` · ${role.name}` : ""}`}
        backHref="/"
        backLabel="Back"
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: spacing[6],
          alignItems: "start",
        }}
      >
        <Card>
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Your details</div>
          <form
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[6],
              marginTop: spacing[6],
            }}
            onSubmit={(event) => {
              event.preventDefault();
              saveProfile();
            }}
          >
            <FormField id="profile-name" label="NAME" span={12}>
              <Input
                id="profile-name"
                autoComplete="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setProfileError(null);
                }}
              />
            </FormField>
            <FormField id="profile-email" label="EMAIL" span={12}>
              <Input
                id="profile-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setProfileError(null);
                }}
              />
            </FormField>
            <FormField id="profile-phone" label="PHONE (OPTIONAL)" span={12}>
              <Input
                id="profile-phone"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </FormField>
            {profileError ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {profileError}
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="primary" disabled={unchanged}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Change password</div>
          <form
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[6],
              marginTop: spacing[6],
            }}
            onSubmit={(event) => {
              event.preventDefault();
              savePassword();
            }}
          >
            <FormField id="password-current" label="CURRENT PASSWORD" span={12}>
              <Input
                id="password-current"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => {
                  setCurrent(event.target.value);
                  setPasswordError(null);
                }}
              />
            </FormField>
            <FormField id="password-new" label="NEW PASSWORD" span={12}>
              <Input
                id="password-new"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => {
                  setNext(event.target.value);
                  setPasswordError(null);
                }}
              />
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                At least {MIN_PASSWORD_LENGTH} characters, with letters and a number.
              </span>
            </FormField>
            <FormField id="password-confirm" label="CONFIRM NEW PASSWORD" span={12}>
              <Input
                id="password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => {
                  setConfirm(event.target.value);
                  setPasswordError(null);
                }}
              />
            </FormField>
            {passwordError ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {passwordError}
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                type="submit"
                variant="primary"
                disabled={current === "" && next === "" && confirm === ""}
              >
                Change password
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
          <div style={{ ...textStyle("headline"), color: colors.ink }}>What you can do</div>
          {role ? <Badge tone="neutral">{role.name}</Badge> : null}
        </div>
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
          Set by your role. Ask an owner if you need more access.
        </div>
        {role ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              columnGap: spacing[8],
              marginTop: spacing[5],
            }}
          >
            {PERMISSION_AREAS.map((area) => {
              const level = role.permissions[area.id];
              return (
                <div
                  key={area.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: spacing[3],
                    minHeight: 48,
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <span style={{ ...textStyle("body"), color: colors.ink }}>{area.label}</span>
                  <span
                    style={{
                      ...textStyle("footnote"),
                      color: level === "none" ? colors.inkFaint : colors.inkMuted,
                    }}
                  >
                    {ACCESS_LABEL[level]}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
