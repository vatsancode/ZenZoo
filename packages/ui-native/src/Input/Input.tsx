import { colors, radius, spacing, typography } from "@zenzoo/design-tokens";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";

export type InputProps = TextInputProps;

export function Input({ style, placeholderTextColor, ...props }: InputProps) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
      style={[styles.base, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    fontSize: typography.fontSize.sm,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
});
