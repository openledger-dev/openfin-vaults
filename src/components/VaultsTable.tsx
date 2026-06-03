"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { HiOutlineSearch } from "react-icons/hi";
import { VAULT_PLATFORMS } from "@/lib/vaultConfig";
import type { PlatformKind } from "@/lib/vaultConfig";
import { getChainShortName } from "@/lib/chains";
import type { VaultOnChainData } from "@/hooks/useVaultData";
import { use7dApy } from "@/hooks/use7dApy";
import { useSupportedAssets } from "@/hooks/useSupportedAssets";
import type { Vault } from "@/types/vault";
import { VaultActionModal } from "./VaultActionModal";
import { MorphoVaultActionModal } from "./MorphoVaultActionModal";
import { MidasVaultActionModal } from "./MidasVaultActionModal";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBigIntAsset(
  raw: bigint | undefined,
  decimals: number,
  symbol: string | undefined
): string {
  if (raw === undefined) return "—";
  const sym = symbol ? ` ${symbol}` : "";
  if (raw === BigInt(0)) return `0.00${sym}`;
  // Build exact decimal string to avoid float precision loss for large bigints
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracFull = frac.toString().padStart(decimals, "0");
  const num = parseFloat(`${whole}.${fracFull}`);
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B${sym}`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M${sym}`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K${sym}`;
  if (num >= 0.01) return `${num.toFixed(2)}${sym}`;
  // Tiny values: show enough significant digits so the number is non-zero
  const dp = Math.min(Math.max(2, Math.ceil(-Math.log10(num)) + 2), decimals);
  return `${num.toFixed(dp)}${sym}`;
}

/** Symbols we treat as USD-pegged — no USD sub-line needed for these. */
const STABLECOIN_SYMBOLS = new Set(["USDC", "USDT", "DAI", "USDS", "FRAX", "USD"]);

/** CoinGecko IDs for non-stablecoin asset symbols. */
const COINGECKO_ID: Record<string, string> = {
  WBTC: "bitcoin",
  CBBTC: "bitcoin",
  TBTC: "bitcoin",
  BTC: "bitcoin",
  WETH: "ethereum",
  ETH: "ethereum",
};

function fmtUsdCompact(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  if (usd >= 1_000_000)     return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000)         return `$${(usd / 1_000).toFixed(2)}K`;
  return `$${usd.toFixed(2)}`;
}

function fmtFloatAsset(num: number, sym: string | undefined): string {
  const s = sym ? ` ${sym}` : "";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B${s}`;
  if (num >= 1_000_000)     return `${(num / 1_000_000).toFixed(2)}M${s}`;
  if (num >= 1_000)         return `${(num / 1_000).toFixed(2)}K${s}`;
  if (num >= 0.0001)        return `${num.toFixed(4)}${s}`;
  const dp = Math.min(Math.max(4, Math.ceil(-Math.log10(num)) + 2), 18);
  return `${num.toFixed(dp)}${s}`;
}

/**
 * Returns the TVL display string and optional USD amount for a vault.
 *
 * Midas non-stablecoin vaults (e.g. mRe7BTC):
 *   The Midas price API returns USD/share, so totalAssets in the adapter is
 *   computed as USD × 10^assetDec — NOT a real native-token amount.
 *   We derive the true native amount as tvlUsd ÷ spotPrice instead.
 *
 * UltraYield / Morpho vaults:
 *   totalAssets comes directly from the contract (real native units).
 *   We estimate USD from totalAssets × spotPrice.
 */
function getTvlInfo(
  v: VaultOnChainData,
  tokenPrices: Record<string, number> | undefined
): { nativeStr: string; usdAmt: number | null } {
  const sym = v.assetSymbol?.toUpperCase() ?? "";
  const geckoId = COINGECKO_ID[sym];

  if (!STABLECOIN_SYMBOLS.has(sym) && geckoId) {
    // Midas: totalAssets is unreliable for non-stablecoin; derive from tvlUsd ÷ spot
    if (v.kind === "midas" && v.tvlUsd !== undefined) {
      const spotPrice = tokenPrices?.[geckoId];
      const nativeAmt = spotPrice ? v.tvlUsd / spotPrice : undefined;
      const nativeStr = nativeAmt !== undefined
        ? fmtFloatAsset(nativeAmt, v.assetSymbol)
        : v.tvlUsd !== undefined ? fmtUsdCompact(v.tvlUsd) : "—";
      return { nativeStr, usdAmt: v.tvlUsd };
    }

    // UltraYield / Morpho: totalAssets is on-chain native amount; compute USD from spot
    const spotPrice = tokenPrices?.[geckoId];
    if (spotPrice && v.totalAssets !== undefined) {
      const assetDec = v.assetDecimals ?? 18;
      const nativeFloat = Number(v.totalAssets) / 10 ** assetDec;
      const usdAmt = nativeFloat * spotPrice;
      const nativeStr = formatBigIntAsset(v.totalAssets, assetDec, v.assetSymbol);
      return { nativeStr, usdAmt };
    }
  }

  // Stablecoin or no price data — native amount already USD-denominated, no sub-line
  return {
    nativeStr: formatBigIntAsset(v.totalAssets, v.assetDecimals ?? 18, v.assetSymbol),
    usdAmt: null,
  };
}

/** Wallet shares or UltraYield pending / ready-to-claim exposure */
function vaultHasOpenPosition(v: VaultOnChainData): boolean {
  if (v.userShares !== undefined && v.userShares > BigInt(0)) return true;
  if (v.kind === "ultrayield") {
    const pend = v.pendingShares ?? BigInt(0);
    const claim = v.claimableAssets ?? BigInt(0);
    return pend > BigInt(0) || claim > BigInt(0);
  }
  return false;
}

/** Primary label for INVESTED pill — underlying value, pending shares, or claimable assets */
function vaultPositionAmountLabel(v: VaultOnChainData): string {
  if (v.userShares !== undefined && v.userShares > BigInt(0)) {
    return formatBigIntAsset(v.userAssetsRaw, v.assetDecimals ?? 18, v.assetSymbol);
  }
  if (v.kind === "ultrayield") {
    const pend = v.pendingShares ?? BigInt(0);
    if (pend > BigInt(0)) {
      return `${formatBigIntAsset(pend, v.decimals, v.symbol)} pending`;
    }
    const claim = v.claimableAssets ?? BigInt(0);
    if (claim > BigInt(0)) {
      return `${formatBigIntAsset(claim, v.assetDecimals ?? 18, v.assetSymbol)} claimable`;
    }
  }
  return "—";
}

function feePercent(raw: bigint | undefined): string {
  if (raw === undefined) return "—";
  const pct = (Number(raw) / 1e16).toFixed(2);
  return `${pct}%`;
}

function chainVaultToVault(v: VaultOnChainData): Vault {
  const decimals = v.assetDecimals ?? 18;
  return {
    id: v.address,
    address: v.address,
    kind: v.kind,
    platform: v.platformId,
    platformLabel: v.platformLabel,
    chainId: v.chainId,
    name: v.name,
    symbol: v.symbol,
    assetAddress: v.assetAddress,
    assetSymbol: v.assetSymbol ?? "—",
    assetDecimals: decimals,
    tvlFormatted: formatBigIntAsset(v.totalAssets, decimals, v.assetSymbol),
    totalAssets: v.totalAssets,
    performanceFeePercent:
      v.performanceFee !== undefined ? Number(v.performanceFee) / 1e16 : undefined,
    managementFeePercent:
      v.managementFee !== undefined ? Number(v.managementFee) / 1e16 : undefined,
    withdrawalFeePercent:
      v.withdrawalFee !== undefined ? Number(v.withdrawalFee) / 1e16 : undefined,
    status: v.isPaused ? "paused" : "active",
    contractAddress: v.address,
    depositVaultAddress: v.depositVaultAddress,
    redemptionVaultAddress: v.redemptionVaultAddress,
    midasApiKey: v.midasApiKey,
  };
}

function sectionGridTemplate(platformKind: PlatformKind, platformId: string): string {
  if (platformKind === "morpho") {
    return "minmax(220px,2fr) minmax(100px,1.2fr) minmax(88px,1fr) minmax(88px,1fr) minmax(88px,1fr) auto minmax(168px,1.1fr)";
  }
  if (platformId === "re7") {
    return "minmax(220px,2fr) minmax(100px,1.2fr) minmax(88px,1fr) minmax(88px,1fr) auto minmax(168px,1.1fr)";
  }
  return "minmax(220px,2fr) minmax(100px,1.2fr) minmax(88px,1fr) minmax(72px,0.9fr) minmax(72px,0.9fr) minmax(72px,0.9fr) auto minmax(168px,1.1fr)";
}

// ── Table headers — differ by platform kind ───────────────────────────────────

const STANDARD_HEADERS = [
  { key: "vault", header: "Vault / asset" },
  { key: "asset", header: "Asset" },
  { key: "tvl", header: "TVL" },
  { key: "apy", header: "7D APY" },
  { key: "perfFee", header: "Perf. fee" },
  { key: "mgmtFee", header: "Mgmt. fee" },
  { key: "status", header: "Status" },
  { key: "action", header: "" },
];

const MORPHO_HEADERS = [
  { key: "vault", header: "Vault / asset" },
  { key: "asset", header: "Asset" },
  { key: "tvl", header: "TVL" },
  { key: "apy", header: "7D net APY" },
  { key: "liquidity", header: "Liquidity" },
  { key: "status", header: "Status" },
  { key: "action", header: "" },
];

const RE7_HEADERS = [
  { key: "vault", header: "Vault / asset" },
  { key: "asset", header: "Asset" },
  { key: "tvl", header: "TVL" },
  { key: "apy", header: "7D APY" },
  { key: "status", header: "Status" },
  { key: "action", header: "" },
];

// ── Vault avatar (decorative) ────────────────────────────────────────────────

function VaultAvatar({ chainId }: { chainId: number }) {
  const chain = getChainShortName(chainId);
  const CHAIN_ICON_BY_ID: Record<number, string> = {
    1: "/assets/icons/chains/ethereum.svg",
    10: "/assets/icons/chains/optimism.svg",
    8453: "/assets/icons/chains/base.svg",
    42161: "/assets/icons/chains/arbitrum.svg",
    137: "/assets/icons/chains/polygon.svg",
    56: "/assets/icons/chains/bnb.svg",
    43114: "/assets/icons/chains/avalanche.svg",
  };
  const chainIconSrc = CHAIN_ICON_BY_ID[chainId] ?? "/assets/icons/chains/default.svg";
  return (
    <div className="shrink-0" title={chain}>
      <img
        src={chainIconSrc}
        alt={chain}
        className="h-11 w-11 rounded-full border border-zinc-200 object-cover dark:border-[#1b1b1f]"
        loading="lazy"
      />
    </div>
  );
}

// ── APY cells ─────────────────────────────────────────────────────────────────

function UltraYieldApyCell({ v }: { v: VaultOnChainData }) {
  const { apy, label, isLoading } = use7dApy(
    v.oracleAddress,
    v.address,
    v.assetAddress,
    v.chainId,
    v.ultrayieldApiSlug,
  );

  if (isLoading) return <div className="h-4 w-14 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />;
  if (apy === null) return <span className="text-sm text-zinc-400 dark:text-zinc-500">—</span>;

  const color = apy >= 0 ? "text-emerald-600" : "text-amber-600";
  return (
    <span className={`text-sm font-semibold ${color}`} title={label}>
      {apy >= 0 ? "+" : ""}
      {apy.toFixed(2)}%
    </span>
  );
}

function PrefetchedApyCell({ apy }: { apy: number | null }) {
  if (apy === null) return <span className="text-sm text-zinc-400 dark:text-zinc-500">—</span>;
  const pct = apy * 100;
  const color = pct >= 0 ? "text-emerald-600" : "text-amber-600";
  return (
    <span className={`text-sm font-semibold ${color}`}>
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

function ApyCell({ v }: { v: VaultOnChainData }) {
  if (v.kind === "ultrayield") return <UltraYieldApyCell v={v} />;
  return <PrefetchedApyCell apy={v.apyPrefetched} />;
}

// ── Supported-assets cell ─────────────────────────────────────────────────────

function SupportedAssetsCell({ v }: { v: VaultOnChainData }) {
  const { assets, isLoading } = useSupportedAssets(v.address);

  if (isLoading) return <div className="h-5 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />;

  if (assets.length === 0) {
    return (
      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{v.assetSymbol ?? "—"}</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {assets.map((a) => (
        <span
          key={a.address}
          title={a.address}
          className={
            "inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold " + "border-blue-100 bg-blue-50 text-blue-800 " + " dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
          }
        >
          {a.symbol}
        </span>
      ))}
    </div>
  );
}

// ── Skeleton section ─────────────────────────────────────────────────────────

function SkeletonSection({
  colCount,
  rows,
  gridTpl,
}: {
  colCount: number;
  rows: number;
  gridTpl: string;
}) {
  return (
    <div className="space-y-2 overflow-x-auto">
      <div className="min-w-[56.25rem] space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={`sk-${i}`}
            className="grid items-center gap-4 rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 dark:border-[#1b1b1f] dark:bg-[#141417]"
            style={{ gridTemplateColumns: gridTpl }}
          >
            {Array.from({ length: colCount }).map((__, j) => (
              <div key={j} className="h-5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileSkeletonSection({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 md:hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={`m-sk-${i}`}
          className="rounded-2xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-3 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((__, j) => (
              <div key={j} className="space-y-1.5">
                <div className="h-2.5 w-14 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-9 w-20 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-9 w-28 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Status pill ────────────────────────────────────────────────────────────────

function StatusPill({ paused }: { paused: boolean }) {
  if (paused) {
    return (
      <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800">
        Paused
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800">
      Active
    </span>
  );
}

// ── Platform section ───────────────────────────────────────────────────────────

type HeaderDef = { key: string; header: string };

interface PlatformSectionProps {
  platformId: string;
  platformKind: PlatformKind;
  label: string;
  description: string;
  vaults: VaultOnChainData[];
  isLoading: boolean;
  searchQuery: string;
  tokenPrices: Record<string, number> | undefined;
  onDeposit: (vault: Vault) => void;
  onView: (address: string) => void;
}

function PlatformSection({
  platformId,
  platformKind,
  label,
  description,
  vaults,
  isLoading,
  searchQuery,
  tokenPrices,
  onDeposit,
  onView,
}: PlatformSectionProps) {
  const isMorpho = platformKind === "morpho";
  const isRe7 = platformId === "re7";
  const headers: HeaderDef[] = isMorpho ? MORPHO_HEADERS : isRe7 ? RE7_HEADERS : STANDARD_HEADERS;
  const gridTpl = sectionGridTemplate(platformKind, platformId);

  const filtered = useMemo(() => {
    if (!searchQuery) return vaults;
    const q = searchQuery.toLowerCase();
    return vaults.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.symbol.toLowerCase().includes(q) ||
        (v.assetSymbol ?? "").toLowerCase().includes(q)
    );
  }, [vaults, searchQuery]);

  function buildRow(v: VaultOnChainData): Record<string, React.ReactNode> {
    const vault = chainVaultToVault(v);

    const vaultCell = (
      <div className="flex min-w-0 items-start gap-3">
        <VaultAvatar chainId={v.chainId} />
        <button
          type="button"
          onClick={() => onView(v.address)}
          className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-900"
        >
          <p className="text-sm font-semibold text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100">
            {v.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {v.address.slice(0, 6)}…{v.address.slice(-4)}
            </p>
            <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-zinc-600 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#afafb2]">
              {getChainShortName(v.chainId)}
            </span>
          </div>
          {vaultHasOpenPosition(v) && (
            <div className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 dark:border-emerald-800 dark:bg-emerald-900/25">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)] dark:shadow-[0_0_0_2px_rgba(16,185,129,0.35)]" />
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.04em] text-emerald-700 dark:text-emerald-300">
                Invested
              </span>
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                {vaultPositionAmountLabel(v)}
              </span>
            </div>
          )}
        </button>
      </div>
    );

    const { nativeStr: tvlNative, usdAmt: tvlUsdAmt } = getTvlInfo(v, tokenPrices);

    const base: Record<string, React.ReactNode> = {
      vault: vaultCell,
      asset: <SupportedAssetsCell v={v} />,
      tvl: (
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {tvlNative}
          </span>
          {tvlUsdAmt !== null && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              ≈ {fmtUsdCompact(tvlUsdAmt)}
            </span>
          )}
        </span>
      ),
      apy: <ApyCell v={v} />,
      status: <StatusPill paused={v.isPaused} />,
      action: (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onDeposit(vault)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-7 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:border dark:border-[#1b1b1f] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="m5 12 7 7 7-7" />
            </svg>
            Deposit
          </button>
        </div>
      ),
    };

    if (isMorpho) {
      return {
        ...base,
        liquidity: (
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {formatBigIntAsset(v.liquidityRaw, v.assetDecimals ?? 18, v.assetSymbol)}
          </span>
        ),
      };
    }
    if (isRe7) {
      return base;
    }
    return {
      ...base,
      perfFee: (
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{feePercent(v.performanceFee)}</span>
      ),
      mgmtFee: (
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{feePercent(v.managementFee)}</span>
      ),
    };
  }

  function renderVaultCard(v: VaultOnChainData): React.ReactNode {
    const vault = chainVaultToVault(v);
    const hasPosition = vaultHasOpenPosition(v);
    const isMorphoVault = v.kind === "morpho";
    const { nativeStr: tvlNativeCard, usdAmt: cardTvlUsd } = getTvlInfo(v, tokenPrices);
    const [tvlValue, ...tvlSymbolParts] = tvlNativeCard.split(" ");
    const tvlSymbol = tvlSymbolParts.join(" ");

    return (
      <article
        key={v.address}
        className="flex flex-col rounded-2xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <VaultAvatar chainId={v.chainId} />
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => onView(v.address)}
                className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-900"
              >
                <p className="truncate text-sm font-semibold text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100">
                  {v.name}
                </p>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[0.6875rem] text-zinc-500 dark:text-zinc-400">
                  {v.address.slice(0, 6)}…{v.address.slice(-4)}
                </span>
                <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-zinc-600 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#afafb2]">
                  {getChainShortName(v.chainId)}
                </span>
              </div>
            </div>
          </div>
          <StatusPill paused={v.isPaused} />
        </div>

        {hasPosition && (
          <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 dark:border-emerald-800 dark:bg-emerald-900/25">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.04em] text-emerald-700 dark:text-emerald-300">
              Invested
            </span>
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              {vaultPositionAmountLabel(v)}
            </span>
          </div>
        )}

        <div className="mb-4">
          <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Assets</p>
          <SupportedAssetsCell v={v} />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 border-t border-zinc-200 pt-3 dark:border-[#1b1b1f]">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">TVL</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {tvlValue}
              {tvlSymbol ? ` ${tvlSymbol}` : ""}
            </p>
            {cardTvlUsd !== null && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">≈ {fmtUsdCompact(cardTvlUsd)}</p>
            )}
          </div>
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {isMorphoVault ? "7D net APY" : "7D APY"}
            </p>
            <div className="mt-1 text-sm font-semibold">
              <ApyCell v={v} />
            </div>
          </div>
          {isMorphoVault && (
            <div className="col-span-2">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Liquidity</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {formatBigIntAsset(v.liquidityRaw, v.assetDecimals ?? 18, v.assetSymbol)}
              </p>
            </div>
          )}
          {!isMorphoVault && !isRe7 && (
            <>
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Perf. fee
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {feePercent(v.performanceFee)}
                </p>
              </div>
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Mgmt. fee
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {feePercent(v.managementFee)}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="mt-auto">
          <button
            type="button"
            onClick={() => onDeposit(vault)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:border dark:border-[#1b1b1f] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="m5 12 7 7 7-7" />
            </svg>
            Deposit
          </button>
        </div>
      </article>
    );
  }

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-1.5 h-6 w-1 shrink-0 rounded-full bg-zinc-900 dark:bg-zinc-100" aria-hidden />
        <div>
          <h2 className="text-[1.55rem] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{label}</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        </div>
      </div>

      {isLoading ? (
        <>
          <MobileSkeletonSection rows={vaults.length || 3} />
          <div className="hidden md:block">
            <SkeletonSection colCount={headers.length} rows={vaults.length || 3} gridTpl={gridTpl} />
          </div>
        </>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-sm text-zinc-500 dark:text-zinc-400">No vaults match your search.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filtered.map((v) => renderVaultCard(v))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[61.25rem] border-separate border-spacing-y-2">
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th
                      key={h.key}
                      className="px-3 py-1 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-300"
                    >
                      {h.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const row = buildRow(v);
                  const hasPosition = vaultHasOpenPosition(v);
                  const cellTone = hasPosition
                    ? "bg-emerald-50/25 border-emerald-200/80 dark:bg-emerald-900/20 dark:border-emerald-800/70"
                    : "bg-[#F1F2F0] border-[#E1E5E1] dark:bg-[#141417] dark:border-[#1b1b1f]";
                  return (
                    <tr key={v.address} className="transition hover:opacity-95">
                      {headers.map((h, idx) => (
                        <td
                          key={h.key}
                          className={
                            `min-w-0 border-y px-3 py-4 align-middle shadow-sm shadow-zinc-900/5 ${cellTone} ` +
                            (idx === 0 ? "rounded-l-xl border-l pl-4" : "") +
                            (idx === headers.length - 1 ? "rounded-r-xl border-r pr-4" : "")
                          }
                        >
                          {h.key === "action" ? (
                            <div className="flex justify-end">{row[h.key]}</div>
                          ) : (
                            row[h.key]
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface VaultsTableProps {
  vaults: VaultOnChainData[];
  isLoading: boolean;
}

export function VaultsTable({ vaults: allVaults, isLoading }: VaultsTableProps) {
  const router = useRouter();
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [txCompletedNotice, setTxCompletedNotice] = useState(false);

  const { data: tokenPrices } = useQuery<Record<string, number>>({
    queryKey: ["tokenPrices"],
    staleTime: 5 * 60 * 1_000,
    gcTime:   15 * 60 * 1_000,
    queryFn: () =>
      fetch("/api/token-prices").then((r) => {
        if (!r.ok) throw new Error(`token-prices error: ${r.status}`);
        return r.json() as Promise<Record<string, number>>;
      }),
  });

  const activePlatforms = VAULT_PLATFORMS.filter((p) => p.vaults.length > 0);

  if (activePlatforms.length === 0) {
    return (
      <div className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">No vaults configured</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Add vault addresses to `NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR` in your `.env.local` to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      {txCompletedNotice && (
        <div className="mb-4 rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]">
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-emerald-700">Transaction completed</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Vault data has been refreshed.</p>
            </div>
            <button
              type="button"
              onClick={() => setTxCompletedNotice(false)}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="relative mb-8 max-w-md">
        <label htmlFor="vault-search" className="sr-only">
          Search vaults
        </label>
        <HiOutlineSearch
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          id="vault-search"
          type="search"
          placeholder="Search by vault name, symbol…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] py-3 pl-11 pr-4 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff] dark:placeholder:text-[#afafb2] dark:focus:border-[#afafb2] dark:focus:ring-zinc-100/10"
        />
      </div>

      {activePlatforms.map((platform) => {
        const platformVaults = allVaults.filter((v) => v.platformId === platform.id);
        return (
          <PlatformSection
            key={platform.id}
            platformId={platform.id}
            platformKind={platform.kind}
            label={platform.label}
            description={platform.description}
            vaults={platformVaults}
            isLoading={isLoading}
            searchQuery={searchQuery}
            tokenPrices={tokenPrices}
            onDeposit={(vault) => router.push(`/vaults/${vault.address}`)}
            onView={(address) => router.push(`/vaults/${address}`)}
          />
        );
      })}

      {selectedVault?.kind === "morpho" ? (
        <MorphoVaultActionModal
          vault={selectedVault}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onTxCompleted={() => setTxCompletedNotice(true)}
        />
      ) : selectedVault?.kind === "midas" ? (
        <MidasVaultActionModal
          vault={selectedVault}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onTxCompleted={() => setTxCompletedNotice(true)}
        />
      ) : (
        <VaultActionModal
          vault={selectedVault}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onTxCompleted={() => setTxCompletedNotice(true)}
        />
      )}
    </>
  );
}
