import type { ReactNode } from "react";
import { AccessProvider } from "../lib/access";
import AccessGate from "./AccessGate";
import NetworkErrorBanner from "./NetworkErrorBanner";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <AccessProvider>
      <NetworkErrorBanner />
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0 }}>
          <AccessGate>{children}</AccessGate>
        </div>
      </div>
    </AccessProvider>
  );
}
