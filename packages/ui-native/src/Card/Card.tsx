import { colors, elevation, radius, spacing } from "@zenzoo/design-tokens";
import { View, StyleSheet, type ViewProps } from "react-native";

export type CardProps = ViewProps;

export function Card({ style, ...props }: CardProps) {
  return <View {...props} style={[styles.base, style]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing[4],
    ...elevation.sm.native,
  },
});
