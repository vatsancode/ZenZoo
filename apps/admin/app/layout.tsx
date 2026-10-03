import { ThemeProvider } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { ThemedBody } from "./ThemedBody";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "ZenZoo Admin",
  description: "ZenZoo admin console",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <ThemeProvider>
          <ThemedBody>{children}</ThemedBody>
        </ThemeProvider>
      </body>
    </html>
  );
}
