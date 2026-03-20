import type { Metadata } from "next";
import "@carbon/styles/css/styles.css";
import "./globals.scss";
import { ContextProvider } from "@/context";

export const metadata: Metadata = {
  title: "VaultAgent — Ethereum DeFi Vaults",
  description:
    "Discover, deposit and manage Ethereum DeFi vaults across Aave, Compound, Morpho and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* cds--g100 applies Carbon's dark theme token set globally */}
      <body className="cds--g100">
        <ContextProvider>{children}</ContextProvider>
      </body>
    </html>
  );
}
