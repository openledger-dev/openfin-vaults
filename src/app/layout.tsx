import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.tailwind.css";
import "./globals.scss";
import { ContextProvider } from "@/context";
import { ThemeProvider } from "@/context/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toaster";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Open Vault | Institutional Grade Crypto Yield & DeFi Vault Infrastructure",
  description:
    "Access institutional-grade crypto yield vaults for automated DeFi strategies, treasury management, liquidity allocation, and multi-asset on-chain yield generation through Open Vault powered by OpenFin.",
  openGraph: {
    title: "Open Vault | Institutional Grade Crypto Yield & DeFi Vault Infrastructure",
    description:
      "Access institutional-grade crypto yield vaults for automated DeFi strategies, treasury management, liquidity allocation, and multi-asset on-chain yield generation through Open Vault powered by OpenFin.",
    images: [
      {
        url: "https://cdn.openledger.xyz/OPENfin/OpenVault/og-image.png",
      },
    ],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="bg-white font-sans text-zinc-900 antialiased dark:bg-[#000000] dark:text-[#ffffff]">
        <ThemeProvider>
          <ContextProvider>
            <ToastProvider>{children}</ToastProvider>
          </ContextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
