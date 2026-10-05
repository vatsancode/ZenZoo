import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import ProfileScreen from "../../../components/ProfileScreen";

export const metadata: Metadata = {
  title: "My profile - ZenZoo Admin",
};

export default function ProfilePage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <ProfileScreen />
    </main>
  );
}
