import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-native";
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  const { colors, spacing } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceCanvas, gap: spacing[2] }]}>
      <Text style={[textStyle("title1"), { color: colors.ink }]}>ZenZoo POS</Text>
      <Text style={[textStyle("callout"), styles.subtitle, { color: colors.inkMuted }]}>
        Foundation is running. Product workflows are built feature by feature from here.
      </Text>
      <Link
        href="/style-guide"
        style={[textStyle("callout"), { color: colors.accent, marginTop: spacing[4] }]}
      >
        View the style guide &rarr;
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  subtitle: {
    textAlign: "center",
  },
});
