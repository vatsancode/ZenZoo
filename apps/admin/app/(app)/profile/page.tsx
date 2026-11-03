import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "My profile - ZenZoo Admin",
};

// Switched off for now. To bring the page back, render <ProfileScreen /> here
// (components/ProfileScreen.tsx is untouched) and relink it in components/Sidebar.tsx.
export default function ProfilePage() {
  notFound();
}
