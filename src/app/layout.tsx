import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { ClientToaster } from "@/components/app/toaster";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

/**
 * Stockroom type system (Flagship UI Designs · System §01):
 * Archivo for headings/labels, IBM Plex Sans for body, IBM Plex Mono for
 * tabular numerals, SKUs, and order numbers. Self-hosted via next/font.
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Stockroom",
    template: "%s · Stockroom",
  },
  description: "Stockroom — inventory and order management for Juniper Supply Co.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        {/* Toasts (Flagship UI Designs §2.20): bottom-right desktop, top-center mobile. */}
        <ClientToaster />
      </body>
    </html>
  );
}
