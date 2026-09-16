import type { Metadata } from "next";
import "./globals.css";
import { BootstrapClient } from "@/components/bootstrap-client";

export const metadata: Metadata = {
  title: "SIMI Hub",
  description: "Portale amministrativo interno SIMI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <BootstrapClient />
        {children}
      </body>
    </html>
  );
}
