import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.tailwind.css";
import "./globals.scss";
import { ContextProvider } from "@/context";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Open Yield — Ethereum DeFi Vaults",
  description:
    "Discover, deposit and manage Ethereum DeFi vaults across Aave, Compound, Morpho and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      {/* cds--g100 applies Carbon's dark theme token set globally */}
      <body className="font-sans antialiased">
        <ContextProvider>{children}</ContextProvider>
      </body>
    </html>
  );
}
