"use client";

import React from "react";
import {
  HiOutlineShieldCheck,
  HiOutlineCollection,
  HiOutlinePause,
  HiOutlineGlobeAlt,
} from "react-icons/hi";
import type { VaultOnChainData } from "@/hooks/useVaultData";

interface StatsBarProps {
  vaults: VaultOnChainData[];
  isLoading: boolean;
}

export function StatsBar({ vaults, isLoading }: StatsBarProps) {
  const totalVaults = vaults.length;
  const activeVaults = vaults.filter((v) => !v.isPaused).length;
  const pausedVaults = vaults.filter((v) => v.isPaused).length;

  const stats = [
    {
      label: "Total vaults",
      value: isLoading ? null : String(totalVaults),
      subtext: "Configured on-chain",
      icon: HiOutlineCollection,
    },
    {
      label: "Active vaults",
      value: isLoading ? null : String(activeVaults),
      subtext: "Accepting deposits",
      icon: HiOutlineShieldCheck,
    },
    {
      label: "Paused vaults",
      value: isLoading ? null : String(pausedVaults),
      subtext: "Deposits suspended",
      icon: HiOutlinePause,
    },
    {
      label: "Supported networks",
      value: "4",
      subtext: "ETH · ARB · Base · OP",
      icon: HiOutlineGlobeAlt,
    },
  ];

  return (
    
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-5 shadow-sm shadow-zinc-900/5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {stat.label}
                </p>
                {stat.value === null ? (
                  <div className="mb-1 mt-2 h-9 w-16 animate-pulse rounded-md bg-zinc-100" />
                ) : (
                  <p className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
                    {stat.value}
                  </p>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                  {stat.subtext}
                </p>
              </div>
            );
          })}
        </div>
  );
}
