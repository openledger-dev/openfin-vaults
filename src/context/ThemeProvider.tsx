"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode;
  /** CSP nonce from middleware (x-nonce) — required for next-themes inline script */
  nonce?: string;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      themes={["light", "dark"]}
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
}
