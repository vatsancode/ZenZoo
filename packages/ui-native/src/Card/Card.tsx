import { useTheme } from "@zenzoo/design-tokens";
import { View, type ViewProps } from "react-native";

export type CardProps = ViewProps;

export function Card({ style, ...props }: CardProps) {
  const { colors, radius, spacing, elevation } = useTheme();

  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: colors.surfaceRaised,
          borderRadius: radius.lg,
          padding: spacing[6],
          ...elevation.sm.native,
        },
        style,
      ]}
    />
  );
}
