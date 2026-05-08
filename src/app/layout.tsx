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
  title: "Open Vault — Ethereum DeFi Vaults",
  description:
    "Discover, deposit and manage Ethereum DeFi vaults across Aave, Compound, Morpho and more.",
  openGraph: {
    title: "Open Vault — Ethereum DeFi Vaults",
    description:
      "Discover, deposit and manage Ethereum DeFi vaults across Aave, Compound, Morpho and more.",
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
