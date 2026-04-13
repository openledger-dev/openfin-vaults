"use client";

/**
 * Action modal for Midas token vaults.
 *
 * Midas tokens are NOT ERC-4626. Each token has:
 *   • A Deposit Vault: depositInstant(tokenIn, amountToken, minReceiveAmount, referrerId)
 *   • A Redemption Vault: redeemInstant(tokenOut, amountMtokenIn, minReceiveAmount)
 *                      or redeemRequest(tokenOut, amountMtokenIn)  [async, no cancel]
 *
 * IMPORTANT: amountToken in depositInstant always uses 18 decimals regardless
 * of the payment token's own decimals. We handle this conversion here.
 *
 * Midas tokens have no on-chain pause flag — deposits/redeems can be paused
 * per-function by the Midas team. We show a generic warning if the deposit
 * or redemption vault address is missing.
 */

import React, { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits, maxUint256, type Abi } from "viem";
import { ERC20_ABI } from "@/lib/vaultAbi";
import { MIDAS_DEPOSIT_REFERRAL_ID } from "@/lib/referral";
import type { Vault } from "@/types/vault";
import { useSupportedAssets } from "@/hooks/useSupportedAssets";
import { useQueryClient } from "@tanstack/react-query";
import { getTxExplorerLink } from "@/lib/chains";

// Midas Deposit Vault ABI fragments
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

// Midas Redemption Vault ABI fragments
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
] as const;

// Read-only ABI for redemption vault fee
const MIDAS_REDEEM_READ_ABI = [
  {
    name: "instantFee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }], // 1e18 = 100%
  },
] as const;

interface Props {
  vault: Vault | null;
  open: boolean;
  onClose: () => void;
  onTxCompleted?: () => void;
}

function fmt(raw: bigint, dec: number, sym: string): string {
  const n = parseFloat(formatUnits(raw, dec));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(4)}M ${sym}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(4)}K ${sym}`;
  return `${n.toFixed(4)} ${sym}`;
}

const ACTION_BTN_CLASS =
  "w-full max-w-none !justify-center !rounded-xl !border-0 !bg-[#1C1C1F] !px-5 !py-3.5 !text-base !font-semibold !text-white hover:!bg-[#141417] disabled:!bg-zinc-700/70 disabled:!text-zinc-300 [&_.cds--btn__text]:!w-full [&_.cds--btn__text]:!text-center [&_.cds--btn__text]:!text-white";

export function MidasVaultActionModal({ vault, open, onClose, onTxCompleted }: Props) {
  const { address: userAddress, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [depositAmount, setDepositAmount]     = useState("");
  const [redeemAmount, setRedeemAmount]       = useState("");
  const [selectedPaymentToken, setSelectedPaymentToken] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [actionTab, setActionTab] = useState<"deposit" | "redeem">("deposit");

  const { writeContract, data: txHash, isPending, error: writeError, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const { assets: paymentAssets } = useSupportedAssets(vault?.address);

  // Default to first payment token when assets load
  const activePaymentToken = useMemo(
    () => selectedPaymentToken || paymentAssets[0]?.address || "",
    [selectedPaymentToken, paymentAssets]
  );
  const activeAsset = paymentAssets.find((a) => a.address === activePaymentToken) ?? paymentAssets[0];

  const shareAddr  = vault?.address;
  const depositVault  = vault?.depositVaultAddress;
  const redeemVault   = vault?.redemptionVaultAddress;
  const chainId = vault?.chainId ?? 1;
  const shareDec   = 18; // Midas share tokens are always 18 decimals
  const shareSym   = vault?.symbol ?? "—";
  const paymentDec = activeAsset?.decimals ?? 6;
  const paymentSym = activeAsset?.symbol ?? "—";

  const enabled = !!shareAddr && !!userAddress && open;

  // ── instantFee from redemption vault (1e18 = 100%) ───────────────────────
  const { data: feeData } = useReadContracts({
    contracts: redeemVault
      ? [{ address: redeemVault, abi: MIDAS_REDEEM_READ_ABI, functionName: "instantFee" as const, chainId }]
      : [],
    query: { enabled: !!redeemVault },
  });
  const instantFeeRaw = feeData?.[0]?.status === "success" ? (feeData[0].result as bigint) : undefined;
  const instantFeePct = instantFeeRaw !== undefined ? Number(instantFeeRaw) / 1e16 : undefined;

  const { data: reads, refetch } = useReadContracts({
    contracts: [
      // [0] payment token wallet balance
      { address: (activePaymentToken || shareAddr) as `0x${string}`, abi: ERC20_ABI as Abi, functionName: "balanceOf",  args: [userAddress!], chainId },
      // [1] payment token allowance to deposit vault
      { address: (activePaymentToken || shareAddr) as `0x${string}`, abi: ERC20_ABI as Abi, functionName: "allowance",  args: [userAddress!, (depositVault || shareAddr) as `0x${string}`], chainId },
      // [2] share balance (for redeem)
      { address: shareAddr!, abi: ERC20_ABI as Abi, functionName: "balanceOf", args: [userAddress!], chainId },
    ],
    query: { enabled: enabled && !!activePaymentToken },
  });

  useEffect(() => {
    if (!isConfirmed) return;
    void refetch();
    void queryClient.invalidateQueries();
    onTxCompleted?.();
  }, [isConfirmed, refetch, queryClient, onTxCompleted]);

  useEffect(() => {
    if (open) setActionTab("deposit");
  }, [open]);

  const paymentBalance   = reads?.[0]?.status === "success" ? (reads[0].result as bigint) : undefined;
  const paymentAllowance = reads?.[1]?.status === "success" ? (reads[1].result as bigint) : undefined;
  const shareBalance     = reads?.[2]?.status === "success" ? (reads[2].result as bigint) : undefined;

  // Deposit: user enters in payment token units (e.g. 100 USDC with 6 decimals),
  // but depositInstant requires the amount in 18 decimals.
  const depositParsedPayment = useMemo(() => {
    try { return depositAmount ? parseUnits(depositAmount, paymentDec) : BigInt(0); }
    catch { return BigInt(0); }
  }, [depositAmount, paymentDec]);

  // Scale deposit amount up to 18 decimals (Midas requirement)
  const depositParsed18 = useMemo(() => {
    if (depositParsedPayment <= BigInt(0)) return BigInt(0);
    const scaleFactor = BigInt(10 ** (18 - paymentDec));
    return depositParsedPayment * scaleFactor;
  }, [depositParsedPayment, paymentDec]);

  const redeemParsed = useMemo(() => {
    try { return redeemAmount ? parseUnits(redeemAmount, shareDec) : BigInt(0); }
    catch { return BigInt(0); }
  }, [redeemAmount]);

  const needsApprove =
    paymentAllowance !== undefined &&
    depositParsedPayment > BigInt(0) &&
    paymentAllowance < depositParsedPayment;

  const isBusy = isPending || isConfirming;

  function handleApprove() {
    if (!activePaymentToken || !depositVault) return;
    writeContract({
      address: activePaymentToken as `0x${string}`,
      chainId,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [depositVault, maxUint256],
    });
  }

  function handleDeposit() {
    if (!depositVault || !activePaymentToken || !userAddress || depositParsed18 <= BigInt(0)) return;
    writeContract({
      address: depositVault,
      chainId,
      abi: MIDAS_DEPOSIT_ABI,
      functionName: "depositInstant",
      args: [
        activePaymentToken as `0x${string}`,
        depositParsed18,
        BigInt(0), // minReceiveAmount — no sandwich risk on Midas
        MIDAS_DEPOSIT_REFERRAL_ID,
        userAddress,
      ],
    });
  }

  function handleRedeemInstant() {
    if (!redeemVault || !activePaymentToken || redeemParsed <= BigInt(0)) return;
    setConfirmMessage(`Confirm instant redeem ${redeemAmount || "0"} ${shareSym} shares?`);
    setConfirmAction(() => () => {
      writeContract({
        address: redeemVault,
        chainId,
        abi: MIDAS_REDEEM_ABI,
        functionName: "redeemInstant",
        args: [
          activePaymentToken as `0x${string}`,
          redeemParsed,
          BigInt(0),
        ],
      });
    });
    setConfirmOpen(true);
  }

  function handleRedeemRequest() {
    if (!redeemVault || !activePaymentToken || redeemParsed <= BigInt(0)) return;
    setConfirmMessage(`Confirm async redeem request for ${redeemAmount || "0"} ${shareSym} shares?`);
    setConfirmAction(() => () => {
      writeContract({
        address: redeemVault,
        chainId,
        abi: MIDAS_REDEEM_ABI,
        functionName: "redeemRequest",
        args: [activePaymentToken as `0x${string}`, redeemParsed],
      });
    });
    setConfirmOpen(true);
  }

  function handleClose() {
    setDepositAmount("");
    setRedeemAmount("");
    resetWrite();
    refetch();
    onClose();
  }

  if (!vault) return null;
  const txSubtitle = txHash ? `Hash: ${txHash.slice(0, 10)}…` : "Transaction confirmed";
  const loadingText = isPending ? "Submitting transaction..." : "Confirming transaction...";

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/35" onClick={handleClose} />
          <div className="relative z-10 mx-auto mt-10 w-[min(860px,94vw)]">
            <div className="max-h-[88vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
              <div className="mb-5 flex items-start justify-between gap-4">
                <h2 className="text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl">{`${vault.name} — ${vault.platformLabel}`}</h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-base leading-none text-zinc-500 hover:bg-zinc-100"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

        <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {[
            { label: "TVL", value: vault.tvlFormatted ?? "—", color: "text-zinc-900" },
            { label: "Status", value: "Active", color: "text-emerald-600" },
            { label: "Token", value: shareSym, color: "text-zinc-900" },
          ].map((item) => (
            <div key={item.label} className="min-h-[92px] rounded-2xl border border-[#E1E5E1] bg-[#F1F2F0] px-5 py-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{item.label}</p>
              <p className={`text-[1.25rem] font-bold leading-tight ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-[#E1E5E1] bg-[#F1F2F0] px-2 py-0.5 text-[11px] font-semibold text-zinc-700">Midas RWA</span>
          <span className="rounded-full border border-[#E1E5E1] bg-[#F1F2F0] px-2 py-0.5 text-[11px] font-semibold text-zinc-700">Instant + Async Redemption</span>
        </div>

        {isConfirmed && (
          <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2">
            <p className="text-sm font-semibold text-emerald-700">Transaction confirmed</p>
            <p className="text-xs text-emerald-700/80">{txSubtitle}</p>
            {txHash && (
              <a
                href={getTxExplorerLink(txHash, chainId)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs font-medium text-emerald-800 underline"
              >
                View transaction
              </a>
            )}
          </div>
        )}
        {writeError && (
          <div className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2">
            <p className="text-sm font-semibold text-red-700">Transaction failed</p>
            <p className="text-xs text-red-700/80">{writeError.message.slice(0, 120)}</p>
          </div>
        )}
        {isBusy && <p className="mb-3 text-xs text-zinc-500">{loadingText}</p>}

        {!isConnected ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Connect your wallet to deposit or redeem
          </p>
        ) : !depositVault ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-sm font-semibold text-amber-700">Vault addresses not configured</p>
            <p className="text-xs text-amber-700/80">Add depositVaultAddress and redemptionVaultAddress in MIDAS_VAULT_CONFIG to enable actions.</p>
          </div>
        ) : (
          <>
            {/* Payment token selector (shown for both deposit and redeem) */}
            {paymentAssets.length > 1 && (
              <div className="mb-4">
                <label htmlFor="midas-payment-token" className="mb-2 block text-sm font-medium text-zinc-600">
                  Payment token
                </label>
                <select
                id="midas-payment-token"
                value={activePaymentToken}
                onChange={(e) => setSelectedPaymentToken(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 focus:border-zinc-500 focus:outline-none"
              >
                {paymentAssets.map((a) => (
                  <option key={a.address} value={a.address}>
                    {a.symbol}
                  </option>
                ))}
                </select>
              </div>
            )}

            <div className="mb-4 inline-flex gap-1 rounded-xl bg-[#F1F2F0] p-1">
              <button
                type="button"
                onClick={() => setActionTab("deposit")}
                className={
                  "rounded-lg px-4 py-2 text-sm transition " +
                  (actionTab === "deposit"
                    ? "bg-white font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                    : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-700")
                }
              >
                Deposit
              </button>
              <button
                type="button"
                onClick={() => setActionTab("redeem")}
                className={
                  "rounded-lg px-4 py-2 text-sm transition " +
                  (actionTab === "redeem"
                    ? "bg-white font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                    : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-700")
                }
              >
                Redeem
              </button>
            </div>

                {/* ── Deposit ──────────────────────────────────────── */}
                {actionTab === "deposit" && (
                  <div className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-4">
                    <p className="mb-4 text-sm text-zinc-500">
                      Wallet balance:{" "}
                      <span className="font-semibold text-zinc-900">
                        {paymentBalance !== undefined ? fmt(paymentBalance, paymentDec, paymentSym) : "—"}
                      </span>
                    </p>
                    <label htmlFor="midas-deposit-amount" className="mb-2 block text-sm font-medium text-zinc-600">
                      {`Amount (${paymentSym})`}
                    </label>
                    <input
                      id="midas-deposit-amount"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      type="number"
                      min="0"
                      disabled={isBusy}
                      className="mb-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:border-zinc-500 focus:outline-none"
                    />
                    <p className="mb-4 text-xs text-zinc-500">
                      Instant mint — {shareSym} delivered to your wallet immediately.
                    </p>

                    {needsApprove ? (
                      <div>
                        <p className="mb-3 text-xs text-zinc-500">
                          Step 1: Approve the deposit vault to spend your {paymentSym}
                        </p>
                        <button type="button" onClick={handleApprove} disabled={isBusy} className={ACTION_BTN_CLASS}>
                          {isBusy ? "Approving..." : `Approve ${paymentSym}`}
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={handleDeposit} disabled={isBusy || depositParsed18 <= BigInt(0)} className={ACTION_BTN_CLASS}>
                        {isBusy ? "Depositing..." : `Deposit ${paymentSym}`}
                      </button>
                    )}
                  </div>
                )}

                {/* ── Redeem ───────────────────────────────────────── */}
                {actionTab === "redeem" && (
                  <div className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-4">
                    <p className="mb-4 text-sm text-zinc-500">
                      {shareSym} balance:{" "}
                      <span className="font-semibold text-zinc-900">
                        {shareBalance !== undefined ? fmt(shareBalance, shareDec, shareSym) : "—"}
                      </span>
                    </p>
                    <label htmlFor="midas-redeem-amount" className="mb-2 block text-sm font-medium text-zinc-600">
                      {`${shareSym} to redeem`}
                    </label>
                    <input
                      id="midas-redeem-amount"
                      placeholder="0.00"
                      value={redeemAmount}
                      onChange={(e) => setRedeemAmount(e.target.value)}
                      type="number"
                      min="0"
                      disabled={isBusy}
                      className="mb-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:border-zinc-500 focus:outline-none"
                    />
                    {/* Fee + mode comparison */}
                    <div className="mb-4 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-[#E1E5E1] bg-[#F1F2F0] p-3">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          Instant Fee
                        </p>
                        <p className={"text-sm font-bold " + (instantFeePct !== undefined ? "text-amber-600" : "text-zinc-400")}>
                          {instantFeePct !== undefined ? `${instantFeePct.toFixed(2)}%` : "—"}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-500">Atomic, funds returned immediately</p>
                      </div>
                      <div className="rounded-lg border border-[#E1E5E1] bg-[#F1F2F0] p-3">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          Standard Fee
                        </p>
                        <p className="text-sm font-bold text-emerald-600">0%</p>
                        <p className="mt-1 text-[10px] text-zinc-500">Async, processed in order — no cancel</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button type="button" onClick={handleRedeemInstant} disabled={isBusy || redeemParsed <= BigInt(0)} className={ACTION_BTN_CLASS}>
                        {isBusy ? "Redeeming..." : `Instant${instantFeePct !== undefined ? ` (${instantFeePct.toFixed(2)}% fee)` : ""}`}
                      </button>
                      <button type="button" onClick={handleRedeemRequest} disabled={isBusy || redeemParsed <= BigInt(0)} className={ACTION_BTN_CLASS}>
                        {isBusy ? "Requesting..." : "Async (free)"}
                      </button>
                    </div>
                  </div>
                )}
          </>
        )}
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmOpen(false)} />
          <div className="relative z-10 mx-auto mt-40 w-[min(460px,92vw)] rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-900">Confirm Redemption</h3>
            <p className="mt-2 text-sm text-zinc-600">{confirmMessage}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
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
                className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
