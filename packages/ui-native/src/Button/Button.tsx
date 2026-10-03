import { colors, radius, spacing, typography } from "@zenzoo/design-tokens";
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from "react-native";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends Omit<PressableProps, "style"> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({ label, variant = "primary", loading, disabled, ...props }: ButtonProps) {
  const variantStyle = variantStyles[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      style={[styles.base, variantStyle.container, isDisabled && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.text.color} />
      ) : (
        <Text style={[styles.label, variantStyle.text]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});

const variantStyles: Record<
  ButtonVariant,
  {
    container: { backgroundColor: string; borderWidth?: number; borderColor?: string };
    text: { color: string };
  }
> = {
  primary: {
    container: { backgroundColor: colors.primary },
    text: { color: colors.textInverse },
  },
  secondary: {
    container: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    text: { color: colors.textPrimary },
  },
  danger: {
    container: { backgroundColor: colors.danger },
    text: { color: colors.textInverse },
  },
};
