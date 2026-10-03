import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import SignInForm from "../../components/SignInForm";

export const metadata: Metadata = {
  title: "Sign in - ZenZoo Admin",
};

export default function SignInPage() {
  return (
    <main style={{ padding: spacing[10], display: "flex", justifyContent: "center" }}>
      <SignInForm />
    </main>
  );
}
