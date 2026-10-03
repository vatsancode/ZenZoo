import { colors, spacing } from "@zenzoo/design-tokens";
import { FlatList, View, StyleSheet, type FlatListProps } from "react-native";

export type ListProps<Item> = Omit<FlatListProps<Item>, "ItemSeparatorComponent">;

export function List<Item>(props: ListProps<Item>) {
  return (
    <FlatList
      {...props}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={[styles.content, props.contentContainerStyle]}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing[1],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
