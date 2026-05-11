"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useVaultData } from "@/hooks/useVaultData";
import { VAULT_PLATFORMS } from "@/lib/vaultConfig";
import { getChainName } from "@/lib/chains";
import type { MidasPendingRedemption } from "@/lib/midasApi";
import type { VaultOnChainData } from "@/hooks/useVaultData";

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtAsset(raw: bigint | undefined, dec: number, sym?: string): string {
  if (raw === undefined) return "—";
  const n = parseFloat(formatUnits(raw, dec));
  const suffix = sym ? ` ${sym}` : "";
  if (n === 0) return `0.00${suffix}`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(4)}B${suffix}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(4)}M${suffix}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(4)}K${suffix}`;
  if (n >= 0.01) return `${n.toFixed(4)}${suffix}`;
  // For small values (BTC-denominated etc.) show 2 significant figures beyond the
  // leading zeros so the amount is always visible rather than displaying as "0.0000".
  const dp = Math.min(Math.max(6, Math.ceil(-Math.log10(n)) + 2), 12);
  return `${n.toFixed(dp)}${suffix}`;
}

function fmtApy(apy: number | null): string | null {
  if (apy === null) return null;
  const pct = apy * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

// ── Position card ─────────────────────────────────────────────────────────────

function PositionCard({ vault, onClick }: { vault: VaultOnChainData; onClick: () => void }) {
  const assetDec = vault.assetDecimals ?? 18;
  const kindLabel = vault.kind === "morpho" ? "Morpho" : vault.kind === "midas" ? "Midas" : "UltraYield";
  const apyPct = vault.apyPrefetched !== null ? vault.apyPrefetched * 100 : null;
  const apyStr = fmtApy(vault.apyPrefetched);
  const apyPositive = apyPct === null || apyPct >= 0;

  return (
    <div
      className="flex cursor-pointer flex-col gap-4 rounded-xl border border-[#e1e5e1] border-l-[0.1875rem] border-l-green-600 bg-[#f1f2f0] p-4 transition-colors dark:border-[#1b1b1f] dark:bg-[#141417] md:flex-row md:items-center md:justify-between md:gap-6 md:p-5 dark:hover:border-l-[#16a34a]"
      // onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderLeftColor = "#15803d"; }}
      // onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderLeftColor = "#16a34a"; }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Vault identity */}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
          <p className="text-[0.9375rem] font-bold leading-[1.3] text-zinc-900 dark:text-zinc-100">
            {vault.name}
          </p>
          {apyStr && (
            <span className={`rounded border px-2 py-0.5 text-xs font-bold ${
              apyPositive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
            }`}>
              {apyStr} APY
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {vault.address.slice(0, 6)}…{vault.address.slice(-4)}
          </span>
          <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-zinc-700 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff]">
            {kindLabel}
          </span>
          <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-zinc-700 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff]">
            {getChainName(vault.chainId)}
          </span>
          <span
            className={
              "rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-semibold dark:border-opacity-70 " +
              (vault.isPaused
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300")
            }
          >
            {vault.isPaused ? "Paused" : "Active"}
          </span>
        </div>
      </div>

      {/* Position metrics */}
      <div className="flex w-full flex-wrap items-center gap-6 md:w-auto md:justify-end md:gap-10">
        <div className="text-left md:text-right">
          <p className="mb-1 text-[0.65rem] uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
            Shares held
          </p>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            {fmtAsset(vault.userShares, vault.decimals, vault.symbol)}
          </p>
        </div>
        <div className="text-left md:text-right">
          <p className="mb-1 text-[0.65rem] uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
            Current value
          </p>
          <p className="text-xl font-bold leading-[1.2] text-zinc-900 dark:text-zinc-100">
            {fmtAsset(vault.userAssetsRaw, assetDec, vault.assetSymbol)}
          </p>
        </div>
      </div>

      {/* Arrow */}
      <span className="self-end text-base text-zinc-500 dark:text-zinc-400 md:self-auto">→</span>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = "#f4f4f4", loading }: {
  label: string; value: string; color?: string; loading: boolean;
}) {
  const valueColorClass =
    color === "#111827"
      ? "text-gray-900 dark:text-zinc-100"
      : color === "#a16207"
        ? "text-amber-700 dark:text-amber-300"
        : color === "#71717a"
          ? "text-zinc-500 dark:text-zinc-400"
          : "text-zinc-900 dark:text-zinc-100";

  return (
    <div className="rounded-xl border border-[#e1e5e1] bg-[#f1f2f0] p-3 dark:border-[#1b1b1f] dark:bg-[#141417] sm:p-5">
      <p className="mb-2 text-[0.7rem] uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      {loading
        ? (
          <div className="h-8 w-20 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" />
        )
        : <p className={`text-[1.75rem] font-bold ${valueColorClass}`}>{value}</p>
      }
    </div>
  );
}

// ── Pending withdrawal card ───────────────────────────────────────────────────

type PendingItem =
  | { type: "ultrayield-pending";   vault: VaultOnChainData; shares: bigint; requestTime: bigint }
  | { type: "ultrayield-claimable"; vault: VaultOnChainData; assets: bigint; shares: bigint }
  | { type: "midas";                vault: VaultOnChainData; redemption: MidasPendingRedemption };

function PendingCard({ item, onClick }: { item: PendingItem; onClick: () => void }) {
  const kindLabel    = item.vault.kind === "midas" ? "Midas" : "UltraYield";
  const isClaimable  = item.type === "ultrayield-claimable";

  let statusLabel: string;
  let amountLabel: string;
  let subLabel: string;

  if (item.type === "ultrayield-pending") {
    statusLabel = "Pending";
    amountLabel = `${parseFloat(formatUnits(item.shares, item.vault.decimals)).toFixed(6)} ${item.vault.symbol}`;
    const elapsed  = Math.floor((Date.now() / 1_000) - Number(item.requestTime));
    const hoursAgo = Math.floor(elapsed / 3_600);
    subLabel = `Requested ${hoursAgo}h ago · fulfilled within 72h of request`;
  } else if (item.type === "ultrayield-claimable") {
    statusLabel = "Ready to Claim";
    const assetDec = item.vault.assetDecimals ?? 18;
    amountLabel = `${parseFloat(formatUnits(item.assets, assetDec)).toFixed(6)} ${item.vault.assetSymbol ?? ""}`;
    subLabel = "Operator has fulfilled your request — visit the vault to claim";
  } else {
    statusLabel = "Async Pending";
    const raw = item.redemption.amount ? BigInt(item.redemption.amount) : undefined;
    amountLabel = raw !== undefined
      ? `${parseFloat(formatUnits(raw, 18)).toFixed(6)} ${item.vault.symbol}`
      : "—";
    const ts = item.redemption.createdAt ? new Date(item.redemption.createdAt).toLocaleString() : null;
    subLabel = ts ? `Requested ${ts} · processed in order` : "Processing in order · no cancellation";
  }

  return (
    <div
      className={
        "flex cursor-pointer flex-col gap-4 rounded-xl border border-l-[0.1875rem] p-4 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6 " +
        (isClaimable
          ? "border-emerald-300 bg-emerald-50/90 dark:border-emerald-800 dark:bg-emerald-900/25"
          : "border-amber-300 bg-amber-50/90 dark:border-amber-800 dark:bg-amber-900/20")
      }
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span
            className={
              "rounded border px-1.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.05em] " +
              (isClaimable
                ? "border-emerald-700 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300"
                : "border-amber-700 text-amber-700 dark:border-amber-400 dark:text-amber-300")
            }
          >
            {statusLabel}
          </span>
          <span className="text-[0.9375rem] font-semibold text-zinc-900 dark:text-zinc-100">{item.vault.name}</span>
          <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-zinc-700 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff]">
            {kindLabel}
          </span>
          <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-zinc-700 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff]">
            {getChainName(item.vault.chainId)}
          </span>
        </div>
        <p
          className={
            "mb-1 text-[0.9375rem] font-bold " +
            (isClaimable ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")
          }
        >
          {amountLabel}
        </p>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">{subLabel}</p>
      </div>
      <span className="self-end text-base text-zinc-500 dark:text-zinc-400 md:self-auto">→</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { address: userAddress, isConnected, isReconnecting, isConnecting } = useAccount();
  const { open } = useAppKit();
  const { vaults, isLoading } = useVaultData(VAULT_PLATFORMS, userAddress);
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const walletPending = !mounted || isReconnecting || isConnecting;

  const positions = vaults.filter(
    (v) => v.userShares !== undefined && v.userShares > BigInt(0)
  );

  // ── Midas async pending redemptions (one API call per Midas position) ──────
  const midasPositions = vaults.filter((v) => v.kind === "midas");
  const midasPendingQueries = useQueries({
    queries: midasPositions.map((v) => ({
      queryKey: ["midasPendingPortfolio", v.chainId, v.address, userAddress],
      enabled: !!userAddress && !!v.address,
      staleTime: 60 * 1_000,
      gcTime:    5 * 60 * 1_000,
      // Re-fetch when the user returns to this tab (e.g. after submitting on detail page)
      refetchOnWindowFocus: true,
      queryFn: async () => {
        const params = new URLSearchParams({
          chainId: String(v.chainId),
          token: v.address,
          ...(userAddress ? { address: userAddress } : {}),
        });
        const res = await fetch(`/api/midas/pending?${params}`);
        if (!res.ok) return [] as MidasPendingRedemption[];
        return res.json() as Promise<MidasPendingRedemption[]>;
      },
    })),
  });

  // ── Collate all pending items ─────────────────────────────────────────────
  const pendingItems: PendingItem[] = [
    // UltraYield pending requests
    ...vaults
      .filter((v) => v.kind === "ultrayield" && v.pendingShares !== undefined && v.pendingShares > BigInt(0))
      .map((v): PendingItem => ({
        type: "ultrayield-pending",
        vault: v,
        shares: v.pendingShares!,
        requestTime: v.pendingRequestTime ?? BigInt(0),
      })),
    // UltraYield ready-to-claim
    ...vaults
      .filter((v) => v.kind === "ultrayield" && v.claimableAssets !== undefined && v.claimableAssets > BigInt(0))
      .map((v): PendingItem => ({
        type: "ultrayield-claimable",
        vault: v,
        assets: v.claimableAssets!,
        shares: v.claimableShares ?? BigInt(0),
      })),
    // Midas async redemptions
    ...midasPositions.flatMap((v, i): PendingItem[] => {
      const data = midasPendingQueries[i]?.data ?? [];
      return data.map((r) => ({ type: "midas" as const, vault: v, redemption: r }));
    }),
  ];

  const networkCount  = new Set(positions.map((p) => p.chainId)).size;
  const protocolCount = new Set(positions.map((p) => p.kind)).size;

  const skeletonCards = (
    <>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[#e1e5e1] bg-[#f1f2f0] px-6 py-5 dark:border-[#1b1b1f] dark:bg-[#141417]"
          >
            <div className="mb-3 h-3 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-8 w-24 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[#e1e5e1] bg-[#f1f2f0] px-8 py-6 dark:border-[#1b1b1f] dark:bg-[#141417]"
          >
            <div className="space-y-2">
              <div className="h-3 w-[85%] animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-3 w-[70%] animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="min-h-full bg-white dark:bg-[#000000]">
        <div className="mx-auto w-full p-4 lg:p-6">

          {/* Page header */}
          <div className="mb-8">
            <h1 className="m-0 text-[1.75rem] font-bold text-zinc-900 dark:text-zinc-100">
              Portfolio
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              Your on-chain positions across all supported vaults
            </p>
          </div>

          {(walletPending || (isConnected && isLoading)) ? skeletonCards

          : !isConnected ? (
            <div className="rounded-xl border border-dashed border-[#e1e5e1] bg-[#f1f2f0] px-4 py-12 text-center dark:border-[#1b1b1f] dark:bg-[#141417]">
              <p className="mb-6 text-base text-zinc-500 dark:text-zinc-400">
                Connect your wallet to view your portfolio
              </p>
              <button
                type="button" onClick={() => open()}
                className="rounded-lg bg-zinc-900 px-8 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Connect Wallet
              </button>
            </div>

          ) : (
            <>
              {/* Summary stats */}
              <div className="mb-8 grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
                <StatCard label="Active Positions"    value={String(positions.length)}   color="#111827" loading={false} />
                <StatCard label="Pending Withdrawals" value={String(pendingItems.length)} color={pendingItems.length > 0 ? "#a16207" : "#71717a"} loading={false} />
                <StatCard label="Networks"            value={String(networkCount)}        color="#111827" loading={false} />
                <StatCard label="Protocols"           value={String(protocolCount)}       color="#111827" loading={false} />
              </div>

              {/* ── Active Positions ── */}
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
                Active Positions
              </h2>
              {positions.length === 0 ? (
                <div className="mb-8 rounded-xl border border-dashed border-[#e1e5e1] bg-[#f1f2f0] px-8 py-16 text-center dark:border-[#1b1b1f] dark:bg-[#141417]">
                  <p className="mb-2 text-[0.9375rem] text-zinc-600 dark:text-zinc-300">
                    No vault positions found for this wallet.
                  </p>
                  <p className="mb-6 text-[0.8rem] text-zinc-500 dark:text-zinc-400">
                    Deposit into a vault to see your position here.
                  </p>
                  <button
                    type="button" onClick={() => router.push("/")}
                    className="rounded-lg border border-[#e1e5e1] bg-transparent px-6 py-2.5 text-sm text-zinc-900 transition hover:bg-zinc-100 dark:border-[#1b1b1f] dark:text-[#ffffff] dark:hover:bg-[#27272b]"
                  >
                    Browse Vaults →
                  </button>
                </div>
              ) : (
                <div className="mb-10 flex flex-col gap-3">
                  {positions.map((vault) => (
                    <PositionCard
                      key={vault.address}
                      vault={vault}
                      onClick={() => router.push(`/vaults/${vault.address}`)}
                    />
                  ))}
                </div>
              )}

              {/* ── Pending Withdrawals ── */}
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
                Pending Withdrawals
              </h2>
              {pendingItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#e1e5e1] bg-[#f1f2f0] p-8 text-center dark:border-[#1b1b1f] dark:bg-[#141417]">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No pending withdrawal requests.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {pendingItems.map((item, idx) => (
                    <PendingCard
                      key={idx}
                      item={item}
                      onClick={() => router.push(`/vaults/${item.vault.address}`)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

        </div>
    </div>
  );
}
