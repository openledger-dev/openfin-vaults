"use client";

import React from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import type { VaultOnChainData } from "@/hooks/useVaultData";

interface UserPositionsPanelProps {
  vaults: VaultOnChainData[];
  isLoading: boolean;
}

function formatBigIntAsset(
  raw: bigint | undefined,
  decimals: number,
  symbol: string | undefined
): string {
  if (raw === undefined) return "—";
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4);
  const num = parseFloat(`${whole}.${fracStr}`);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(4)}M${symbol ? ` ${symbol}` : ""}`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(4)}K${symbol ? ` ${symbol}` : ""}`;
  return `${num.toFixed(4)}${symbol ? ` ${symbol}` : ""}`;
}

export function UserPositionsPanel({ vaults, isLoading }: UserPositionsPanelProps) {
  const { isConnected } = useAppKitAccount();

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-dashed border-[#E1E5E1] bg-[#F1F2F0] p-8 text-center">
        <p className="text-sm text-zinc-500">Connect your wallet to view your positions</p>
      </div>
    );
  }

  const activePositions = vaults.filter(
    (v) => v.userShares !== undefined && v.userShares > BigInt(0)
  );

  const totalActiveCount = activePositions.length;

  return (
    <div>
      <h3 className="mb-4 text-base font-semibold tracking-wide text-zinc-900">Your Portfolio</h3>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            label: "Active Positions",
            value: isLoading ? null : String(totalActiveCount),
            color: "#f4f4f4",
          },
          {
            label: "Vaults Deposited",
            value: isLoading ? null : String(totalActiveCount),
            color: "#4589ff",
          },
          {
            label: "Wallet Status",
            value: "Connected",
            color: "#42be65",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] px-6 py-5"
          >
            <p className="mb-2 text-xs uppercase tracking-[0.06em] text-zinc-500">{item.label}</p>
            {item.value === null ? (
              <div className="h-6 w-10 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            ) : (
              <p className="text-2xl font-bold" style={{ color: item.color }}>
                {item.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading your on-chain positions...</p>
      ) : activePositions.length > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.06em] text-zinc-500">Active Positions</p>
          <div className="flex flex-col gap-2">
            {activePositions.map((vault) => {
              const assetDec = vault.assetDecimals ?? 18;
              return (
                <div
                  key={vault.address}
                  className="flex flex-col gap-4 rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{vault.name}</p>
                    <p className="font-mono text-xs text-zinc-500">
                      {vault.address.slice(0, 6)}…{vault.address.slice(-4)}
                    </p>
                  </div>

                  <div className="flex w-full flex-wrap items-center gap-6 md:w-auto md:justify-end md:gap-12">
                    <div className="text-left md:text-right">
                      <p className="text-xs text-zinc-500">Shares</p>
                      <p className="text-sm font-semibold text-zinc-900">
                        {formatBigIntAsset(vault.userShares, vault.decimals, vault.symbol)}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-xs text-zinc-500">Asset Value</p>
                      <p className="text-sm font-semibold text-blue-700">
                        {formatBigIntAsset(vault.userAssetsRaw, assetDec, vault.assetSymbol)}
                      </p>
                    </div>
                    <div className="flex items-end gap-2">
                      <span
                        className={
                          "rounded-md border px-2 py-0.5 text-[11px] font-semibold " +
                          (vault.isPaused
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700")
                        }
                      >
                        {vault.isPaused ? "Paused" : "Active"}
                      </span>
                      <span
                        className="rounded-md border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700"
                      >
                        {vault.kind === "morpho" ? "Morpho" : vault.kind === "midas" ? "Midas" : "UltraYield"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No vault positions found for this wallet.</p>
      )}
    </div>
  );
}
