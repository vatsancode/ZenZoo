import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, Input, textStyle } from "@zenzoo/ui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { signIn } from "../services/api/auth";

export default function SignInForm() {
  const { colors, spacing } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function handleSubmit() {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    }
  }

  return (
    <Card style={{ maxWidth: 360, width: "100%" }}>
      <Text style={[textStyle("title2"), { color: colors.ink, marginBottom: spacing[1] }]}>
        Sign in
      </Text>
      <Text style={[textStyle("callout"), { color: colors.inkMuted, marginBottom: spacing[6] }]}>
        Use your ZenZoo account email and password.
      </Text>

      <View style={{ gap: spacing[4] }}>
        <View style={{ gap: spacing[2] }}>
          <Text style={[textStyle("caption"), { color: colors.inkMuted }]}>EMAIL</Text>
          <Input
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@yourstore.com"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />
        </View>

        <View style={{ gap: spacing[2] }}>
          <Text style={[textStyle("caption"), { color: colors.inkMuted }]}>PASSWORD</Text>
          <Input
            secureTextEntry
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            editable={!loading}
            invalid={!!error}
          />
        </View>

        {error ? (
          <Text style={[textStyle("callout"), { color: colors.danger }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button
          label="Sign in"
          variant="primary"
          loading={loading}
          disabled={!canSubmit}
          onPress={handleSubmit}
        />
      </View>
    </Card>
  );
}
