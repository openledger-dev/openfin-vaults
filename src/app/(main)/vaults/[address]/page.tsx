"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import {
  HiOutlineDocumentDuplicate,
  HiOutlineExternalLink,
} from "react-icons/hi";
import { useAppKit } from "@reown/appkit/react";
import { useVaultDetail } from "@/hooks/useVaultDetail";
import { use7dApy } from "@/hooks/use7dApy";
import { useSupportedAssets } from "@/hooks/useSupportedAssets";
import { VAULT_WRITE_ABI, ERC20_ABI } from "@/lib/vaultAbi";
import { DEPOSIT_REFERRAL_ID, MIDAS_DEPOSIT_REFERRAL_ID } from "@/lib/referral";
import { VAULT_PLATFORMS } from "@/lib/vaultConfig";
import type { MidasApyMap, MidasPriceMap, MidasPendingRedemption } from "@/lib/midasApi";
import type { MorphoVaultApy } from "@/lib/morphoApi";
import type { PlatformKind } from "@/lib/vaultConfig";
import { getChainShortName, getAddressExplorerLink, getTxExplorerLink } from "@/lib/chains";

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

// Midas Deposit Vault write ABI
const MIDAS_DEPOSIT_ABI = [
  {
    name: "depositInstant",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn",          type: "address" },
      { name: "amountToken",      type: "uint256" }, // always 18 decimals
      { name: "minReceiveAmount", type: "uint256" },
      { name: "referrerId",       type: "bytes32"  },
      { name: "recipient",        type: "address"  },
    ],
    outputs: [],
  },
] as const;

// Midas Redemption Vault write + fee read ABI
const MIDAS_REDEEM_ABI = [
  {
    name: "redeemInstant",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenOut",         type: "address" },
      { name: "amountMtokenIn",   type: "uint256" },
      { name: "minReceiveAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "redeemRequest",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenOut",       type: "address" },
      { name: "amountMtokenIn", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "instantFee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }], // 1e18 = 100%
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

// ── Stat card ─────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color = "text-zinc-900 dark:text-zinc-100", loading = false,
}: {
  label: string; value: string; sub?: string; color?: string; loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-5 shadow-sm shadow-zinc-900/5 dark:border-[#1b1b1f] dark:bg-[#141417]">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      {loading ? (
        <div className="mb-1 mt-2 h-8 w-24 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" />
      ) : (
        <p className={`mt-1 text-xl font-bold leading-tight tracking-tight sm:text-2xl ${color}`}>
          {value}
        </p>
      )}
      {sub && <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

// ── Address row ───────────────────────────────────────────────────────────────

function AddressRow({ label, value, chainId = 1 }: { label: string; value: string | undefined; chainId?: number }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-2.5 last:border-b-0 dark:border-[#1b1b1f]">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <a
        href={explorerLink(value, chainId)}
        target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 font-mono text-sm font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
      >
        {shortAddr(value)} <HiOutlineExternalLink className="h-3 w-3 text-zinc-400 dark:text-zinc-500" />
      </a>
    </div>
  );
}

// ── Fee row ───────────────────────────────────────────────────────────────────

function FeeRow({ label, pct }: { label: string; pct: number | undefined; tooltip?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-2.5 last:border-b-0 dark:border-[#1b1b1f]">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span
        className={
          "text-sm font-semibold " +
          (pct === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-100")
        }
      >
        {pct != null ? `${pct.toFixed(2)}%` : "—"}
      </span>
    </div>
  );
}

// ── Vault header: protocol label (single neutral pill) ─────────────────────────

function protocolPillLabel(kind: PlatformKind): string {
  if (kind === "morpho") return "ERC-4626";
  if (kind === "midas") return "MIDAS";
  return "ERC-7540";
}

const HEADER_TAG_CLASS =
  "inline-flex items-center rounded-full bg-[#F2F2F2] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-800 dark:bg-[#141417] dark:text-[#ffffff]";
const DARK_ACTION_BTN_CLASS =
  "w-full rounded-xl border border-transparent bg-zinc-900 px-5 py-3.5 text-base font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-400/70 disabled:text-zinc-200 dark:border-[#1b1b1f] dark:bg-[#ffffff] dark:text-[#141417] dark:hover:bg-[#afafb2] dark:disabled:border-[#1b1b1f] dark:disabled:bg-[#27272b] dark:disabled:text-[#afafb2]";

function TxSummaryRow({
  label,
  value,
  valueTone = "default",
}: {
  label: string;
  value: string;
  /** Reference: gas line uses muted blue-gray */
  valueTone?: "default" | "accent";
}) {
  const valueClass =
    valueTone === "accent"
      ? "text-sm font-semibold tabular-nums text-slate-600 dark:text-zinc-400"
      : "text-sm font-semibold tabular-nums text-black dark:text-zinc-100";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-200 py-2.5 last:border-b-0 dark:border-[#1b1b1f]">
      <span className="shrink-0 text-sm text-gray-500 dark:text-[#afafb2]">{label}</span>
      <span className={`min-w-0 text-right ${valueClass}`}>{value}</span>
    </div>
  );
}

function LightSectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="rounded-lg border border-[#E1E5E1] bg-[#F1F2F0] p-3 dark:border-[#1b1b1f] dark:bg-[#141417]">
          <div className="mb-2 h-3 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VaultDetailPage() {
  const params = useParams();
  const rawAddress = Array.isArray(params.address) ? params.address[0] : (params.address ?? "");
  const vaultAddress = /^0x[0-9a-fA-F]{40}$/.test(rawAddress)
    ? (rawAddress as `0x${string}`)
    : undefined;

  const { address: userAddress, isConnected, isReconnecting, isConnecting } = useAccount();
  const { open: openWalletConnect } = useAppKit();

  // Prevent wallet-sensitive UI from rendering before wagmi has hydrated.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const walletPending = !mounted || isReconnecting || isConnecting;

  // ── Look up vault kind + chainId from static config ───────────────────────
  const vaultConfig = useMemo(() => {
    if (!vaultAddress) return null;
    const lower = vaultAddress.toLowerCase();
    for (const platform of VAULT_PLATFORMS) {
      const entry = platform.vaults.find((v) => v.address.toLowerCase() === lower);
      if (entry) return {
        kind: platform.kind,
        chainId: entry.chainId ?? platform.chainId,
        // Midas-specific fields
        midasApiKey:            entry.midasApiKey,
        depositVaultAddress:    entry.depositVaultAddress,
        redemptionVaultAddress: entry.redemptionVaultAddress,
      };
    }
    return null;
  }, [vaultAddress]);

  const midasDepositVault    = vaultConfig?.depositVaultAddress;
  const midasRedemptionVault = vaultConfig?.redemptionVaultAddress;

  const vaultKind    = vaultConfig?.kind    ?? "ultrayield";
  const vaultChainId = vaultConfig?.chainId ?? 1;

  // ── On-chain detail ───────────────────────────────────────────────────────
  const vault = useVaultDetail(vaultAddress, userAddress, vaultChainId, vaultKind);
  const midasApiKey = useMemo(() => {
    if (vaultConfig?.midasApiKey) return vaultConfig.midasApiKey.toLowerCase();
    return vault.symbol ? vault.symbol.toLowerCase() : undefined;
  }, [vaultConfig?.midasApiKey, vault.symbol]);

  // ── APY: event-log for UltraYield; Morpho API otherwise ──────────────────
  const { apy: ultrayieldApy, label: apyLabel, isLoading: apyLoading } = use7dApy(
    vaultKind === "ultrayield" ? vault.oracle : undefined,
    vaultKind === "ultrayield" ? vaultAddress : undefined,
    vaultKind === "ultrayield" ? vault.assetAddress : undefined,
    vaultChainId,
  );

  const { data: morphoApyData, isLoading: morphoApyLoading } = useQuery({
    queryKey: ["morphoDetailApy", vaultChainId, vaultAddress],
    enabled: vaultKind === "morpho" && !!vaultAddress,
    staleTime: 5 * 60 * 1_000,
    gcTime: 15 * 60 * 1_000,
    queryFn: async () => {
      const params = new URLSearchParams({
        addresses: vaultAddress!,
        chainId: String(vaultChainId),
      });
      const res = await fetch(`/api/morpho/apys?${params}`);
      if (!res.ok) throw new Error(`Morpho APY API error: ${res.status}`);
      return res.json() as Promise<Record<string, MorphoVaultApy>>;
    },
  });

  const morphoApiEntry = morphoApyData?.[vaultAddress?.toLowerCase() ?? ""];

  const morphoApy = useMemo(
    () => morphoApiEntry?.weeklyNetApy ?? null,
    [morphoApiEntry]
  );

  // ── Midas REST API — APY, price, pending redemptions ─────────────────────
  const { data: midasApyMap, isLoading: midasApyLoading } = useQuery({
    queryKey: ["midasDetailApys"],
    enabled: vaultKind === "midas",
    staleTime: 5 * 60 * 1_000,
    gcTime:    15 * 60 * 1_000,
    queryFn: () =>
      fetch("/api/midas/apys").then((r) => {
        if (!r.ok) throw new Error(`Midas APY API error: ${r.status}`);
        return r.json() as Promise<MidasApyMap>;
      }),
  });

  const { data: midasPriceMap, isLoading: midasPriceLoading } = useQuery({
    queryKey: ["midasDetailPrices"],
    enabled: vaultKind === "midas",
    staleTime: 10 * 60 * 1_000,
    gcTime:    20 * 60 * 1_000,
    queryFn: () =>
      fetch("/api/midas/prices").then((r) => {
        if (!r.ok) throw new Error(`Midas prices API error: ${r.status}`);
        return r.json() as Promise<MidasPriceMap>;
      }),
  });

  const { data: midasPendingRedemptions = [], isLoading: midasPendingLoading } = useQuery({
    queryKey: ["midasPending", vaultChainId, vaultAddress, userAddress],
    enabled: vaultKind === "midas" && !!vaultAddress && !!userAddress,
    staleTime: 60 * 1_000,
    gcTime:    5 * 60 * 1_000,
    queryFn: async () => {
      const params = new URLSearchParams({
        chainId: String(vaultChainId),
        token: vaultAddress!,
        ...(userAddress ? { address: userAddress } : {}),
      });
      const res = await fetch(`/api/midas/pending?${params}`);
      if (!res.ok) return [] as MidasPendingRedemption[];
      return res.json() as Promise<MidasPendingRedemption[]>;
    },
  });

  // ── Midas instantFee from redemption vault ────────────────────────────────
  const { data: midasFeeData } = useReadContracts({
    contracts: midasRedemptionVault
      ? [{ address: midasRedemptionVault, abi: MIDAS_REDEEM_ABI, functionName: "instantFee" as const, chainId: vaultChainId }]
      : [],
    query: { enabled: !!midasRedemptionVault },
  });
  const midasInstantFeeRaw = midasFeeData?.[0]?.status === "success" ? (midasFeeData[0].result as bigint) : undefined;
  const midasInstantFeePct = midasInstantFeeRaw !== undefined ? Number(midasInstantFeeRaw) / 1e16 : undefined;

  // ── Derived Midas values ──────────────────────────────────────────────────
  const midasPrice = midasApiKey && midasPriceMap ? (midasPriceMap[midasApiKey] ?? null) : null;
  const midasApy   = midasApiKey && midasApyMap   ? (midasApyMap[midasApiKey]   ?? null) : null;
  const USDC_DEC   = 6;
  // totalSupply is in 18-decimal share units; price is USD per share
  const midasTvlFormatted = useMemo(() => {
    if (!vault.totalSupply || midasPrice === null) return "—";
    const tvl = (Number(vault.totalSupply) / 1e18) * midasPrice;
    if (tvl >= 1_000_000) return `${(tvl / 1_000_000).toFixed(2)}M USD`;
    if (tvl >= 1_000)     return `${(tvl / 1_000).toFixed(2)}K USD`;
    return `${tvl.toFixed(2)} USD`;
  }, [vault.totalSupply, midasPrice]);
  const midasSharePriceFormatted = midasPrice !== null ? `$${midasPrice.toFixed(6)}` : "—";
  const midasUserValueFormatted = useMemo(() => {
    if (!vault.userShares || midasPrice === null) return "—";
    const val = (Number(vault.userShares) / 1e18) * midasPrice;
    return `${val.toFixed(4)} USD`;
  }, [vault.userShares, midasPrice]);

  // When the on-chain name() call fails it falls back to the raw address.
  // Use the Morpho API name as a secondary fallback so the page always shows
  // a human-readable label even if the RPC call fails.
  const displayName = useMemo(() => {
    if (!vault.name || /^0x[0-9a-fA-F]{40}$/i.test(vault.name)) {
      return morphoApiEntry?.name ?? vault.name;
    }
    return vault.name;
  }, [vault.name, morphoApiEntry]);

  const displayApy = vaultKind === "midas"
    ? (midasApy !== null ? midasApy * 100 : null)
    : vaultKind === "morpho"
      ? (morphoApy !== null ? morphoApy * 100 : null)
      : ultrayieldApy;
  const displayApyLabel = vaultKind === "midas" ? "APY" : vaultKind === "morpho" ? "7D Net APY" : apyLabel;
  const displayApyLoading = vaultKind === "midas" ? midasApyLoading : vaultKind === "morpho" ? morphoApyLoading : apyLoading;
  const displayApySub = vaultKind === "midas"
    ? "APY via Midas REST API (~10 min cache)"
    : vaultKind === "morpho"
      ? "Weekly net APY via Morpho API"
      : "Annualised from oracle event logs";

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
  // For Midas the spender is the deposit vault, not the share token
  const depositSpenderAddr = vaultKind === "midas" ? midasDepositVault : vaultAddress;

  // balance + allowance for the payment/deposit asset
  const { data: depositAssetMeta } = useReadContracts({
    contracts: userAddress && depositAssetAddr && depositSpenderAddr
      ? [
          { address: depositAssetAddr, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [userAddress]                              as [`0x${string}`],                    chainId: vaultChainId },
          { address: depositAssetAddr, abi: ERC20_ABI, functionName: "allowance" as const, args: [userAddress, depositSpenderAddr]           as [`0x${string}`, `0x${string}`],     chainId: vaultChainId },
        ]
      : [],
    query: { enabled: !!userAddress && !!depositAssetAddr && !!depositSpenderAddr },
  });

  // For Midas: live share token balance (separate call to avoid mixed-functionName inference)
  const { data: midasShareBalData } = useReadContracts({
    contracts: vaultKind === "midas" && userAddress && vaultAddress
      ? [{ address: vaultAddress, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [userAddress] as [`0x${string}`], chainId: vaultChainId }]
      : [],
    query: { enabled: vaultKind === "midas" && !!userAddress && !!vaultAddress },
  });

  const depositAssetBalance   = depositAssetMeta?.[0]?.status === "success" ? (depositAssetMeta[0].result as bigint) : undefined;
  const depositAssetAllowance = depositAssetMeta?.[1]?.status === "success" ? (depositAssetMeta[1].result as bigint) : undefined;
  const midasLiveShares       = midasShareBalData?.[0]?.status === "success" ? (midasShareBalData[0].result as bigint) : undefined;

  const assetDecForDisplay = vaultKind === "morpho" ? morphoDepositDec : (depositAsset?.decimals ?? 18);
  const assetSymForDisplay = vaultKind === "morpho" ? morphoDepositSym : (depositAsset?.symbol ?? "—");

  const depositAssetBalanceFmt = useMemo(() => {
    if (depositAssetBalance === undefined) return "—";
    const n = parseFloat(formatUnits(depositAssetBalance, assetDecForDisplay));
    if (n === 0) return `0 ${assetSymForDisplay}`;
    const dp = assetDecForDisplay >= 8 ? 8 : assetDecForDisplay >= 6 ? 6 : 4;
    const fixed = n.toFixed(dp);
    if (parseFloat(fixed) === 0) {
      const sigPos = -Math.floor(Math.log10(n));
      return `${n.toFixed(sigPos)} ${assetSymForDisplay}`;
    }
    return `${fixed} ${assetSymForDisplay}`;
  }, [depositAssetBalance, assetDecForDisplay, assetSymForDisplay]);

  // ── State + write contract ────────────────────────────────────────────────
  const [depositAmount, setDepositAmount] = useState("");
  const [redeemAmount, setRedeemAmount]   = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  /** 0 = Deposit, 1 = Withdraw/Redeem — local tabs (light UI, same as Carbon Tabs) */
  const [actionTabIdx, setActionTabIdx] = useState(0);
  useEffect(() => {
    setActionTabIdx(0);
  }, [vaultAddress]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);

  const { writeContract, data: txHash, isPending: isWritePending, error: writeError, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isTxReverted } = useWaitForTransactionReceipt({ hash: txHash });
  const isBusy = isWritePending || isConfirming;

  const [lastAction, setLastAction] = useState<"deposit" | "withdraw" | "approve" | "claim" | "cancel" | "">("");
  const [txFeedback, setTxFeedback] = useState<{ status: "success" | "error"; action: string } | null>(null);

  const queryClient = useQueryClient();

  // When a Midas redeemRequest tx confirms, bust the server-side pending cache
  // so the new request appears immediately instead of waiting up to 60 s.
  useEffect(() => {
    if (!isConfirmed || vaultKind !== "midas" || !vaultAddress || !userAddress) return;
    void queryClient.invalidateQueries({
      queryKey: ["midasPending", vaultChainId, vaultAddress, userAddress],
    });
  }, [isConfirmed, vaultKind, vaultAddress, vaultChainId, userAddress, queryClient]);

  // Refresh all data sources after any confirmed tx (deposit/redeem/approve/claim).
  useEffect(() => {
    if (!isConfirmed) return;
    void queryClient.invalidateQueries();
  }, [isConfirmed, queryClient]);

  // Show inline success feedback after tx confirms
  useEffect(() => {
    if (!isConfirmed || !lastAction) return;
    setTxFeedback({ status: "success", action: lastAction });
  }, [isConfirmed, lastAction]);

  // Show inline error feedback on wallet rejection or on-chain revert
  useEffect(() => {
    if ((!writeError && !isTxReverted) || !lastAction) return;
    setTxFeedback({ status: "error", action: lastAction });
  }, [writeError, isTxReverted, lastAction]);

  // Clear feedback when user edits the amount
  useEffect(() => { setTxFeedback(null); }, [depositAmount, redeemAmount]);

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

  // For Midas deposits: amount must be scaled to 18 decimals
  const midasDepositParsed18 = useMemo(() => {
    if (vaultKind !== "midas" || depositAmountParsed <= BigInt(0)) return BigInt(0);
    const payDec = depositAsset?.decimals ?? 6;
    if (payDec === 18) return depositAmountParsed;
    return depositAmountParsed * BigInt(10 ** (18 - payDec));
  }, [vaultKind, depositAmountParsed, depositAsset]);

  // ── Write handlers ────────────────────────────────────────────────────────

  function handleApproveAsset() {
    if (!depositAssetAddr || !depositSpenderAddr) return;
    setLastAction("approve"); setTxFeedback(null); resetWrite();
    writeContract({ address: depositAssetAddr, abi: ERC20_ABI, functionName: "approve", args: [depositSpenderAddr, maxUint256] });
  }

  // Midas deposit (depositInstant on deposit vault, amount always 18 decimals)
  function handleMidasDeposit() {
    if (!midasDepositVault || !depositAssetAddr || !userAddress || midasDepositParsed18 <= BigInt(0)) return;
    setLastAction("deposit"); setTxFeedback(null); resetWrite();
    writeContract({
      address: midasDepositVault,
      abi: MIDAS_DEPOSIT_ABI,
      functionName: "depositInstant",
      args: [depositAssetAddr as `0x${string}`, midasDepositParsed18, BigInt(0), MIDAS_DEPOSIT_REFERRAL_ID, userAddress],
    });
  }

  // Midas instant redeem (with fee)
  function handleMidasRedeemInstant() {
    if (!midasRedemptionVault || !depositAssetAddr || redeemAmountParsed <= BigInt(0)) return;
    setConfirmMessage(`Confirm instant redeem ${redeemAmount || "0"} ${vault.symbol || "shares"}?`);
    setConfirmAction(() => () => {
      setLastAction("withdraw"); setTxFeedback(null); resetWrite();
      writeContract({
        address: midasRedemptionVault,
        abi: MIDAS_REDEEM_ABI,
        functionName: "redeemInstant",
        args: [depositAssetAddr as `0x${string}`, redeemAmountParsed, BigInt(0)],
      });
    });
    setConfirmOpen(true);
  }

  // Midas standard (async) redeem (fee-free, no cancel)
  function handleMidasRedeemRequest() {
    if (!midasRedemptionVault || !depositAssetAddr || redeemAmountParsed <= BigInt(0)) return;
    setConfirmMessage(`Confirm async redeem request for ${redeemAmount || "0"} ${vault.symbol || "shares"}?`);
    setConfirmAction(() => () => {
      setLastAction("withdraw"); setTxFeedback(null); resetWrite();
      writeContract({
        address: midasRedemptionVault,
        abi: MIDAS_REDEEM_ABI,
        functionName: "redeemRequest",
        args: [depositAssetAddr as `0x${string}`, redeemAmountParsed],
      });
    });
    setConfirmOpen(true);
  }

  // UltraYield deposit
  function handleUYDeposit() {
    const asset = depositAsset;
    if (!vaultAddress || !asset || !userAddress || depositAmountParsed <= BigInt(0)) return;
    setLastAction("deposit"); setTxFeedback(null); resetWrite();
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
    setLastAction("deposit"); setTxFeedback(null); resetWrite();
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
    setConfirmMessage(`Confirm redeem ${redeemAmount || "0"} ${vault.symbol || "shares"}?`);
    setConfirmAction(() => () => {
      setLastAction("withdraw"); setTxFeedback(null); resetWrite();
      writeContract({
        address: vaultAddress,
        abi: ERC4626_WRITE_ABI,
        functionName: "redeem",
        args: [redeemAmountParsed, userAddress, userAddress],
      });
    });
    setConfirmOpen(true);
  }

  // UltraYield share approval + async redeem
  function handleApproveShares() {
    if (!vaultAddress) return;
    setLastAction("approve"); setTxFeedback(null); resetWrite();
    writeContract({ address: vaultAddress, abi: ERC20_ABI, functionName: "approve", args: [vaultAddress, maxUint256] });
  }
  function handleRequestRedeem() {
    if (!vaultAddress || !vault.assetAddress || !userAddress || redeemAmountParsed <= BigInt(0)) return;
    const assetAddress = vault.assetAddress;
    setConfirmMessage(`Confirm request redeem ${redeemAmount || "0"} ${vault.symbol || "shares"}?`);
    setConfirmAction(() => () => {
      setLastAction("withdraw"); setTxFeedback(null); resetWrite();
      writeContract({ address: vaultAddress, abi: VAULT_WRITE_ABI, functionName: "requestRedeemOfAsset", args: [assetAddress, redeemAmountParsed, userAddress, userAddress] });
    });
    setConfirmOpen(true);
  }
  function handleCancelRedeem() {
    if (!vaultAddress || !vault.assetAddress || !userAddress) return;
    setLastAction("cancel"); setTxFeedback(null); resetWrite();
    writeContract({ address: vaultAddress, abi: VAULT_WRITE_ABI, functionName: "cancelRedeemRequestOfAsset", args: [vault.assetAddress, userAddress, userAddress] });
  }
  function handleClaim() {
    if (!vaultAddress || !vault.assetAddress || !userAddress || !vault.claimableShares || vault.claimableShares === BigInt(0)) return;
    setLastAction("claim"); setTxFeedback(null); resetWrite();
    writeContract({ address: vaultAddress, abi: VAULT_WRITE_ABI, functionName: "redeemAsset", args: [vault.assetAddress, vault.claimableShares, userAddress, userAddress] });
  }

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!vaultAddress) {
    return (
      <div className="min-h-full bg-white dark:bg-[#000000]">
        <div className="mx-auto max-w-[900px] px-6 py-16 lg:px-8">
          <div className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]">
            <p className="text-sm font-semibold text-red-700">Invalid vault address</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              The address in the URL is not a valid Ethereum address.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const assetSym    = vault.assetSymbol ?? "—";
  // For Midas: asset address doesn't exist (not ERC-4626). Action panel should
  // still show as long as we have payment tokens or deposit vault configured.
  const hasAssetAddr = vaultKind === "midas"
    ? (supportedAssets.length > 0 || !!midasDepositVault)
    : !!vault.assetAddress;

  async function copyVaultAddress() {
    if (!vaultAddress) return;
    try {
      await navigator.clipboard.writeText(vaultAddress);
      setAddressCopied(true);
      window.setTimeout(() => setAddressCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  function handleMaxDeposit() {
    if (depositAssetBalance === undefined || depositAssetBalance <= BigInt(0)) return;
    setDepositAmount(formatUnits(depositAssetBalance, assetDecForDisplay));
  }

  function handleMaxRedeem() {
    const raw =
      vaultKind === "midas" && midasLiveShares !== undefined ? midasLiveShares : vault.userShares;
    if (raw === undefined || raw <= BigInt(0)) return;
    setRedeemAmount(formatUnits(raw, vault.decimals));
  }

  const chainPill = getChainShortName(vaultChainId).toUpperCase();

  return (
    <div className="min-h-full bg-white dark:bg-[#000000]">
        <div className="mx-auto w-full p-4 lg:p-6">
          {/* lg+: name + stats + details on the left; Deposit/Withdraw card top-aligned on the right (~1/3 width) */}
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-x-10">
            <div className="flex min-w-0 flex-1 flex-col gap-8">
              <div className="space-y-8">

          {/* Page header — breadcrumb › title › address box › tags */}
          <header className="">
            <nav className="mb-5 text-sm" aria-label="Breadcrumb">
              <Link
                href="/"
                className="text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Vaults
              </Link>
              <span className="mx-2 text-zinc-400 dark:text-zinc-500" aria-hidden>
                ›
              </span>
              <span className="text-zinc-600 dark:text-zinc-300">
                {vault.isLoading ? "…" : displayName}
              </span>
            </nav>

            {vault.isLoading ? (
              <div className="h-10 w-64 max-w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
            ) : (
              <h1 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100 sm:text-4xl">
                {displayName}
              </h1>
            )}

            <div className="mt-4 flex max-w-full flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200/90 bg-[#F2F2F2] px-3 py-2 dark:border-[#1b1b1f] dark:bg-[#141417]">
                <span className="font-mono text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {shortAddr(vaultAddress)}
                </span>
                <button
                  type="button"
                  onClick={() => void copyVaultAddress()}
                  className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                  aria-label={addressCopied ? "Copied" : "Copy contract address"}
                  title={addressCopied ? "Copied" : "Copy address"}
                >
                  <HiOutlineDocumentDuplicate className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
                <a
                  href={explorerLink(vaultAddress, vaultChainId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                  aria-label="View on block explorer"
                  title="Block explorer"
                >
                  <HiOutlineExternalLink className="h-4 w-4" aria-hidden />
                </a>
              </div>
              {addressCopied && (
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Copied</span>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {vault.symbol && (
                <span className={HEADER_TAG_CLASS}>{vault.symbol.toUpperCase()}</span>
              )}
              {supportedAssets.length > 0
                ? supportedAssets.map((a) => (
                    <span key={a.address} className={HEADER_TAG_CLASS}>
                      {a.symbol.toUpperCase()}
                    </span>
                  ))
                : assetSym !== "—" && (
                    <span className={HEADER_TAG_CLASS}>{assetSym.toUpperCase()}</span>
                  )}
              <span className={HEADER_TAG_CLASS}>
                <span className="mr-1 text-zinc-600 dark:text-zinc-300" aria-hidden>
                  ●
                </span>
                {vault.isPaused ? "PAUSED" : "ACTIVE"}
              </span>
              <span className={HEADER_TAG_CLASS}>{protocolPillLabel(vaultKind)}</span>
              <span className={HEADER_TAG_CLASS}>{chainPill}</span>
            </div>
          </header>

          {/* Active position banner */}
          {isConnected && !walletPending && vault.userShares !== undefined && vault.userShares > BigInt(0) && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 shadow-sm dark:border-emerald-800 dark:bg-emerald-900/30">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                  You have an active position in this vault
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                    Shares
                  </span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{vault.userSharesFormatted}</span>
                </div>
                <div>
                  <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                    Value
                  </span>
                  <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {vaultKind === "midas" ? midasUserValueFormatted : vault.userAssetsFormatted}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Tx feedback */}
          {isConfirmed && (
            <div className="mb-4 rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]">
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-emerald-700">Transaction confirmed</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  {txHash ? `Hash: ${txHash.slice(0, 18)}…` : "Transaction confirmed"}
                </p>
              </div>
              {txHash && (
                <a
                  href={getTxExplorerLink(txHash, vaultChainId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-4 ml-4 inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100"
                >
                  View transaction
                </a>
              )}
            </div>
          )}
          {writeError && (
            <div className="mb-6 rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]">
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-red-700">Transaction failed</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">{writeError.message.slice(0, 140)}</p>
              </div>
            </div>
          )}

          {/* Stat cards: 3 per row on lg (5 cards → 3 + 2) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Total Value Locked"
              value={vaultKind === "midas" ? midasTvlFormatted : vault.tvlFormatted}
              sub={vaultKind === "midas" ? "totalSupply × price (Midas API)" : "totalAssets() via contract"}
              color="text-zinc-900 dark:text-zinc-100"
              loading={vault.isLoading || (vaultKind === "midas" && midasPriceLoading)}
            />
            <StatCard label="Total Supply" value={vault.totalSupplyFormatted} sub="Vault shares outstanding" loading={vault.isLoading} />
            <StatCard
              label="Share Price"
              value={vaultKind === "midas" ? midasSharePriceFormatted : vault.sharePriceFormatted}
              sub={vaultKind === "midas" ? "USD price via Midas API" : `1 ${vault.symbol || "share"} = X ${assetSym}`}
              color="text-zinc-900 dark:text-zinc-100"
              loading={vault.isLoading || (vaultKind === "midas" && midasPriceLoading)}
            />
            <StatCard
              label={displayApyLabel}
              value={displayApy !== null ? `${displayApy >= 0 ? "+" : ""}${displayApy.toFixed(2)}%` : "—"}
              sub={displayApySub}
              color={
                displayApy === null
                  ? "text-zinc-400 dark:text-zinc-500"
                  : displayApy >= 0
                    ? "text-emerald-600"
                    : "text-amber-600"
              }
              loading={vault.isLoading || displayApyLoading}
            />
            <StatCard
              label="Vault status"
              value={vaultKind === "midas" ? "Active" : vault.isPaused ? "Paused" : "Active"}
              sub={vaultKind === "midas" ? "Functions pausable per Midas team" : vault.isPaused ? "Deposits disabled" : "Accepting deposits"}
              color={vaultKind === "midas" || !vault.isPaused ? "text-emerald-600" : "text-amber-600"}
              loading={vault.isLoading}
            />
          </div>

              </div>

              <div className="flex flex-col gap-6">

              {/* Your Position */}
              {(isConnected || walletPending) && (
                <section className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-6 shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="mt-1.5 h-6 w-1 shrink-0 rounded-full bg-zinc-900 dark:bg-zinc-100" aria-hidden />
                    <h2 className="text-[1.55rem] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Your position</h2>
                  </div>
                  <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      { label: "Shares Held",
                        value: vault.userSharesFormatted,
                        color: "text-violet-700",
                        isLoading: vault.isLoading },
                      { label: "Asset Value",
                        value: vaultKind === "midas" ? midasUserValueFormatted : vault.userAssetsFormatted,
                        color: "text-blue-700",
                        isLoading: vault.isLoading },
                      { label: "Wallet Balance",
                        value: vaultKind === "midas" ? (depositAssetBalance !== undefined ? `${parseFloat(formatUnits(depositAssetBalance, assetDecForDisplay)).toFixed(4)} ${assetSymForDisplay}` : "—") : vault.userAssetBalanceFormatted,
                        color: "text-zinc-800 dark:text-zinc-100",
                        isLoading: vault.isLoading },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg border border-[#E1E5E1] bg-[#F1F2F0] p-4 dark:border-[#1b1b1f] dark:bg-[#141417]">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{s.label}</p>
                        {s.isLoading ? (
                          <div className="h-6 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                        ) : (
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* UltraYield-only: pending + claimable redeem */}
                  {vaultKind === "ultrayield" && vault.pendingShares !== undefined && vault.pendingShares > BigInt(0) && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-800 dark:bg-amber-900/25">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-amber-800">Pending redemption</p>
                          <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-100">
                            {vault.pendingShares !== undefined
                              ? `${parseFloat(formatUnits(vault.pendingShares, vault.decimals)).toFixed(6)} ${vault.symbol}`
                              : "—"
                            } escrowed · fulfillment ≤ 72h
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCancelRedeem}
                          disabled={isBusy}
                          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-60 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
                        >
                          {isBusy ? "Cancelling..." : "Cancel"}
                        </button>
                      </div>
                    </div>
                  )}
                  {vaultKind === "ultrayield" && vault.claimableAssets !== undefined && vault.claimableAssets > BigInt(0) && (
                    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/90 p-4 dark:border-emerald-800 dark:bg-emerald-900/30">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-emerald-800">Ready to claim</p>
                          <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-100">
                            {vault.claimableAssets !== undefined
                              ? `${parseFloat(formatUnits(vault.claimableAssets, vault.assetDecimals ?? 18)).toFixed(6)} ${vault.assetSymbol ?? ""}`
                              : "—"
                            } available
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleClaim}
                          disabled={isBusy}
                          className={DARK_ACTION_BTN_CLASS}
                        >
                          {isBusy ? "Claiming..." : "Claim Assets"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Midas: pending (async) redemption requests */}
                  {vaultKind === "midas" && (
                    <div className="mt-2">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Pending standard redemptions
                      </p>
                      {midasPendingLoading ? (
                        <div className="space-y-2">
                          <div className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                          <div className="h-4 w-[66%] animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                        </div>
                      ) : midasPendingRedemptions.length === 0 ? (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">No pending redemption requests.</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {midasPendingRedemptions.map((r, idx) => (
                            <div key={idx} className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                              <div className="flex flex-wrap justify-between gap-2">
                                <div>
                                  <p className="text-xs font-semibold text-amber-900">Async redemption pending</p>
                                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
                                    Amount: {r.amount ? `${parseFloat(formatUnits(BigInt(r.amount), 18)).toFixed(6)} ${vault.symbol}` : "—"}
                                  </p>
                                  {r.createdAt && (
                                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                      Requested: {new Date(r.createdAt).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right text-xs text-zinc-600 dark:text-zinc-300">
                                  <p className="mb-1">Processing on first-come basis</p>
                                  <p className="font-medium text-amber-700">No cancellation possible</p>
                                  {r.txHash && (
                                    <a
                                      href={getAddressExplorerLink(`0x${r.txHash.replace(/^0x/, "")}` as `0x${string}`, vaultChainId)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-1 inline-block font-medium text-zinc-900 underline dark:text-zinc-100"
                                    >
                                      View tx ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Fee Structure */}
              <section className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-6 shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]">
                <div className="mb-4 flex items-start gap-3">
                  <span className="mt-1.5 h-6 w-1 shrink-0 rounded-full bg-zinc-900 dark:bg-zinc-100" aria-hidden />
                  <h2 className="text-[1.55rem] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Fee structure</h2>
                </div>
                {vaultKind === "midas" ? (
                  <>
                    <FeeRow label="Instant Redemption Fee"
                      pct={midasInstantFeePct}
                      tooltip="Fee charged for atomic (instant) redemptions. Read from the redemption vault's instantFee parameter." />
                    <FeeRow label="Standard Redemption Fee"
                      pct={0}
                      tooltip="No fee for standard (async) redemptions — processed in order by the Midas team." />
                    <FeeRow label="Deposit Fee"
                      pct={0}
                      tooltip="No fee for minting Midas tokens via depositInstant." />
                  </>
                ) : vault.isLoading ? (
                  <LightSectionSkeleton rows={3} />
                ) : (
                  <>
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
                        <div className="flex items-center justify-between border-b border-zinc-100 py-2.5 last:border-b-0 dark:border-[#1b1b1f]">
                          <span className="text-sm text-zinc-500 dark:text-zinc-400">Withdrawal Period</span>
                          <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            3 days
                          </span>
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>

              {/* Vault Mechanics — platform-specific */}
              <section className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-6 shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]">
                <div className="mb-4 flex items-start gap-3">
                  <span className="mt-1.5 h-6 w-1 shrink-0 rounded-full bg-zinc-900 dark:bg-zinc-100" aria-hidden />
                  <h2 className="text-[1.55rem] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Vault mechanics</h2>
                </div>
                {vault.isLoading ? (
                  <LightSectionSkeleton rows={4} />
                ) : (
                  <div className="flex flex-col gap-4">
                    {(vaultKind === "midas"
                      ? [
                          { title: "Token",          desc: "ERC-20 RWA token — NOT ERC-4626. Each token has a separate Deposit Vault and Redemption Vault." },
                          { title: "Deposit",        desc: "Call depositInstant(tokenIn, amount18, 0, referrerId) on the Deposit Vault. amountToken is always 18 decimals regardless of payment token decimals." },
                          { title: "Instant Redeem", desc: `Call redeemInstant on the Redemption Vault. Atomic — funds returned immediately. Fee: ${midasInstantFeePct !== undefined ? `${midasInstantFeePct.toFixed(2)}%` : "see instantFee"}.` },
                          { title: "Async Redeem",   desc: "Call redeemRequest on the Redemption Vault. Token leaves wallet, processed first-come first-served. No fee. No cancellation possible." },
                          { title: "Pricing",        desc: "Share price updated by Midas via NAV report → customFeed → dataFeed. Price reflects yield but not side rewards." },
                          { title: "Upgrades",       desc: "Contracts are upgradable (progressively tied to timelock). Midas communicates upgrades with notice and audits." },
                        ]
                      : vaultKind === "morpho"
                        ? [
                            { title: "Deposit",   desc: "Standard ERC-4626 — deposit assets, receive shares instantly." },
                            { title: "Withdraw",  desc: "Standard ERC-4626 — redeem shares, receive assets instantly (subject to available liquidity)." },
                            { title: "Pricing",   desc: "Share price derived from totalAssets / totalSupply. Liquidity allocated across Morpho markets by curators." },
                            { title: "Curation",  desc: "Curators manage market allocations and risk parameters. No operator queue — withdrawals are immediate." },
                          ]
                        : [
                            { title: "Deposit",        desc: "Synchronous — assets move to fundsHolder immediately. Returns vault shares." },
                            { title: "Redeem Request",  desc: "Async (ERC-7540) — shares escrowed in vault. Operator fulfills within 72h." },
                            { title: "Claim",          desc: "After operator fulfillment, assets become claimable via redeemAsset()." },
                            { title: "Pricing",        desc: "Share price set by on-chain oracle (UltraVaultOracle). totalAssets() = oracle.getQuote(totalSupply, share, asset)." },
                            { title: "Cancel",         desc: "Pending redeem requests can be cancelled before operator fulfillment." },
                          ]
                    ).map((item) => (
                      <div
                        key={item.title}
                        className="flex flex-col gap-1.5 sm:flex-row sm:gap-3"
                      >
                        <span className="shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:min-w-[130px] sm:pt-0.5">
                          {item.title}
                        </span>
                        <span className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                          {item.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Contract Addresses */}
              <section className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-6 shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]">
                <div className="mb-4 flex items-start gap-3">
                  <span className="mt-1.5 h-6 w-1 shrink-0 rounded-full bg-zinc-900 dark:bg-zinc-100" aria-hidden />
                  <h2 className="text-[1.55rem] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Smart contracts</h2>
                </div>
                {vault.isLoading
                  ? <LightSectionSkeleton rows={4} />
                  : vaultKind === "midas"
                    ? <>
                        <AddressRow label="Share Token"      value={vaultAddress}            chainId={vaultChainId} />
                        <AddressRow label="Deposit Vault"    value={midasDepositVault}         chainId={vaultChainId} />
                        <AddressRow label="Redemption Vault" value={midasRedemptionVault}      chainId={vaultChainId} />
                        {supportedAssets.map((a) => (
                          <AddressRow key={a.address} label={`${a.symbol} (payment token)`} value={a.address} chainId={vaultChainId} />
                        ))}
                      </>
                    : <>
                        <AddressRow label="Vault"         value={vaultAddress}        chainId={vaultChainId} />
                        {supportedAssets.length > 0
                          ? supportedAssets.map((a) => (
                              <AddressRow key={a.address} label={`${a.symbol} (asset token)`} value={a.address} chainId={vaultChainId} />
                            ))
                          : <AddressRow label="Asset Token" value={vault.assetAddress} chainId={vaultChainId} />
                        }
                        {vaultKind === "ultrayield" && (
                          <>
                            <AddressRow label="Oracle"        value={vault.oracle}         chainId={vaultChainId} />
                            <AddressRow label="Rate Provider" value={vault.rateProvider}  chainId={vaultChainId} />
                          </>
                        )}
                      </>
                }
              </section>
            </div>
            </div>

            {/* ── RIGHT COLUMN — deposit / withdraw (reference layout) ─ */}
            <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:w-[420px] lg:max-w-[420px] lg:self-start">
              <div className="rounded-2xl border border-[#E1E5E1] bg-[#F1F2F0] p-6 shadow-sm shadow-gray-900/5 dark:border-[#1b1b1f] dark:bg-[#141417]">
                {walletPending || (isConnected && vault.isLoading && !hasAssetAddr) ? (
                  <p className="py-12 text-center text-sm text-gray-500 dark:text-zinc-400">Loading vault data…</p>
                ) : isConnected && !hasAssetAddr ? (
                  <p className="py-12 text-center text-sm text-gray-500 dark:text-zinc-400">
                    {vault.isLoading ? "Loading vault data…" : "Asset address unavailable"}
                  </p>
                ) : (
                  <>
                    <div
                      className="mb-6 flex gap-6 border-b border-gray-200 dark:border-[#1b1b1f]"
                      role="tablist"
                      aria-label="Vault actions"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={actionTabIdx === 0}
                        className={
                          "-mb-px flex-1 border-b-[3px] pb-3 text-center text-sm transition " +
                          (actionTabIdx === 0
                            ? "border-black font-bold text-black dark:border-[#2a2a2e] dark:text-zinc-100"
                            : "border-transparent font-medium text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-200")
                        }
                        onClick={() => setActionTabIdx(0)}
                      >
                        Deposit
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={actionTabIdx === 1}
                        className={
                          "-mb-px flex-1 border-b-[3px] pb-3 text-center text-sm transition " +
                          (actionTabIdx === 1
                            ? "border-black font-bold text-black dark:border-[#2a2a2e] dark:text-zinc-100"
                            : "border-transparent font-medium text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-200")
                        }
                        onClick={() => setActionTabIdx(1)}
                      >
                        {vaultKind === "midas" ? "Redeem" : "Withdraw"}
                      </button>
                    </div>

                    {actionTabIdx === 0 && (
                      <div>
                        {(vaultKind === "midas" || vaultKind === "ultrayield") && supportedAssets.length > 1 && (
                          <div className="mb-4">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                              {vaultKind === "midas" ? "Payment token" : "Deposit asset"}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {supportedAssets.map((a) => (
                                <button
                                  key={a.address}
                                  type="button"
                                  disabled={!isConnected}
                                  onClick={() => {
                                    setSelectedAssetAddr(a.address);
                                    setDepositAmount("");
                                  }}
                                  className={
                                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 " +
                                    (depositAsset?.address === a.address
                                      ? "border-black bg-black text-white dark:border-[#2a2a2e] dark:bg-zinc-100 dark:text-zinc-900"
                                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff] dark:hover:border-[#afafb2]")
                                  }
                                >
                                  {a.symbol}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mb-2 flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                            Input amount
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                            Balance: {depositAssetBalanceFmt}
                          </span>
                        </div>

                        <div className="mb-4 flex rounded-xl border border-gray-200 bg-[#EEEEEE] px-3 py-1 pl-3 dark:border-[#1b1b1f] dark:bg-[#141417]">
                          <input
                            id="detail-deposit"
                            placeholder="0.00"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            type="number"
                            min={0}
                            disabled={!isConnected || isBusy || vault.isPaused}
                            className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-base font-semibold text-slate-700 placeholder:text-gray-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-0 disabled:opacity-50 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                          />
                          <div className="flex shrink-0 items-center gap-1.5 pr-0.5">
                            <span className="text-sm font-semibold text-gray-700 dark:text-zinc-200">{assetSymForDisplay}</span>
                            <button
                              type="button"
                              disabled={!isConnected || isBusy || vault.isPaused || depositAssetBalance === undefined}
                              onClick={handleMaxDeposit}
                              className="rounded-md bg-gray-200 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-800 transition hover:bg-gray-300 disabled:opacity-40 dark:border dark:border-[#1b1b1f] dark:bg-[#27272b] dark:text-[#ffffff] dark:hover:bg-[#afafb2]"
                            >
                              Max
                            </button>
                          </div>
                        </div>

                        <div className="mb-4 rounded-xl bg-white/70 px-1 dark:bg-[#141417]/70">
                          <TxSummaryRow
                            label="You will receive"
                            value={`${depositAmount || "0.00"} ${(vault.symbol || "shares").toUpperCase()}`}
                          />
                        </div>

                        {vaultKind === "midas" && (
                          <p className="mb-4 text-xs text-gray-500 dark:text-zinc-400">
                            Instant mint — {vault.symbol || "token"} delivered to your wallet immediately.
                          </p>
                        )}

                        {isConnected && (
                          <label className="mb-4 flex cursor-pointer items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={termsAccepted}
                              onChange={(e) => setTermsAccepted(e.target.checked)}
                              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
                            />
                            <span className="text-xs leading-relaxed text-gray-500 dark:text-zinc-400">
                              I agree to the{" "}
                              <a href="#" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                                Privacy Policy
                              </a>
                              {" "}and{" "}
                              <a href="#" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                                Terms of Use
                              </a>
                            </span>
                          </label>
                        )}

                        {isConnected && txFeedback?.action === "deposit" && (
                          <div className={`mb-3 rounded-lg px-3 py-2.5 text-sm font-medium ${txFeedback.status === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"}`}>
                            {txFeedback.status === "success" ? "Deposit successful" : "Deposit failed, please try again"}
                          </div>
                        )}

                        {isConnected && vault.isPaused && (
                          <p className="mb-3 text-sm font-medium text-amber-800">Vault is paused — deposits disabled.</p>
                        )}
                        {isConnected && !vault.isPaused && needsAssetApprove && (
                          <>
                            <p className="mb-3 text-xs text-gray-500 dark:text-zinc-400">
                              Step 1: Approve {vaultKind === "midas" ? "deposit vault" : "vault"} to spend{" "}
                              {assetSymForDisplay}
                            </p>
                            <button
                              type="button"
                              onClick={handleApproveAsset}
                              disabled={isBusy || !termsAccepted}
                              className={DARK_ACTION_BTN_CLASS}
                            >
                              {isBusy ? "Approving..." : `Approve ${assetSymForDisplay}`}
                            </button>
                          </>
                        )}
                        {isConnected && !vault.isPaused && !needsAssetApprove && (
                          <button
                            type="button"
                            onClick={
                              vaultKind === "midas"
                                ? handleMidasDeposit
                                : vaultKind === "morpho"
                                  ? handleMorphoDeposit
                                  : handleUYDeposit
                            }
                            disabled={
                              isBusy ||
                              !termsAccepted ||
                              (vaultKind === "midas"
                                ? midasDepositParsed18 <= BigInt(0)
                                : depositAmountParsed <= BigInt(0))
                            }
                            className={DARK_ACTION_BTN_CLASS}
                          >
                            {isBusy ? "Depositing..." : `Deposit ${assetSymForDisplay}`}
                          </button>
                        )}
                      </div>
                    )}

                    {actionTabIdx === 1 && (
                      <div>
                        {vaultKind === "midas" && supportedAssets.length > 1 && (
                          <div className="mb-4">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                              Receive as
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {supportedAssets.map((a) => (
                                <button
                                  key={a.address}
                                  type="button"
                                  disabled={!isConnected}
                                  onClick={() => setSelectedAssetAddr(a.address)}
                                  className={
                                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 " +
                                    (depositAsset?.address === a.address
                                      ? "border-black bg-black text-white dark:border-[#2a2a2e] dark:bg-zinc-100 dark:text-zinc-900"
                                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff] dark:hover:border-[#afafb2]")
                                  }
                                >
                                  {a.symbol}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mb-2 flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                            Input amount
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                            Balance:{" "}
                            {midasLiveShares !== undefined
                              ? `${parseFloat(formatUnits(midasLiveShares, 18)).toFixed(6)} ${vault.symbol}`
                              : vault.userSharesFormatted}
                          </span>
                        </div>

                        <div className="mb-4 flex rounded-xl border border-gray-200 bg-[#EEEEEE] px-3 py-1 pl-3 dark:border-[#1b1b1f] dark:bg-[#141417]">
                          <input
                            id="detail-redeem"
                            placeholder="0.00"
                            value={redeemAmount}
                            onChange={(e) => setRedeemAmount(e.target.value)}
                            type="number"
                            min={0}
                            disabled={!isConnected || isBusy}
                            className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-base font-semibold text-slate-700 placeholder:text-gray-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-0 disabled:opacity-50 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                          />
                          <div className="flex shrink-0 items-center gap-1.5 pr-0.5">
                            <span className="max-w-[4.5rem] truncate text-sm font-semibold text-gray-700 dark:text-zinc-200">
                              {vault.symbol || "Shares"}
                            </span>
                            <button
                              type="button"
                              disabled={!isConnected || isBusy}
                              onClick={handleMaxRedeem}
                              className="rounded-md bg-gray-200 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-800 transition hover:bg-gray-300 disabled:opacity-40 dark:border dark:border-[#1b1b1f] dark:bg-[#27272b] dark:text-[#ffffff] dark:hover:bg-[#afafb2]"
                            >
                              Max
                            </button>
                          </div>
                        </div>

                        <div className="mb-4 rounded-xl bg-white/70 px-1 dark:bg-[#141417]/70">
                          <TxSummaryRow
                            label="You will receive"
                            value={`${redeemAmount || "0.00"} ${assetSymForDisplay}`}
                          />
                        </div>

                        {isConnected && (
                          <label className="mb-4 flex cursor-pointer items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={termsAccepted}
                              onChange={(e) => setTermsAccepted(e.target.checked)}
                              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
                            />
                            <span className="text-xs leading-relaxed text-gray-500 dark:text-zinc-400">
                              I agree to the{" "}
                              <a href="#" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                                Privacy Policy
                              </a>
                              {" "}and{" "}
                              <a href="#" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                                Terms of Use
                              </a>
                            </span>
                          </label>
                        )}

                        {isConnected && txFeedback?.action === "withdraw" && (
                          <div className={`mb-3 rounded-lg px-3 py-2.5 text-sm font-medium ${txFeedback.status === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"}`}>
                            {txFeedback.status === "success" ? "Withdrawal request submitted successfully" : "Withdrawal failed, please try again"}
                          </div>
                        )}

                        {vaultKind === "midas" ? (
                          <>
                            <div className="mb-4 grid grid-cols-2 gap-2">
                              <div className="rounded-lg border border-gray-200 bg-white/90 p-3 dark:border-[#1b1b1f] dark:bg-[#141417]">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">Instant fee</p>
                                <p
                                  className={
                                    "mt-0.5 text-base font-bold " +
                                    (midasInstantFeePct !== undefined ? "text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-zinc-500")
                                  }
                                >
                                  {midasInstantFeePct !== undefined ? `${midasInstantFeePct.toFixed(2)}%` : "—"}
                                </p>
                              </div>
                              <div className="rounded-lg border border-gray-200 bg-white/90 p-3 dark:border-[#1b1b1f] dark:bg-[#141417]">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">Standard fee</p>
                                <p className="mt-0.5 text-base font-bold text-slate-600 dark:text-zinc-300">0%</p>
                              </div>
                            </div>
                            {isConnected && (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <button
                                  type="button"
                                  onClick={handleMidasRedeemInstant}
                                  disabled={isBusy || !termsAccepted || redeemAmountParsed <= BigInt(0)}
                                  className={DARK_ACTION_BTN_CLASS}
                                >
                                  {isBusy ? "Redeeming..." : (
                                    `Instant${midasInstantFeePct !== undefined ? ` (${midasInstantFeePct.toFixed(2)}%)` : ""}`
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleMidasRedeemRequest}
                                  disabled={isBusy || !termsAccepted || redeemAmountParsed <= BigInt(0)}
                                  className="w-full rounded-xl border border-gray-300 bg-white px-5 py-3.5 text-base font-semibold text-gray-900 transition hover:bg-gray-50 disabled:opacity-60 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff] dark:hover:bg-[#27272b]"
                                >
                                  {isBusy ? "Requesting..." : "Async (free)"}
                                </button>
                              </div>
                            )}
                            <p className="mt-3 text-[11px] leading-relaxed text-gray-500 dark:text-zinc-400">
                              Standard redemptions are processed in order. Once submitted, they cannot be cancelled.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="mb-4 text-xs leading-relaxed text-gray-500 dark:text-zinc-400">
                              {vaultKind === "morpho"
                                ? "Synchronous ERC-4626 redemption — assets returned immediately."
                                : `Async redemption — operator fulfills within 72h.${vault.withdrawalFeePercent ? ` Withdrawal fee: ${vault.withdrawalFeePercent.toFixed(2)}%.` : ""}`}
                            </p>
                            {isConnected && vaultKind === "morpho" && (
                              <button
                                type="button"
                                onClick={handleMorphoRedeem}
                                disabled={isBusy || !termsAccepted || redeemAmountParsed <= BigInt(0)}
                                className={DARK_ACTION_BTN_CLASS}
                              >
                                {isBusy ? "Redeeming..." : "Redeem shares"}
                              </button>
                            )}
                            {isConnected && vaultKind !== "morpho" && needsShareApprove && (
                              <>
                                <p className="mb-3 text-xs text-gray-500 dark:text-zinc-400">
                                  Step 1 of 2: Approve vault to escrow shares
                                </p>
                                <button
                                  type="button"
                                  onClick={handleApproveShares}
                                  disabled={isBusy || !termsAccepted}
                                  className={DARK_ACTION_BTN_CLASS}
                                >
                                  {isBusy ? "Approving..." : `Approve ${vault.symbol}`}
                                </button>
                              </>
                            )}
                            {isConnected && vaultKind !== "morpho" && !needsShareApprove && (
                              <button
                                type="button"
                                onClick={handleRequestRedeem}
                                disabled={isBusy || !termsAccepted || redeemAmountParsed <= BigInt(0)}
                                className={DARK_ACTION_BTN_CLASS}
                              >
                                {isBusy ? "Requesting..." : "Request redeem"}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {!isConnected && (
                      <>
                        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-4 py-4 text-center dark:border-[#1b1b1f] dark:bg-[#141417]/70">
                          <p className="text-sm leading-relaxed text-gray-500 dark:text-zinc-400">
                            Connect your institutional wallet to execute on-chain transactions.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openWalletConnect()}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-black py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-900 dark:border-[#1b1b1f] dark:bg-[#ffffff] dark:text-[#141417] dark:hover:bg-[#afafb2]"
                        >
                          Connect Wallet
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </aside>
          </div>
        </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-[#090B11]/65 backdrop-blur-sm" onClick={() => setConfirmOpen(false)} />
          <div className="relative z-10 mx-auto mt-40 w-[min(460px,92vw)] rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-[#1b1b1f] dark:bg-[#141417]">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Confirm Redemption</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{confirmMessage}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-[#1b1b1f] dark:text-[#afafb2] dark:hover:bg-[#27272b]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmAction?.();
                  setConfirmOpen(false);
                  setConfirmAction(null);
                }}
                className="rounded-lg border border-transparent bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:border-[#1b1b1f] dark:bg-[#ffffff] dark:text-[#141417] dark:hover:bg-[#afafb2]"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
