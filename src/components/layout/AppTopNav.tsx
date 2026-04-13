"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { HiOutlineMenu } from "react-icons/hi";
import { FaMoon, FaSun } from "react-icons/fa";
import { useTheme } from "next-themes";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface AppTopNavProps {
  onMenuClick: () => void;
}

export function AppTopNav({ onMenuClick }: AppTopNavProps) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-[#F2F2F2] bg-white px-4 dark:border-zinc-800 dark:bg-[#0F1116] sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#F2F2F2] text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 lg:hidden"
          aria-label="Open menu"
        >
          <HiOutlineMenu className="h-5 w-5" />
        </button>
        <Link
          href="/"
          className="mt-0 flex min-w-0 shrink-0 items-center gap-2 px-1 text-zinc-900 dark:text-zinc-100"
        >
          <span className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-zinc-300 bg-white shadow-sm transition-colors dark:border-zinc-600 dark:bg-white">
            <Image
              src="/assets/images/open-icon.svg"
              alt="Open Yield logo"
              width={20}
              height={20}
              className="h-6 w-6 object-contain"
              priority
            />
          </span>
          <span className="truncate text-base font-bold leading-none tracking-tight text-[#0F172A] dark:text-zinc-100 sm:text-lg">
            Open Yield
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {mounted ? (
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E1E5E1] bg-[#F1F2F0] text-zinc-700 transition hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {resolvedTheme === "dark" ? (
              <FaSun className="h-4 w-4" />
            ) : (
              <FaMoon className="h-4 w-4" />
            )}
          </button>
        ) : (
          <div className="h-9 w-9 rounded-md border border-[#E1E5E1] bg-[#F1F2F0] dark:border-zinc-700 dark:bg-zinc-900" />
        )}
        <span
          aria-hidden
          className="h-8 w-px bg-[#E5E7EB] dark:bg-zinc-700"
        />
        <button
          type="button"
          onClick={() => open()}
          className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 sm:px-4 sm:text-sm"
        >
          {isConnected && address ? shortenAddress(address) : "Connect Wallet"}
        </button>
      </div>
    </header>
  );
}
