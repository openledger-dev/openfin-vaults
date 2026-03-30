"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import {
  Button,
  Tag,
  InlineNotification,
  InlineLoading,
  SkeletonText,
  Breadcrumb,
  BreadcrumbItem,
  TextInput,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  Tooltip,
} from "@carbon/react";
import { ArrowLeft, Launch, Information } from "@carbon/icons-react";
import { Navbar } from "@/components/Navbar";
import { useVaultDetail } from "@/hooks/useVaultDetail";
import { use7dApy } from "@/hooks/use7dApy";
import { useSupportedAssets } from "@/hooks/useSupportedAssets";
import { VAULT_WRITE_ABI, ERC20_ABI } from "@/lib/vaultAbi";
import { DEPOSIT_REFERRAL_ID } from "@/lib/referral";
import { VAULT_PLATFORMS } from "@/lib/vaultConfig";
import { fetchMorphoVaultApys } from "@/lib/morphoApi";
import type { PlatformKind } from "@/lib/vaultConfig";
import { getChainName, getAddressExplorerLink } from "@/lib/chains";

// Minimal ERC-4626 write ABI for Morpho (standard sync deposit/redeem)
const ERC4626_WRITE_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "redeem",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }, { name: "owner", type: "address" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortAddr(addr: string | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function explorerLink(addr: string | undefined, chainId = 1): string {
  if (!addr) return "#";
  return getAddressExplorerLink(addr, chainId);
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color = "#f4f4f4", loading = false,
}: {
  label: string; value: string; sub?: string; color?: string; loading?: boolean;
}) {
  return (
    <div style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "6px", padding: "1.25rem 1.5rem" }}>
      <p style={{ fontSize: "0.7rem", color: "#8d8d8d", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
        {label}
      </p>
      {loading
        ? <div style={{ width: "70%", marginBottom: "0.25rem" }}><SkeletonText /></div>
        : <p style={{ fontSize: "1.5rem", fontWeight: 700, color, lineHeight: 1.2, marginBottom: "0.15rem" }}>{value}</p>
      }
      {sub && <p style={{ fontSize: "0.7rem", color: "#6f6f6f" }}>{sub}</p>}
    </div>
  );
}

// ── Address row ───────────────────────────────────────────────────────────────

function AddressRow({ label, value, chainId = 1 }: { label: string; value: string | undefined; chainId?: number }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0", borderBottom: "1px solid #2e2e2e" }}>
      <span style={{ fontSize: "0.8rem", color: "#8d8d8d" }}>{label}</span>
      <a
        href={explorerLink(value, chainId)}
        target="_blank" rel="noopener noreferrer"
        style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", color: "#4589ff", fontFamily: "monospace", textDecoration: "none" }}
      >
        {shortAddr(value)} <Launch size={12} />
      </a>
    </div>
  );
}

// ── Fee row ───────────────────────────────────────────────────────────────────

function FeeRow({ label, pct, tooltip }: { label: string; pct: number | undefined; tooltip: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0", borderBottom: "1px solid #2e2e2e" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", color: "#8d8d8d" }}>
        {label}
        <Tooltip label={tooltip} align="right">
          <button type="button" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6f6f6f" }}>
            <Information size={14} />
          </button>
        </Tooltip>
      </span>
      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: pct === 0 ? "#42be65" : "#f4f4f4" }}>
        {pct != null ? `${pct.toFixed(2)}%` : "—"}
      </span>
    </div>
  );
}

// ── Vault kind badge ──────────────────────────────────────────────────────────

function KindTag({ kind }: { kind: PlatformKind }) {
  if (kind === "morpho")     return <Tag type="blue"   size="sm">ERC-4626 (Morpho)</Tag>;
  if (kind === "midas")      return <Tag type="purple" size="sm">Midas RWA</Tag>;
  return                            <Tag type="purple" size="sm">ERC-7540 Async Redeem</Tag>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VaultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawAddress = Array.isArray(params.address) ? params.address[0] : (params.address ?? "");
  const vaultAddress = /^0x[0-9a-fA-F]{40}$/.test(rawAddress)
    ? (rawAddress as `0x${string}`)
    : undefined;

  const { address: userAddress, isConnected } = useAccount();

  // ── Look up vault kind + chainId from static config ───────────────────────
  const vaultConfig = useMemo(() => {
    if (!vaultAddress) return null;
    const lower = vaultAddress.toLowerCase();
    for (const platform of VAULT_PLATFORMS) {
      const entry = platform.vaults.find((v) => v.address.toLowerCase() === lower);
      if (entry) return {
        kind: platform.kind,
        // vault-level chainId (set via address@chainId in env) takes precedence
        chainId: entry.chainId ?? platform.chainId,
      };
    }
    return null;
  }, [vaultAddress]);

  const vaultKind    = vaultConfig?.kind    ?? "ultrayield";
  const vaultChainId = vaultConfig?.chainId ?? 1;

  // ── On-chain detail ───────────────────────────────────────────────────────
  const vault = useVaultDetail(vaultAddress, userAddress, vaultChainId, vaultKind);

  // ── APY: event-log for UltraYield; Morpho API otherwise ──────────────────
  const { apy: ultrayieldApy, label: apyLabel, isLoading: apyLoading } = use7dApy(
    vaultKind === "ultrayield" ? vault.oracle : undefined,
    vaultKind === "ultrayield" ? vaultAddress : undefined,
    vaultKind === "ultrayield" ? vault.assetAddress : undefined,
  );

  const { data: morphoApyData, isLoading: morphoApyLoading } = useQuery({
    queryKey: ["morphoDetailApy", vaultChainId, vaultAddress],
    enabled: vaultKind === "morpho" && !!vaultAddress,
    staleTime: 5 * 60 * 1_000,
    gcTime: 15 * 60 * 1_000,
    queryFn: () => fetchMorphoVaultApys([vaultAddress!], vaultChainId),
  });

  const morphoApiEntry = morphoApyData?.[vaultAddress?.toLowerCase() ?? ""];

  const morphoApy = useMemo(
    () => morphoApiEntry?.weeklyNetApy ?? null,
    [morphoApiEntry]
  );

  // When the on-chain name() call fails it falls back to the raw address.
  // Use the Morpho API name as a secondary fallback so the page always shows
  // a human-readable label even if the RPC call fails.
  const displayName = useMemo(() => {
    if (!vault.name || /^0x[0-9a-fA-F]{40}$/i.test(vault.name)) {
      return morphoApiEntry?.name ?? vault.name;
    }
    return vault.name;
  }, [vault.name, morphoApiEntry]);

  const displayApy      = vaultKind === "morpho" ? (morphoApy !== null ? morphoApy * 100 : null) : ultrayieldApy;
  const displayApyLabel = vaultKind === "morpho" ? "7D Net APY" : apyLabel;
  const displayApyLoading = vaultKind === "morpho" ? morphoApyLoading : apyLoading;
  const displayApySub   = vaultKind === "morpho" ? "Weekly net APY via Morpho API" : "Annualised from oracle event logs";

  const { assets: supportedAssets } = useSupportedAssets(vaultAddress);

  // ── Deposit asset selection ───────────────────────────────────────────────
  const [selectedAssetAddr, setSelectedAssetAddr] = useState<`0x${string}` | undefined>(undefined);
  useEffect(() => {
    if (supportedAssets.length > 0 && !selectedAssetAddr) {
      setSelectedAssetAddr(supportedAssets[0].address);
    }
  }, [supportedAssets, selectedAssetAddr]);

  const depositAsset = useMemo(
    () => supportedAssets.find((a) => a.address === selectedAssetAddr) ?? supportedAssets[0] ?? null,
    [supportedAssets, selectedAssetAddr]
  );

  // For Morpho: deposit asset = vault's ERC-4626 base asset
  const morphoDepositDec = vault.assetDecimals ?? 18;
  const morphoDepositSym = vault.assetSymbol ?? "—";

  // ── Read ERC-20 data for deposit asset ────────────────────────────────────
  const depositAssetAddr = vaultKind === "morpho" ? vault.assetAddress : depositAsset?.address;
  const { data: depositAssetMeta } = useReadContracts({
    contracts: userAddress && depositAssetAddr && vaultAddress
      ? [
          { address: depositAssetAddr, abi: ERC20_ABI, functionName: "balanceOf" as const,  args: [userAddress],          chainId: vaultChainId },
          { address: depositAssetAddr, abi: ERC20_ABI, functionName: "allowance" as const,  args: [userAddress, vaultAddress], chainId: vaultChainId },
        ]
      : [],
    query: { enabled: !!userAddress && !!depositAssetAddr && !!vaultAddress },
  });

  const depositAssetBalance   = depositAssetMeta?.[0]?.status === "success" ? (depositAssetMeta[0].result as bigint) : undefined;
  const depositAssetAllowance = depositAssetMeta?.[1]?.status === "success" ? (depositAssetMeta[1].result as bigint) : undefined;

  const assetDecForDisplay = vaultKind === "morpho" ? morphoDepositDec : (depositAsset?.decimals ?? 18);
  const assetSymForDisplay = vaultKind === "morpho" ? morphoDepositSym : (depositAsset?.symbol ?? "—");

  const depositAssetBalanceFmt = useMemo(() => {
    if (depositAssetBalance === undefined) return "—";
    return `${parseFloat(formatUnits(depositAssetBalance, assetDecForDisplay)).toFixed(4)} ${assetSymForDisplay}`;
  }, [depositAssetBalance, assetDecForDisplay, assetSymForDisplay]);

  // ── State + write contract ────────────────────────────────────────────────
  const [depositAmount, setDepositAmount] = useState("");
  const [redeemAmount, setRedeemAmount]   = useState("");

  const { writeContract, data: txHash, isPending: isWritePending, error: writeError, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
  const isBusy = isWritePending || isConfirming;

  const depositAmountParsed = useMemo(() => {
    try { return depositAmount ? parseUnits(depositAmount, assetDecForDisplay) : BigInt(0); }
    catch { return BigInt(0); }
  }, [depositAmount, assetDecForDisplay]);

  const redeemAmountParsed = useMemo(() => {
    try { return redeemAmount ? parseUnits(redeemAmount, vault.decimals) : BigInt(0); }
    catch { return BigInt(0); }
  }, [redeemAmount, vault.decimals]);

  const needsAssetApprove =
    depositAssetAllowance !== undefined &&
    depositAmountParsed > BigInt(0) &&
    depositAssetAllowance < depositAmountParsed;

  const needsShareApprove =
    vault.userShareAllowance !== undefined &&
    redeemAmountParsed > BigInt(0) &&
    vault.userShareAllowance < redeemAmountParsed;

  // ── Write handlers ────────────────────────────────────────────────────────

  function handleApproveAsset() {
    if (!depositAssetAddr || !vaultAddress) return;
    writeContract({ address: depositAssetAddr, abi: ERC20_ABI, functionName: "approve", args: [vaultAddress, maxUint256] });
  }

  // UltraYield deposit
  function handleUYDeposit() {
    const asset = depositAsset;
    if (!vaultAddress || !asset || !userAddress || depositAmountParsed <= BigInt(0)) return;
    writeContract({
      address: vaultAddress,
      abi: VAULT_WRITE_ABI,
      functionName: "depositAssetWithReferral",
      args: [asset.address, depositAmountParsed, userAddress, DEPOSIT_REFERRAL_ID],
    });
  }

  // Morpho deposit (standard ERC-4626)
  function handleMorphoDeposit() {
    if (!vaultAddress || !userAddress || depositAmountParsed <= BigInt(0)) return;
    writeContract({
      address: vaultAddress,
      abi: ERC4626_WRITE_ABI,
      functionName: "deposit",
      args: [depositAmountParsed, userAddress],
    });
  }

  // Morpho redeem (sync)
  function handleMorphoRedeem() {
    if (!vaultAddress || !userAddress || redeemAmountParsed <= BigInt(0)) return;
    writeContract({
      address: vaultAddress,
      abi: ERC4626_WRITE_ABI,
      functionName: "redeem",
      args: [redeemAmountParsed, userAddress, userAddress],
    });
  }

  // UltraYield share approval + async redeem
  function handleApproveShares() {
    if (!vaultAddress) return;
    writeContract({ address: vaultAddress, abi: ERC20_ABI, functionName: "approve", args: [vaultAddress, maxUint256] });
  }
  function handleRequestRedeem() {
    if (!vaultAddress || !vault.assetAddress || !userAddress || redeemAmountParsed <= BigInt(0)) return;
    writeContract({ address: vaultAddress, abi: VAULT_WRITE_ABI, functionName: "requestRedeemOfAsset", args: [vault.assetAddress, redeemAmountParsed, userAddress, userAddress] });
  }
  function handleCancelRedeem() {
    if (!vaultAddress || !vault.assetAddress || !userAddress) return;
    writeContract({ address: vaultAddress, abi: VAULT_WRITE_ABI, functionName: "cancelRedeemRequestOfAsset", args: [vault.assetAddress, userAddress, userAddress] });
  }
  function handleClaim() {
    if (!vaultAddress || !vault.assetAddress || !userAddress || !vault.claimableShares || vault.claimableShares === BigInt(0)) return;
    writeContract({ address: vaultAddress, abi: VAULT_WRITE_ABI, functionName: "redeemAsset", args: [vault.assetAddress, vault.claimableShares, userAddress, userAddress] });
  }

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!vaultAddress) {
    return (
      <div style={{ minHeight: "100vh", background: "#161616" }}>
        <Navbar />
        <div style={{ paddingTop: "3rem", maxWidth: "900px", margin: "0 auto", padding: "5rem 2rem" }}>
          <InlineNotification kind="error" title="Invalid vault address" subtitle="The address in the URL is not a valid Ethereum address." hideCloseButton />
        </div>
      </div>
    );
  }

  const assetSym    = vault.assetSymbol ?? "—";
  const statusColor = vault.isPaused ? "#ff832b" : "#42be65";
  const hasAssetAddr = !!vault.assetAddress;

  return (
    <div style={{ minHeight: "100vh", background: "#161616" }}>
      <Navbar />
      <div style={{ paddingTop: "3rem" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 2rem 5rem" }}>

          {/* Breadcrumb */}
          <Breadcrumb style={{ marginBottom: "1.5rem" }}>
            <BreadcrumbItem href="/">Vaults</BreadcrumbItem>
            <BreadcrumbItem isCurrentPage>
              {vault.isLoading ? "Loading…" : displayName}
            </BreadcrumbItem>
          </Breadcrumb>

          {/* Page header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <button type="button" onClick={() => router.push("/")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6f6f6f", padding: "0.25rem", display: "flex" }}>
                <ArrowLeft size={20} />
              </button>
              <div>
                {vault.isLoading
                  ? <div style={{ width: "200px" }}><SkeletonText heading /></div>
                  : <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f4f4f4", margin: 0, lineHeight: 1.2 }}>{displayName}</h1>
                }
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  {vault.symbol && <Tag type="cool-gray" size="sm">{vault.symbol}</Tag>}
                  {supportedAssets.length > 0
                    ? supportedAssets.map((a) => <Tag key={a.address} type="blue" size="sm">{a.symbol}</Tag>)
                    : assetSym !== "—" && <Tag type="blue" size="sm">{assetSym}</Tag>
                  }
                  <Tag type={vault.isPaused ? "red" : "green"} size="sm">
                    {vault.isPaused ? "Paused" : "Active"}
                  </Tag>
                  <KindTag kind={vaultKind} />
                  <Tag type="warm-gray" size="sm">{getChainName(vaultChainId)}</Tag>
                </div>
              </div>
            </div>
            <a href={explorerLink(vaultAddress, vaultChainId)} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "#4589ff", textDecoration: "none", whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: "monospace" }}>{shortAddr(vaultAddress)}</span>
              <Launch size={14} />
            </a>
          </div>

          {/* Active position banner */}
          {isConnected && vault.userShares !== undefined && vault.userShares > BigInt(0) && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#0a2e14", border: "1px solid #1e5e2e", borderRadius: "6px",
              padding: "0.875rem 1.25rem", marginBottom: "1.5rem", gap: "1rem", flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#42be65", flexShrink: 0, display: "inline-block" }} />
                <span style={{ color: "#6fdc8c", fontWeight: 600, fontSize: "0.875rem" }}>
                  You have an active position in this vault
                </span>
              </div>
              <div style={{ display: "flex", gap: "2rem", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <span style={{ color: "#42be65", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "0.5rem" }}>Shares</span>
                  <span style={{ color: "#c6c6c6", fontWeight: 600, fontSize: "0.875rem" }}>
                    {vault.userSharesFormatted}
                  </span>
                </div>
                <div>
                  <span style={{ color: "#42be65", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "0.5rem" }}>Value</span>
                  <span style={{ color: "#4589ff", fontWeight: 700, fontSize: "1rem" }}>
                    {vault.userAssetsFormatted}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Tx feedback */}
          {isConfirmed && (
            <InlineNotification kind="success" title="Transaction confirmed"
              subtitle={`Hash: ${txHash?.slice(0, 18)}…`}
              style={{ marginBottom: "1.5rem" }} onCloseButtonClick={() => { resetWrite(); }} />
          )}
          {writeError && (
            <InlineNotification kind="error" title="Transaction failed"
              subtitle={writeError.message.slice(0, 140)}
              style={{ marginBottom: "1.5rem" }} onCloseButtonClick={resetWrite} />
          )}

          {/* Stat cards row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
            <StatCard label="Total Value Locked" value={vault.tvlFormatted} sub="totalAssets() via contract" color="#4589ff" loading={vault.isLoading} />
            <StatCard label="Total Supply" value={vault.totalSupplyFormatted} sub="Vault shares outstanding" loading={vault.isLoading} />
            <StatCard label="Share Price" value={vault.sharePriceFormatted} sub={`1 ${vault.symbol || "share"} = X ${assetSym}`} color="#be95ff" loading={vault.isLoading} />
            <StatCard
              label={displayApyLabel}
              value={displayApy !== null ? `${displayApy >= 0 ? "+" : ""}${displayApy.toFixed(2)}%` : "—"}
              sub={displayApySub}
              color={displayApy === null ? "#6f6f6f" : displayApy >= 0 ? "#42be65" : "#ff832b"}
              loading={vault.isLoading || displayApyLoading}
            />
            <StatCard label="Status" value={vault.isPaused ? "Paused" : "Active"}
              sub={vault.isPaused ? "Deposits disabled" : "Accepting deposits"}
              color={statusColor} loading={vault.isLoading} />
          </div>

          {/* Two-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "1.5rem", alignItems: "start" }}>

            {/* ── LEFT COLUMN ────────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

              {/* Your Position */}
              {isConnected && (
                <section style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "6px", padding: "1.5rem" }}>
                  <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f4f4f4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1.25rem" }}>
                    Your Position
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
                    {[
                      { label: "Shares Held",    value: vault.isLoading ? "…" : vault.userSharesFormatted,    color: "#be95ff" },
                      { label: "Asset Value",     value: vault.isLoading ? "…" : vault.userAssetsFormatted,    color: "#4589ff" },
                      { label: "Wallet Balance",  value: vault.isLoading ? "…" : vault.userAssetBalanceFormatted, color: "#c6c6c6" },
                    ].map((s) => (
                      <div key={s.label} style={{ background: "#262626", borderRadius: "4px", padding: "1rem" }}>
                        <p style={{ fontSize: "0.7rem", color: "#6f6f6f", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>{s.label}</p>
                        <p style={{ fontSize: "1.125rem", fontWeight: 700, color: s.color }}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* UltraYield-only: pending + claimable redeem */}
                  {vaultKind === "ultrayield" && vault.pendingShares !== undefined && vault.pendingShares > BigInt(0) && (
                    <div style={{ background: "#1e1900", border: "1px solid #f1c21b", borderRadius: "4px", padding: "1rem", marginBottom: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <p style={{ fontSize: "0.75rem", color: "#f1c21b", fontWeight: 600, marginBottom: "0.25rem" }}>Pending Redemption</p>
                          <p style={{ fontSize: "0.875rem", color: "#f4f4f4" }}>
                            {vault.userSharesFormatted} shares escrowed · fulfillment ≤ 72h
                          </p>
                        </div>
                        <Button kind="danger--ghost" size="sm" onClick={handleCancelRedeem} disabled={isBusy}>
                          {isBusy ? <InlineLoading /> : "Cancel"}
                        </Button>
                      </div>
                    </div>
                  )}
                  {vaultKind === "ultrayield" && vault.claimableAssets !== undefined && vault.claimableAssets > BigInt(0) && (
                    <div style={{ background: "#0d1e0d", border: "1px solid #42be65", borderRadius: "4px", padding: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <p style={{ fontSize: "0.75rem", color: "#42be65", fontWeight: 600, marginBottom: "0.25rem" }}>Ready to Claim</p>
                          <p style={{ fontSize: "0.875rem", color: "#f4f4f4" }}>{vault.userAssetsFormatted} available</p>
                        </div>
                        <Button kind="primary" size="sm" onClick={handleClaim} disabled={isBusy}>
                          {isBusy ? <InlineLoading /> : "Claim Assets"}
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Fee Structure */}
              <section style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "6px", padding: "1.5rem" }}>
                <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f4f4f4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1.25rem" }}>
                  Fee Structure
                </h2>
                {vault.isLoading
                  ? <SkeletonText paragraph lineCount={3} />
                  : <>
                      <FeeRow label="Performance Fee" pct={vault.performanceFeePercent}
                        tooltip={vaultKind === "morpho"
                          ? "Fee on yield taken by the vault's fee recipient."
                          : "Charged on profits above the high-water mark. Max 30%."} />
                      {vaultKind === "ultrayield" && (
                        <>
                          <FeeRow label="Management Fee" pct={vault.managementFeePercent}
                            tooltip="Annual fee on total assets under management. Max 5%." />
                          <FeeRow label="Withdrawal Fee" pct={vault.withdrawalFeePercent}
                            tooltip="One-time fee deducted at redemption fulfillment. Max 1%." />
                          {vault.highwaterMark !== undefined && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0" }}>
                              <span style={{ fontSize: "0.8rem", color: "#8d8d8d" }}>High-Water Mark</span>
                              <span style={{ fontSize: "0.875rem", color: "#c6c6c6", fontFamily: "monospace" }}>
                                {vault.highwaterMark.toString()}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </>
                }
              </section>

              {/* Vault Mechanics — platform-specific */}
              <section style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "6px", padding: "1.5rem" }}>
                <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f4f4f4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1.25rem" }}>
                  Vault Mechanics
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {(vaultKind === "morpho"
                    ? [
                        { title: "Deposit",   desc: "Standard ERC-4626 — deposit assets, receive shares instantly." },
                        { title: "Withdraw",  desc: "Standard ERC-4626 — redeem shares, receive assets instantly (subject to available liquidity)." },
                        { title: "Pricing",   desc: "Share price derived from totalAssets / totalSupply. Liquidity allocated across Morpho markets by curators." },
                        { title: "Curation",  desc: "Curators manage market allocations and risk parameters. No operator queue — withdrawals are immediate." },
                      ]
                    : [
                        { title: "Deposit",       desc: "Synchronous — assets move to fundsHolder immediately. Returns vault shares." },
                        { title: "Redeem Request", desc: "Async (ERC-7540) — shares escrowed in vault. Operator fulfills within 72h." },
                        { title: "Claim",         desc: "After operator fulfillment, assets become claimable via redeemAsset()." },
                        { title: "Pricing",       desc: "Share price set by on-chain oracle (UltraVaultOracle). totalAssets() = oracle.getQuote(totalSupply, share, asset)." },
                        { title: "Cancel",        desc: "Pending redeem requests can be cancelled before operator fulfillment." },
                      ]
                  ).map((item) => (
                    <div key={item.title} style={{ display: "flex", gap: "0.75rem" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#4589ff", minWidth: "110px", paddingTop: "0.1rem" }}>{item.title}</span>
                      <span style={{ fontSize: "0.8rem", color: "#8d8d8d", lineHeight: 1.5 }}>{item.desc}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Contract Addresses */}
              <section style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "6px", padding: "1.5rem" }}>
                <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f4f4f4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1.25rem" }}>
                  Contract Addresses
                </h2>
                {vault.isLoading
                  ? <SkeletonText paragraph lineCount={4} />
                  : <>
                      <AddressRow label="Vault"        value={vaultAddress}        chainId={vaultChainId} />
                      <AddressRow label="Asset Token"  value={vault.assetAddress}  chainId={vaultChainId} />
                      <AddressRow label="Fee Recipient" value={vault.feeRecipient}  chainId={vaultChainId} />
                      {vaultKind === "ultrayield" && (
                        <>
                          <AddressRow label="Funds Holder" value={vault.fundsHolder}   chainId={vaultChainId} />
                          <AddressRow label="Oracle"       value={vault.oracle}         chainId={vaultChainId} />
                          <AddressRow label="Rate Provider" value={vault.rateProvider}  chainId={vaultChainId} />
                        </>
                      )}
                    </>
                }
              </section>
            </div>

            {/* ── RIGHT COLUMN — action card ─────────────────────────── */}
            <div style={{ position: "sticky", top: "4rem" }}>
              <div style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "6px", padding: "1.5rem" }}>
                <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f4f4f4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1.25rem" }}>
                  Actions
                </h2>

                {!isConnected ? (
                  <p style={{ fontSize: "0.875rem", color: "#8d8d8d", textAlign: "center", padding: "1.5rem 0" }}>
                    Connect your wallet to deposit or withdraw
                  </p>
                ) : !hasAssetAddr ? (
                  <p style={{ fontSize: "0.875rem", color: "#6f6f6f", textAlign: "center", padding: "1.5rem 0" }}>
                    {vault.isLoading ? "Loading vault data…" : "Asset address unavailable"}
                  </p>
                ) : (
                  <Tabs>
                    <TabList aria-label="Vault actions">
                      <Tab>Deposit</Tab>
                      <Tab>Withdraw</Tab>
                    </TabList>
                    <TabPanels>

                      {/* ── Deposit ────────────────────────────────────── */}
                      <TabPanel>
                        <div style={{ paddingTop: "1rem" }}>
                          {/* UltraYield multi-asset selector */}
                          {vaultKind === "ultrayield" && supportedAssets.length > 1 && (
                            <div style={{ marginBottom: "1rem" }}>
                              <p style={{ fontSize: "0.7rem", color: "#8d8d8d", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Deposit asset
                              </p>
                              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                {supportedAssets.map((a) => (
                                  <button key={a.address} type="button"
                                    onClick={() => { setSelectedAssetAddr(a.address); setDepositAmount(""); }}
                                    style={{
                                      padding: "0.35rem 0.85rem", borderRadius: "4px", border: "1px solid",
                                      cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
                                      background: depositAsset?.address === a.address ? "#0f62fe" : "#262626",
                                      borderColor: depositAsset?.address === a.address ? "#0f62fe" : "#525252",
                                      color: depositAsset?.address === a.address ? "#fff" : "#c6c6c6",
                                    }}
                                  >
                                    {a.symbol}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <p style={{ fontSize: "0.75rem", color: "#8d8d8d", marginBottom: "0.75rem" }}>
                            Balance: <span style={{ color: "#4589ff", fontWeight: 600 }}>{depositAssetBalanceFmt}</span>
                          </p>
                          <TextInput
                            id="detail-deposit"
                            labelText={`Amount (${assetSymForDisplay})`}
                            placeholder="0.00"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            type="number" min="0"
                            style={{ marginBottom: "1rem" }}
                            disabled={isBusy || vault.isPaused}
                          />

                          {vault.isPaused ? (
                            <p style={{ fontSize: "0.8rem", color: "#ff832b" }}>Vault is paused — deposits disabled.</p>
                          ) : needsAssetApprove ? (
                            <>
                              <p style={{ fontSize: "0.7rem", color: "#6f6f6f", marginBottom: "0.75rem" }}>
                                Step 1: Approve vault to spend {assetSymForDisplay}
                              </p>
                              <Button kind="tertiary" size="md" onClick={handleApproveAsset} disabled={isBusy} style={{ width: "100%" }}>
                                {isBusy ? <InlineLoading description="Approving…" /> : `Approve ${assetSymForDisplay}`}
                              </Button>
                            </>
                          ) : (
                            <Button kind="primary" size="md"
                              onClick={vaultKind === "morpho" ? handleMorphoDeposit : handleUYDeposit}
                              disabled={isBusy || depositAmountParsed <= BigInt(0)} style={{ width: "100%" }}>
                              {isBusy ? <InlineLoading description="Depositing…" /> : `Deposit ${assetSymForDisplay}`}
                            </Button>
                          )}
                        </div>
                      </TabPanel>

                      {/* ── Withdraw ───────────────────────────────────── */}
                      <TabPanel>
                        <div style={{ paddingTop: "1rem" }}>
                          <p style={{ fontSize: "0.75rem", color: "#8d8d8d", marginBottom: "0.75rem" }}>
                            Shares: <span style={{ color: "#be95ff", fontWeight: 600 }}>{vault.userSharesFormatted}</span>
                          </p>
                          <TextInput
                            id="detail-redeem"
                            labelText={`Shares to redeem (${vault.symbol})`}
                            placeholder="0.00"
                            value={redeemAmount}
                            onChange={(e) => setRedeemAmount(e.target.value)}
                            type="number" min="0"
                            style={{ marginBottom: "0.5rem" }}
                            disabled={isBusy}
                          />
                          <p style={{ fontSize: "0.7rem", color: "#6f6f6f", marginBottom: "1rem", lineHeight: 1.4 }}>
                            {vaultKind === "morpho"
                              ? "Synchronous ERC-4626 redemption — assets returned immediately."
                              : `Async redemption — operator fulfills within 72h.${vault.withdrawalFeePercent ? ` Withdrawal fee: ${vault.withdrawalFeePercent.toFixed(2)}%.` : ""}`
                            }
                          </p>

                          {vaultKind === "morpho" ? (
                            <Button kind="secondary" size="md" onClick={handleMorphoRedeem}
                              disabled={isBusy || redeemAmountParsed <= BigInt(0)} style={{ width: "100%" }}>
                              {isBusy ? <InlineLoading description="Redeeming…" /> : "Redeem Shares"}
                            </Button>
                          ) : needsShareApprove ? (
                            <>
                              <p style={{ fontSize: "0.7rem", color: "#6f6f6f", marginBottom: "0.75rem" }}>
                                Step 1 of 2: Approve vault to escrow shares
                              </p>
                              <Button kind="tertiary" size="md" onClick={handleApproveShares} disabled={isBusy} style={{ width: "100%" }}>
                                {isBusy ? <InlineLoading description="Approving…" /> : `Approve ${vault.symbol}`}
                              </Button>
                            </>
                          ) : (
                            <Button kind="secondary" size="md" onClick={handleRequestRedeem}
                              disabled={isBusy || redeemAmountParsed <= BigInt(0)} style={{ width: "100%" }}>
                              {isBusy ? <InlineLoading description="Requesting…" /> : "Request Redeem"}
                            </Button>
                          )}
                        </div>
                      </TabPanel>

                    </TabPanels>
                  </Tabs>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
