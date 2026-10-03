import { useTheme } from "@zenzoo/design-tokens";
import { FlatList, View, StyleSheet, type FlatListProps } from "react-native";

export type ListProps<Item> = Omit<FlatListProps<Item>, "ItemSeparatorComponent">;

export function List<Item>(props: ListProps<Item>) {
  const { colors, radius, spacing, elevation } = useTheme();

  return (
    <FlatList
      {...props}
      ItemSeparatorComponent={() => (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      )}
      style={[
        {
          backgroundColor: colors.surfaceRaised,
          borderRadius: radius.xl,
          overflow: "hidden",
          ...elevation.sm.native,
        },
        props.style,
      ]}
      contentContainerStyle={[{ paddingVertical: spacing[1] }, props.contentContainerStyle]}
    />
  );
}
