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
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(4)}B${suffix}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(4)}M${suffix}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(4)}K${suffix}`;
  return `${n.toFixed(4)}${suffix}`;
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
  const kindTagType = vault.kind === "morpho" ? "blue" : vault.kind === "midas" ? "purple" : "teal";
  const apyStr = fmtApy(vault.apyPrefetched);

  return (
    <div
      style={{
        background: "#f1f2f0",
        border: "1px solid #e1e5e1",
        borderLeft: "3px solid #16a34a",
        borderRadius: "12px",
        padding: "1.25rem 1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1.5rem",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderLeftColor = "#15803d"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderLeftColor = "#16a34a"; }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Vault identity */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
          <p style={{ color: "#18181b", fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.3 }}>
            {vault.name}
          </p>
          {apyStr && (
            <span style={{
              fontSize: "0.75rem", fontWeight: 700, color: "#15803d",
              background: "#ecfdf3", border: "1px solid #bbf7d0",
              padding: "0.1rem 0.45rem", borderRadius: "3px",
            }}>
              {apyStr} APY
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{ color: "#71717a", fontSize: "0.75rem", fontFamily: "monospace" }}>
            {vault.address.slice(0, 6)}…{vault.address.slice(-4)}
          </span>
          <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700">
            {kindLabel}
          </span>
          <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700">
            {getChainName(vault.chainId)}
          </span>
          <span
            className={
              "rounded-md border px-1.5 py-0.5 text-[11px] font-semibold " +
              (vault.isPaused
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700")
            }
          >
            {vault.isPaused ? "Paused" : "Active"}
          </span>
        </div>
      </div>

      {/* Position metrics */}
      <div style={{ display: "flex", gap: "2.5rem", alignItems: "center", flexShrink: 0 }}>
        <div style={{ textAlign: "right" }}>
          <p style={{ color: "#71717a", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
            Shares held
          </p>
          <p style={{ color: "#3f3f46", fontWeight: 600, fontSize: "0.875rem" }}>
            {fmtAsset(vault.userShares, vault.decimals, vault.symbol)}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ color: "#71717a", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
            Current value
          </p>
          <p style={{ color: "#111827", fontWeight: 700, fontSize: "1.25rem", lineHeight: 1.2 }}>
            {fmtAsset(vault.userAssetsRaw, assetDec, vault.assetSymbol)}
          </p>
        </div>
      </div>

      {/* Arrow */}
      <span style={{ color: "#71717a", fontSize: "1rem", flexShrink: 0 }}>→</span>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = "#f4f4f4", loading }: {
  label: string; value: string; color?: string; loading: boolean;
}) {
  return (
    <div style={{ background: "#f1f2f0", border: "1px solid #e1e5e1", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
      <p style={{ fontSize: "0.7rem", color: "#71717a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>
        {label}
      </p>
      {loading
        ? (
          <div className="h-8 w-20 animate-pulse rounded-md bg-zinc-200" />
        )
        : <p style={{ fontSize: "1.75rem", fontWeight: 700, color }}>{value}</p>
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
  const kindTagType  = item.vault.kind === "midas" ? "purple" : "teal";
  const isClaimable  = item.type === "ultrayield-claimable";
  const borderColor  = isClaimable ? "#86efac" : "#fcd34d";
  const accentColor  = isClaimable ? "#15803d" : "#a16207";
  const bgColor      = isClaimable ? "#ecfdf3" : "#fffbeb";

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
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: "12px",
        padding: "1rem 1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1.5rem",
        cursor: "pointer",
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: accentColor,
            background: "transparent", border: `1px solid ${accentColor}`,
            padding: "0.1rem 0.4rem", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {statusLabel}
          </span>
          <span style={{ color: "#18181b", fontWeight: 600, fontSize: "0.9375rem" }}>{item.vault.name}</span>
          <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700">
            {kindLabel}
          </span>
          <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700">
            {getChainName(item.vault.chainId)}
          </span>
        </div>
        <p style={{ color: accentColor, fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.2rem" }}>
          {amountLabel}
        </p>
        <p style={{ color: "#52525b", fontSize: "0.75rem" }}>{subLabel}</p>
      </div>
      <span style={{ color: "#71717a", fontSize: "1rem", flexShrink: 0 }}>→</span>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ background: "#f1f2f0", border: "1px solid #e1e5e1", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
            <div className="mb-3 h-3 w-20 animate-pulse rounded bg-zinc-200" />
            <div className="h-8 w-24 animate-pulse rounded-md bg-zinc-200" />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ background: "#f1f2f0", border: "1px solid #e1e5e1", borderRadius: "12px", padding: "1.5rem 2rem" }}>
            <div className="space-y-2">
              <div className="h-3 w-[85%] animate-pulse rounded bg-zinc-200" />
              <div className="h-3 w-[70%] animate-pulse rounded bg-zinc-200" />
            </div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="min-h-full bg-white">
        <div className="mx-auto w-full p-4 lg:p-6">

          {/* Page header */}
          <div style={{ marginBottom: "2rem" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#18181b", margin: 0 }}>
              Portfolio
            </h1>
            <p style={{ color: "#71717a", fontSize: "0.875rem", marginTop: "0.35rem" }}>
              Your on-chain positions across all supported vaults
            </p>
          </div>

          {(walletPending || (isConnected && isLoading)) ? skeletonCards

          : !isConnected ? (
            <div style={{
              background: "#f1f2f0", border: "1px dashed #e1e5e1", borderRadius: "12px",
              padding: "5rem 2rem", textAlign: "center",
            }}>
              <p style={{ color: "#71717a", fontSize: "1rem", marginBottom: "1.5rem" }}>
                Connect your wallet to view your portfolio
              </p>
              <button
                type="button" onClick={() => open()}
                style={{
                  background: "#111827", border: "none", borderRadius: "10px",
                  padding: "0.75rem 2rem", color: "#fff", fontSize: "0.875rem",
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                Connect Wallet
              </button>
            </div>

          ) : (
            <>
              {/* Summary stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
                <StatCard label="Active Positions"    value={String(positions.length)}   color="#111827" loading={false} />
                <StatCard label="Pending Withdrawals" value={String(pendingItems.length)} color={pendingItems.length > 0 ? "#a16207" : "#71717a"} loading={false} />
                <StatCard label="Networks"            value={String(networkCount)}        color="#111827" loading={false} />
                <StatCard label="Protocols"           value={String(protocolCount)}       color="#111827" loading={false} />
              </div>

              {/* ── Active Positions ── */}
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
                Active Positions
              </h2>
              {positions.length === 0 ? (
                <div style={{
                  background: "#f1f2f0", border: "1px dashed #e1e5e1", borderRadius: "12px",
                  padding: "4rem 2rem", textAlign: "center", marginBottom: "2rem",
                }}>
                  <p style={{ color: "#52525b", fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
                    No vault positions found for this wallet.
                  </p>
                  <p style={{ color: "#71717a", fontSize: "0.8rem", marginBottom: "1.5rem" }}>
                    Deposit into a vault to see your position here.
                  </p>
                  <button
                    type="button" onClick={() => router.push("/")}
                    style={{
                      background: "transparent", border: "1px solid #e1e5e1", borderRadius: "10px",
                      padding: "0.6rem 1.5rem", color: "#111827", fontSize: "0.875rem", cursor: "pointer",
                    }}
                  >
                    Browse Vaults →
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "2.5rem" }}>
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
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
                Pending Withdrawals
              </h2>
              {pendingItems.length === 0 ? (
                <div style={{
                  background: "#f1f2f0", border: "1px dashed #e1e5e1", borderRadius: "12px",
                  padding: "2rem", textAlign: "center",
                }}>
                  <p style={{ color: "#71717a", fontSize: "0.875rem" }}>No pending withdrawal requests.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
