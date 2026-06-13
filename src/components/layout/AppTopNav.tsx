"use client";

import { useHydrated } from "@/hooks/useHydrated";
import Link from "next/link";
import Image from "next/image";
import { useAppKit, useAppKitAccount, useAppKitState } from "@reown/appkit/react";
import { HiOutlineMenu, HiOutlineMoon, HiOutlineSun } from "react-icons/hi";
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { initialized, loading } = useAppKitState()
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const walletBtnClass =
    "shrink-0 rounded-md border px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm " +
    (isConnected
      ? "border-[#E1E5E1] bg-[#F1F2F0] text-zinc-900 hover:bg-[#E9ECE8] dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff] dark:hover:bg-[#1a1a1f]"
      : "border-[#E1E5E1] bg-[#F1F2F0] text-zinc-900 hover:bg-[#E9ECE8] dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff] dark:hover:bg-[#1a1a1f]");

  const showSkeleton = !hydrated || !initialized;

  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-[#F2F2F2] bg-white px-4 dark:border-[#1b1b1f] dark:bg-[#000000] sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#F2F2F2] text-zinc-700 transition hover:bg-zinc-100 dark:border-[#1b1b1f] dark:text-[#ffffff] dark:hover:bg-[#141417] xl:hidden"
          aria-label="Open menu"
        >
          <HiOutlineMenu className="h-5 w-5" />
        </button>
        <Link
          href="/"
          className="mt-0 flex min-w-0 shrink-0 items-center gap-1 text-zinc-900 dark:text-[#ffffff]"
        >
          <span className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-zinc-300 bg-white shadow-sm transition-colors dark:border-[#2a2a2e] dark:bg-white">
            <Image
              src="/assets/images/open-icon.svg"
              alt="OpenFin logo"
              width={20}
              height={20}
              className="h-6 w-6 object-contain"
              priority
            />
          </span>
          <span className="truncate text-base font-bold leading-none tracking-tight text-[#0F172A] dark:text-[#ffffff] sm:text-lg">
            OpenFin
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {showSkeleton ? (
          <>
            <div className="h-8 w-8 rounded-full border border-[#E1E5E1] bg-[#F1F2F0] dark:border-[#1b1b1f] dark:bg-[#141417]" />
            <span
                aria-hidden
                className="h-8 w-px bg-[#E5E7EB] dark:bg-[#1b1b1f]"
              />
            <div className="h-9 min-w-[7.125rem] sm:min-w-[8.5rem] shrink-0 rounded-md border px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm border-[#E1E5E1] bg-[#F1F2F0] text-zinc-900 hover:bg-[#E9ECE8] dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff] dark:hover:bg-[#1a1a1f]" />
          </>
        ):(
          <>
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#F1F2F0] bg-[#F1F2F0] text-zinc-700 transition hover:bg-zinc-200 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff] dark:hover:bg-[#27272b]"
            >
              {resolvedTheme === "dark" ? (
                <HiOutlineSun className="h-5 w-5" />
              ) : (
                <HiOutlineMoon className="h-5 w-5" />
              )}
            </button>
              <span
                aria-hidden
                className="h-8 w-px bg-[#E5E7EB] dark:bg-[#1b1b1f]"
              />
              <button
                type="button"
                onClick={() => open()}
                className={walletBtnClass}
              >
                {isConnected && address ? shortenAddress(address) : "Connect Wallet"}
              </button>
          </>

        )}

      </div>
    </header>
  );
}
