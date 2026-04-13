"use client";

import Link from "next/link";
import Image from "next/image";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function AppTopNav() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between !border-b !border-[#F2F2F2] bg-white px-6 lg:px-8">
      <Link
        href="/"
        className="mt-0 flex shrink-0 items-center gap-2 px-1 text-zinc-900"
      >
        <span className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-gray-200 transition-colors">
          <Image
            src="/assets/images/open-icon.svg"
            alt="Open Yield logo"
            width={20}
            height={20}
            className="h-6 w-6 object-contain"
            priority
          />
        </span>
        <span className="text-lg font-bold tracking-tight leading-none text-[#0F172A]">
          Open Yield
        </span>
      </Link>

      <button
        type="button"
        onClick={() => open()}
        className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        {isConnected && address ? shortenAddress(address) : "Connect Wallet"}
      </button>
    </header>
  );
}
