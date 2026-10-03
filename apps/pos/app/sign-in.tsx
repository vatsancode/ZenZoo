import { useTheme } from "@zenzoo/design-tokens";
import SignInForm from "../components/SignInForm";
import { View } from "react-native";

export default function SignInScreen() {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing[6],
        backgroundColor: colors.surfaceCanvas,
      }}
    >
      <SignInForm />
    </View>
  );
}
