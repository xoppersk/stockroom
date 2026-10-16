import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/components.css";
import { ShopProvider } from "@/lib/store";

/* Archivo WITH the width axis (HANDOVER §3/§12): wdth 62..125, wght 400..800.
   next/font/google: omitting `weight` loads the full variable range;
   axes:["wdth"] adds the width axis so font-stretch works. */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Stockroom — Larder & Loom",
  description: "Operations console and storefront for Larder & Loom.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>
        <ShopProvider>{children}</ShopProvider>
      </body>
    </html>
  );
}
