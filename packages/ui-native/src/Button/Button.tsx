import { useTheme, type ColorTokens } from "@zenzoo/design-tokens";
import {
  ActivityIndicator,
  Pressable,
  Text,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import { textStyle } from "../internal/textStyle";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends Omit<PressableProps, "style"> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
}

function fillStyle(
  variant: ButtonVariant,
  colors: ColorTokens,
): { container: ViewStyle; text: string } {
  switch (variant) {
    case "primary":
      return { container: { backgroundColor: colors.accent }, text: colors.onAccent };
    case "secondary":
      return { container: { backgroundColor: colors.surfaceSunken }, text: colors.ink };
    case "danger":
      return { container: { backgroundColor: colors.danger }, text: colors.onAccent };
  }
}

export function Button({ label, variant = "primary", loading, disabled, ...props }: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const fill = fillStyle(variant, colors);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height: 44,
          paddingHorizontal: spacing[6],
          borderRadius: radius.full,
          alignItems: "center",
          justifyContent: "center",
          opacity: isDisabled ? 0.4 : pressed ? 0.85 : 1,
        },
        fill.container,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fill.text} />
      ) : (
        <Text style={[textStyle("headline"), { color: fill.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}
