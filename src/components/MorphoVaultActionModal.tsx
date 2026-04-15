"use client";

/**
 * Action modal for Morpho MetaMorpho vaults.
 *
 * Morpho vaults are pure ERC-4626:
 *   Deposit: approve asset → deposit(assets, receiver)
 *   Withdraw: redeem(shares, receiver, owner)  (sync, no queue)
 *
 * No async redemption queue, no share approval step.
 */

import React, { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits, maxUint256, type Abi } from "viem";
import { ERC20_ABI } from "@/lib/vaultAbi";
import type { Vault } from "@/types/vault";
import { useQueryClient } from "@tanstack/react-query";
import { getTxExplorerLink } from "@/lib/chains";

// Minimal ERC-4626 write ABI for Morpho vaults
const MORPHO_WRITE_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets",   type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "redeem",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shares",   type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner",    type: "address" },
    ],
    outputs: [{ name: "assets", type: "uint256" }],
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
  "w-full max-w-none !justify-center !rounded-xl !border !border-transparent !bg-zinc-900 !px-5 !py-3.5 !text-base !font-semibold !text-white hover:!bg-zinc-800 disabled:!bg-zinc-400/70 disabled:!text-zinc-200 dark:!border-zinc-300 dark:!bg-zinc-100 dark:!text-zinc-900 dark:hover:!bg-zinc-200 dark:disabled:!border-zinc-500 dark:disabled:!bg-zinc-400 dark:disabled:!text-zinc-700 [&_.cds--btn__text]:!w-full [&_.cds--btn__text]:!text-center [&_.cds--btn__text]:!text-white dark:[&_.cds--btn__text]:!text-zinc-900";
const DEPOSIT_BTN_CLASS =
  "w-full max-w-none !justify-center !rounded-xl !border !border-transparent !bg-zinc-900 !px-5 !py-3.5 !text-base !font-semibold !text-white hover:!bg-zinc-800 disabled:!bg-zinc-400/70 disabled:!text-zinc-200 dark:!border-zinc-300 dark:!bg-zinc-100 dark:!text-zinc-900 dark:hover:!bg-zinc-200 dark:disabled:!border-zinc-500 dark:disabled:!bg-zinc-400 dark:disabled:!text-zinc-700 [&_.cds--btn__text]:!w-full [&_.cds--btn__text]:!text-center [&_.cds--btn__text]:!text-white dark:[&_.cds--btn__text]:!text-zinc-900";

export function MorphoVaultActionModal({ vault, open, onClose, onTxCompleted }: Props) {
  const { address: userAddress, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [depositAmount, setDepositAmount] = useState("");
  const [redeemShares, setRedeemShares] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [actionTab, setActionTab] = useState<"deposit" | "withdraw">("deposit");

  const { writeContract, data: txHash, isPending, error: writeError, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const vaultAddr  = vault?.address;
  const assetAddr  = vault?.assetAddress;
  const assetDec   = vault?.assetDecimals ?? 18;
  const assetSym   = vault?.assetSymbol ?? "—";
  const shareDec   = 18;
  const shareSym   = vault?.symbol ?? "—";

  const enabled = !!vaultAddr && !!assetAddr && !!userAddress && open;

  const { data: reads, refetch } = useReadContracts({
    contracts: [
      // [0] asset wallet balance
      { address: assetAddr!, abi: ERC20_ABI as Abi, functionName: "balanceOf",  args: [userAddress!] },
      // [1] asset allowance to vault
      { address: assetAddr!, abi: ERC20_ABI as Abi, functionName: "allowance",  args: [userAddress!, vaultAddr!] },
      // [2] share balance
      { address: vaultAddr!, abi: ERC20_ABI as Abi, functionName: "balanceOf",  args: [userAddress!] },
    ],
    query: { enabled },
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

  const assetBalance   = reads?.[0]?.status === "success" ? (reads[0].result as bigint) : undefined;
  const assetAllowance = reads?.[1]?.status === "success" ? (reads[1].result as bigint) : undefined;
  const shareBalance   = reads?.[2]?.status === "success" ? (reads[2].result as bigint) : undefined;

  const depositParsed = useMemo(() => {
    try { return depositAmount ? parseUnits(depositAmount, assetDec) : BigInt(0); }
    catch { return BigInt(0); }
  }, [depositAmount, assetDec]);

  const redeemParsed = useMemo(() => {
    try { return redeemShares ? parseUnits(redeemShares, shareDec) : BigInt(0); }
    catch { return BigInt(0); }
  }, [redeemShares]);

  const needsApprove = assetAllowance !== undefined && depositParsed > BigInt(0) && assetAllowance < depositParsed;
  const isBusy = isPending || isConfirming;

  function handleApprove() {
    if (!assetAddr || !vaultAddr) return;
    writeContract({ address: assetAddr, abi: ERC20_ABI, functionName: "approve", args: [vaultAddr, maxUint256] });
  }

  function handleDeposit() {
    if (!vaultAddr || !userAddress || depositParsed <= BigInt(0)) return;
    writeContract({
      address: vaultAddr,
      abi: MORPHO_WRITE_ABI,
      functionName: "deposit",
      args: [depositParsed, userAddress],
    });
  }

  function handleRedeem() {
    if (!vaultAddr || !userAddress || redeemParsed <= BigInt(0)) return;
    setConfirmMessage(`Confirm redeem ${redeemShares || "0"} ${shareSym} shares?`);
    setConfirmAction(() => () => {
      writeContract({
        address: vaultAddr,
        abi: MORPHO_WRITE_ABI,
        functionName: "redeem",
        args: [redeemParsed, userAddress, userAddress],
      });
    });
    setConfirmOpen(true);
  }

  function handleClose() {
    setDepositAmount("");
    setRedeemShares("");
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
          <div className="absolute inset-0 bg-[#090B11]/60 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative z-10 mx-auto mt-10 w-[min(860px,94vw)]">
            <div className="max-h-[88vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-[#1A1F2B] dark:bg-[#121722]">
              <div className="mb-5 flex items-start justify-between gap-4">
                <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-2xl">{`${vault.name} — ${vault.platformLabel}`}</h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-base leading-none text-zinc-500 hover:bg-zinc-100 dark:border-[#232938] dark:text-zinc-300 dark:hover:bg-[#161B26]"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

        <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {[
            { label: "TVL", value: vault.tvlFormatted ?? "—", color: "text-zinc-900 dark:text-zinc-100" },
            { label: "Status", value: vault.status === "paused" ? "Paused" : "Active", color: vault.status === "paused" ? "text-amber-600" : "text-emerald-600" },
            { label: "Asset", value: assetSym, color: "text-zinc-900 dark:text-zinc-100" },
          ].map((item) => (
            <div key={item.label} className="min-h-[92px] rounded-2xl border border-[#E1E5E1] bg-[#F1F2F0] px-5 py-4 dark:border-[#1A1F2B] dark:bg-[#121722]">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">{item.label}</p>
              <p className={`text-[1.25rem] font-bold leading-tight ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-[#E1E5E1] bg-[#F1F2F0] px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-[#1A1F2B] dark:bg-[#121722] dark:text-zinc-300">ERC-4626 (Morpho)</span>
          <span className="rounded-full border border-[#E1E5E1] bg-[#F1F2F0] px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-[#1A1F2B] dark:bg-[#121722] dark:text-zinc-300">Sync Redemption</span>
        </div>

        {isConfirmed && (
          <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/30">
            <p className="text-sm font-semibold text-emerald-700">Transaction confirmed</p>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-300/90">{txSubtitle}</p>
            {txHash && (
              <a
                href={getTxExplorerLink(txHash, vault.chainId ?? 1)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs font-medium text-emerald-800 underline dark:text-emerald-300"
              >
                View transaction
              </a>
            )}
          </div>
        )}
        {writeError && (
          <div className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-900/30">
            <p className="text-sm font-semibold text-red-700">Transaction failed</p>
            <p className="text-xs text-red-700/80 dark:text-red-300/90">{writeError.message.slice(0, 120)}</p>
          </div>
        )}
        {isBusy && <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{loadingText}</p>}

        {!isConnected ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Connect your wallet to deposit or withdraw
          </p>
        ) : !vault.assetAddress ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Asset address unavailable — vault data still loading
          </p>
        ) : (
          <>
            <div className="mb-4 inline-flex gap-1 rounded-xl bg-[#F1F2F0] p-1 dark:bg-[#121722]">
              <button
                type="button"
                onClick={() => setActionTab("deposit")}
                className={
                  "rounded-lg px-4 py-2 text-sm transition " +
                  (actionTab === "deposit"
                    ? "bg-white font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-[#161B26] dark:text-zinc-100 dark:ring-[#232938]"
                    : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-700 dark:text-zinc-300 dark:hover:bg-[#161B26] dark:hover:text-zinc-100")
                }
              >
                Deposit
              </button>
              <button
                type="button"
                onClick={() => setActionTab("withdraw")}
                className={
                  "rounded-lg px-4 py-2 text-sm transition " +
                  (actionTab === "withdraw"
                    ? "bg-white font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-[#161B26] dark:text-zinc-100 dark:ring-[#232938]"
                    : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-700 dark:text-zinc-300 dark:hover:bg-[#161B26] dark:hover:text-zinc-100")
                }
              >
                Withdraw
              </button>
            </div>

              {/* ── Deposit ─────────────────────────────────────────── */}
              {actionTab === "deposit" && (
                <div className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 dark:border-[#1A1F2B] dark:bg-[#121722]">
                  <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                    Wallet balance:{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {assetBalance !== undefined ? fmt(assetBalance, assetDec, assetSym) : "—"}
                    </span>
                  </p>
                  <label htmlFor="morpho-deposit-amount" className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    {`Amount (${assetSym})`}
                  </label>
                  <div className="mb-4 flex items-center rounded-xl border border-zinc-300 bg-white/95 px-3 py-1.5 shadow-sm dark:border-[#1A1F2B] dark:bg-[#121722]">
                    <input
                      id="morpho-deposit-amount"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      type="number"
                      min="0"
                      disabled={isBusy || vault.status === "paused"}
                      className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2.5 text-base font-medium text-zinc-900 placeholder:text-zinc-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-0 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                    />
                    <span className="shrink-0 rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:border-[#232938] dark:bg-[#161B26] dark:text-zinc-300">
                      {assetSym}
                    </span>
                  </div>

                  {vault.status === "paused" ? (
                    <p className="text-sm text-amber-400">Deposits are disabled while vault is paused.</p>
                  ) : needsApprove ? (
                    <div>
                      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                        Step 1: Approve the vault to spend your {assetSym}
                      </p>
                      <button type="button" onClick={handleApprove} disabled={isBusy} className={ACTION_BTN_CLASS}>
                        {isBusy ? "Approving..." : `Approve ${assetSym}`}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={handleDeposit} disabled={isBusy || depositParsed <= BigInt(0)} className={DEPOSIT_BTN_CLASS}>
                      {isBusy ? "Depositing..." : `Deposit ${assetSym}`}
                    </button>
                  )}
                </div>
              )}

              {/* ── Withdraw (sync ERC-4626 redeem) ─────────────────── */}
              {actionTab === "withdraw" && (
                <div className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 dark:border-[#1A1F2B] dark:bg-[#121722]">
                  <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                    Share balance:{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {shareBalance !== undefined ? fmt(shareBalance, shareDec, shareSym) : "—"}
                    </span>
                  </p>
                  <label htmlFor="morpho-redeem-shares" className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    {`Shares to redeem (${shareSym})`}
                  </label>
                  <div className="mb-2 flex items-center rounded-xl border border-zinc-300 bg-white/95 px-3 py-1.5 shadow-sm dark:border-[#1A1F2B] dark:bg-[#121722]">
                    <input
                      id="morpho-redeem-shares"
                      placeholder="0.00"
                      value={redeemShares}
                      onChange={(e) => setRedeemShares(e.target.value)}
                      type="number"
                      min="0"
                      disabled={isBusy}
                      className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2.5 text-base font-medium text-zinc-900 placeholder:text-zinc-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-0 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                    />
                    <span className="shrink-0 rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:border-[#232938] dark:bg-[#161B26] dark:text-zinc-300">
                      {shareSym}
                    </span>
                  </div>
                  <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
                    Synchronous ERC-4626 redemption — assets returned immediately.
                  </p>
                  <button type="button" onClick={handleRedeem} disabled={isBusy || redeemParsed <= BigInt(0)} className={ACTION_BTN_CLASS}>
                    {isBusy ? "Redeeming..." : "Redeem Shares"}
                  </button>
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
          <div className="absolute inset-0 bg-[#090B11]/65 backdrop-blur-sm" onClick={() => setConfirmOpen(false)} />
          <div className="relative z-10 mx-auto mt-40 w-[min(460px,92vw)] rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-[#1A1F2B] dark:bg-[#121722]">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Confirm Redemption</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{confirmMessage}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-[#232938] dark:text-zinc-300 dark:hover:bg-[#161B26]"
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
                className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white dark:bg-[#161B26] dark:text-zinc-100 dark:hover:bg-[#1D2330]"
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
