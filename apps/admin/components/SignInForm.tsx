"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, Input, textStyle } from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signIn } from "../lib/auth";

export default function SignInForm() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(result.kind === "platform_admin" ? "/platform/tenants" : "/");
  }

  return (
    <Card style={{ maxWidth: 360, width: "100%" }}>
      <div style={{ ...textStyle("title2"), color: colors.ink, marginBottom: spacing[1] }}>
        Sign in
      </div>
      <p style={{ ...textStyle("callout"), color: colors.inkMuted, marginBottom: spacing[6] }}>
        Use your ZenZoo account email and password.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
            <label
              htmlFor="sign-in-email"
              style={{ ...textStyle("caption"), color: colors.inkMuted }}
            >
              EMAIL
            </label>
            <Input
              id="sign-in-email"
              type="email"
              autoComplete="email"
              placeholder="you@yourstore.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
            <label
              htmlFor="sign-in-password"
              style={{ ...textStyle("caption"), color: colors.inkMuted }}
            >
              PASSWORD
            </label>
            <Input
              id="sign-in-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              aria-invalid={error ? true : undefined}
            />
          </div>

          {error ? (
            <div style={{ ...textStyle("callout"), color: colors.danger }} role="alert">
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            style={{ marginTop: spacing[2] }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
