import { useTheme } from "@zenzoo/design-tokens";
import { TextInput, type TextInputProps } from "react-native";
import { textStyle } from "../internal/textStyle";

export interface InputProps extends TextInputProps {
  invalid?: boolean;
}

export function Input({ style, placeholderTextColor, invalid, editable, ...props }: InputProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <TextInput
      {...props}
      editable={editable}
      placeholderTextColor={placeholderTextColor ?? colors.inkFaint}
      style={[
        textStyle("body"),
        {
          height: 44,
          paddingHorizontal: spacing[4],
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: invalid ? colors.danger : "transparent",
          color: editable === false ? colors.inkFaint : colors.ink,
          backgroundColor: colors.surfaceSunken,
        },
        style,
      ]}
    />
  );
}
