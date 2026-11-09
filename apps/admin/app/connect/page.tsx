import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import ConnectConsent from "../../features/settings/ConnectConsent";

export const metadata: Metadata = {
  title: "Allow access - ZenZoo Admin",
};

/** Where Claude sends the person to approve a connection (see the API's /oauth/authorize). */
export default function ConnectPage() {
  return (
    <main style={{ padding: spacing[10], display: "flex", justifyContent: "center" }}>
      <ConnectConsent />
    </main>
  );
}
