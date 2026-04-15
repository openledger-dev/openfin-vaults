"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits, maxUint256, type Abi } from "viem";
import { VAULT_READ_ABI, VAULT_WRITE_ABI, ERC20_ABI } from "@/lib/vaultAbi";
import { DEPOSIT_REFERRAL_ID } from "@/lib/referral";
import type { Vault } from "@/types/vault";
import { useQueryClient } from "@tanstack/react-query";
import { getTxExplorerLink } from "@/lib/chains";

interface VaultActionModalProps {
  vault: Vault | null;
  open: boolean;
  onClose: () => void;
  onTxCompleted?: () => void;
}

function formatAsset(raw: bigint, decimals: number, symbol: string): string {
  const n = parseFloat(formatUnits(raw, decimals));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(4)}M ${symbol}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(4)}K ${symbol}`;
  return `${n.toFixed(4)} ${symbol}`;
}

const ACTION_BTN_CLASS =
  "w-full max-w-none !justify-center !rounded-xl !border !border-transparent !bg-zinc-900 !px-5 !py-3.5 !text-base !font-semibold !text-white hover:!bg-zinc-800 disabled:!bg-zinc-400/70 disabled:!text-zinc-200 dark:!border-zinc-300 dark:!bg-zinc-100 dark:!text-zinc-900 dark:hover:!bg-zinc-200 dark:disabled:!border-zinc-500 dark:disabled:!bg-zinc-400 dark:disabled:!text-zinc-700 [&_.cds--btn__text]:!w-full [&_.cds--btn__text]:!text-center [&_.cds--btn__text]:!text-white dark:[&_.cds--btn__text]:!text-zinc-900";
const DEPOSIT_BTN_CLASS =
  "w-full max-w-none !justify-center !rounded-xl !border !border-transparent !bg-zinc-900 !px-5 !py-3.5 !text-base !font-semibold !text-white hover:!bg-zinc-800 disabled:!bg-zinc-400/70 disabled:!text-zinc-200 dark:!border-zinc-300 dark:!bg-zinc-100 dark:!text-zinc-900 dark:hover:!bg-zinc-200 dark:disabled:!border-zinc-500 dark:disabled:!bg-zinc-400 dark:disabled:!text-zinc-700 [&_.cds--btn__text]:!w-full [&_.cds--btn__text]:!text-center [&_.cds--btn__text]:!text-white dark:[&_.cds--btn__text]:!text-zinc-900";

export function VaultActionModal({ vault, open, onClose, onTxCompleted }: VaultActionModalProps) {
  const { address: userAddress, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [depositAmount, setDepositAmount] = useState("");
  const [requestRedeemShares, setRequestRedeemShares] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [actionTab, setActionTab] = useState<"deposit" | "withdraw">("deposit");

  const { writeContract, data: txHash, isPending: isWritePending, error: writeError, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const vaultAddr = vault?.address;
  const assetAddr = vault?.assetAddress;
  const decimals = vault?.assetDecimals ?? 18;
  const assetSymbol = vault?.assetSymbol ?? "—";

  // ── On-chain reads for this vault + user ─────────────────────────────────
  const enabled = !!vaultAddr && !!assetAddr && !!userAddress && open;

  const { data: reads, refetch } = useReadContracts({
    contracts: [
      // [0] asset wallet balance
      { address: assetAddr!, abi: ERC20_ABI as Abi, functionName: "balanceOf", args: [userAddress!] },
      // [1] asset allowance granted to vault
      { address: assetAddr!, abi: ERC20_ABI as Abi, functionName: "allowance", args: [userAddress!, vaultAddr!] },
      // [2] vault share balance (for request-redeem input)
      { address: vaultAddr!, abi: ERC20_ABI as Abi, functionName: "balanceOf", args: [userAddress!] },
      // [3] share allowance granted to vault (required before requestRedeemOfAsset)
      { address: vaultAddr!, abi: ERC20_ABI as Abi, functionName: "allowance", args: [userAddress!, vaultAddr!] },
      // [4] pending redeem for this asset
      { address: vaultAddr!, abi: VAULT_READ_ABI as Abi, functionName: "getPendingRedeemForAsset", args: [assetAddr!, userAddress!] },
      // [5] claimable redeem for this asset
      { address: vaultAddr!, abi: VAULT_READ_ABI as Abi, functionName: "getClaimableRedeemForAsset", args: [assetAddr!, userAddress!] },
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

  const assetBalance   = reads?.[0]?.status === "success" ? reads[0].result as bigint : undefined;
  const assetAllowance = reads?.[1]?.status === "success" ? reads[1].result as bigint : undefined;
  const shareBalance   = reads?.[2]?.status === "success" ? reads[2].result as bigint : undefined;
  const shareAllowance = reads?.[3]?.status === "success" ? reads[3].result as bigint : undefined;
  const pendingRedeem  = reads?.[4]?.status === "success"
    ? reads[4].result as { shares: bigint; requestTime: bigint }
    : undefined;
  const claimableRedeem = reads?.[5]?.status === "success"
    ? reads[5].result as { assets: bigint; shares: bigint }
    : undefined;

  // ── Parsed deposit amount ─────────────────────────────────────────────────
  const depositAmountParsed = useMemo(() => {
    try { return depositAmount ? parseUnits(depositAmount, decimals) : BigInt(0); }
    catch { return BigInt(0); }
  }, [depositAmount, decimals]);

  const requestSharesParsed = useMemo(() => {
    try { return requestRedeemShares ? parseUnits(requestRedeemShares, 18) : BigInt(0); }
    catch { return BigInt(0); }
  }, [requestRedeemShares]);

  const needsApprove = assetAllowance !== undefined && depositAmountParsed > BigInt(0) && assetAllowance < depositAmountParsed;
  const needsShareApprove = shareAllowance !== undefined && requestSharesParsed > BigInt(0) && shareAllowance < requestSharesParsed;

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleApproveAsset() {
    if (!assetAddr || !vaultAddr) return;
    writeContract({ address: assetAddr, abi: ERC20_ABI, functionName: "approve", args: [vaultAddr, maxUint256] });
  }

  function handleDeposit() {
    if (!vaultAddr || !assetAddr || !userAddress || depositAmountParsed <= BigInt(0)) return;
    writeContract({
      address: vaultAddr,
      abi: VAULT_WRITE_ABI,
      functionName: "depositAssetWithReferral",
      args: [assetAddr, depositAmountParsed, userAddress, DEPOSIT_REFERRAL_ID],
    });
  }

  function handleApproveShares() {
    if (!vaultAddr) return;
    // Vault spends its own shares from owner (_spendAllowance in requestRedeemOfAsset)
    writeContract({ address: vaultAddr, abi: ERC20_ABI, functionName: "approve", args: [vaultAddr, maxUint256] });
  }

  function handleRequestRedeem() {
    if (!vaultAddr || !assetAddr || !userAddress || requestSharesParsed <= BigInt(0)) return;
    setConfirmMessage(`Confirm request redeem ${requestRedeemShares || "0"} ${vault.symbol} shares?`);
    setConfirmAction(() => () => {
      writeContract({
        address: vaultAddr,
        abi: VAULT_WRITE_ABI,
        functionName: "requestRedeemOfAsset",
        args: [assetAddr, requestSharesParsed, userAddress, userAddress],
      });
    });
    setConfirmOpen(true);
  }

  function handleCancelRedeem() {
    if (!vaultAddr || !assetAddr || !userAddress) return;
    writeContract({
      address: vaultAddr,
      abi: VAULT_WRITE_ABI,
      functionName: "cancelRedeemRequestOfAsset",
      args: [assetAddr, userAddress, userAddress],
    });
  }

  function handleClaim() {
    if (!vaultAddr || !assetAddr || !userAddress || !claimableRedeem || claimableRedeem.shares === BigInt(0)) return;
    writeContract({
      address: vaultAddr,
      abi: VAULT_WRITE_ABI,
      functionName: "redeemAsset",
      args: [assetAddr, claimableRedeem.shares, userAddress, userAddress],
    });
  }

  function handleClose() {
    setDepositAmount("");
    setRequestRedeemShares("");
    resetWrite();
    refetch();
    onClose();
  }

  if (!vault) return null;

  const isBusy = isWritePending || isConfirming;
  const txSubtitle = txHash ? `Hash: ${txHash.slice(0, 10)}…` : "Transaction confirmed";
  const loadingText = isWritePending ? "Submitting transaction..." : "Confirming transaction...";

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

        {/* Vault stats */}
        <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {[
            { label: "TVL", value: vault.tvlFormatted ?? "—", color: "text-zinc-900 dark:text-zinc-100" },
            { label: "Status", value: vault.status === "paused" ? "Paused" : "Active", color: vault.status === "paused" ? "text-amber-600" : "text-emerald-600" },
            { label: "Asset", value: assetSymbol, color: "text-zinc-900 dark:text-zinc-100" },
          ].map((item) => (
            <div key={item.label} className="min-h-[92px] rounded-2xl border border-[#E1E5E1] bg-[#F1F2F0] px-5 py-4 dark:border-[#1A1F2B] dark:bg-[#121722]">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">{item.label}</p>
              <p className={`text-[1.25rem] font-bold leading-tight ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Fee tags (all 3 from the Fees struct) */}
        <div className="mb-4 flex flex-wrap gap-2">
          {vault.performanceFeePercent != null && (
            <span className="rounded-full border border-[#E1E5E1] bg-[#F1F2F0] px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-[#1A1F2B] dark:bg-[#121722] dark:text-zinc-300">Perf. Fee: {vault.performanceFeePercent.toFixed(2)}%</span>
          )}
          {vault.managementFeePercent != null && (
            <span className="rounded-full border border-[#E1E5E1] bg-[#F1F2F0] px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-[#1A1F2B] dark:bg-[#121722] dark:text-zinc-300">Mgmt. Fee: {vault.managementFeePercent.toFixed(2)}%</span>
          )}
          {vault.withdrawalFeePercent != null && (
            <span className="rounded-full border border-[#E1E5E1] bg-[#F1F2F0] px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-[#1A1F2B] dark:bg-[#121722] dark:text-zinc-300">Withdrawal Fee: {vault.withdrawalFeePercent.toFixed(2)}%</span>
          )}
        </div>

        {/* Tx feedback */}
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

              {/* ── Deposit ─────────────────────────────────────────────── */}
              {actionTab === "deposit" && (
                <div className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 dark:border-[#1A1F2B] dark:bg-[#121722]">
                  <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                    Wallet balance:{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {assetBalance !== undefined ? formatAsset(assetBalance, decimals, assetSymbol) : "—"}
                    </span>
                  </p>
                  <label htmlFor="deposit-amount" className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    {`Amount (${assetSymbol})`}
                  </label>
                  <div className="mb-4 flex items-center rounded-xl border border-zinc-300 bg-white/95 px-3 py-1.5 shadow-sm dark:border-[#1A1F2B] dark:bg-[#121722]">
                    <input
                      id="deposit-amount"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      type="number"
                      min="0"
                      disabled={isBusy || vault.status === "paused"}
                      className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2.5 text-base font-medium text-zinc-900 placeholder:text-zinc-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-0 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                    />
                    <span className="shrink-0 rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:border-[#232938] dark:bg-[#161B26] dark:text-zinc-300">
                      {assetSymbol}
                    </span>
                  </div>

                  {vault.status === "paused" ? (
                    <p className="text-sm text-amber-400">Deposits are disabled while vault is paused.</p>
                  ) : needsApprove ? (
                    <div>
                      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                        Step 1: Approve the vault to spend your {assetSymbol}
                      </p>
                      <button type="button" onClick={handleApproveAsset} disabled={isBusy} className={ACTION_BTN_CLASS}>
                        {isBusy ? "Approving..." : `Approve ${assetSymbol}`}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={handleDeposit} disabled={isBusy || !depositAmount || depositAmountParsed <= BigInt(0)} className={DEPOSIT_BTN_CLASS}>
                      {isBusy ? "Depositing..." : `Deposit ${assetSymbol}`}
                    </button>
                  )}
                </div>
              )}

              {/* ── Withdraw (async ERC-7540) ────────────────────────────── */}
              {actionTab === "withdraw" && (
                <div className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 dark:border-[#1A1F2B] dark:bg-[#121722]">

                  {/* Claimable section */}
                  {claimableRedeem && claimableRedeem.shares > BigInt(0) && (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/30">
                      <p className="mb-2 text-sm font-semibold text-emerald-700">
                        Ready to claim
                      </p>
                      <p className="mb-3 text-sm text-zinc-800 dark:text-zinc-100">
                        {formatAsset(claimableRedeem.assets, decimals, assetSymbol)}
                      </p>
                      <button type="button" onClick={handleClaim} disabled={isBusy} className={DEPOSIT_BTN_CLASS}>
                        {isBusy ? "Claiming..." : "Claim Assets"}
                      </button>
                    </div>
                  )}

                  {/* Pending section */}
                  {pendingRedeem && pendingRedeem.shares > BigInt(0) && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/25">
                      <p className="mb-2 text-sm font-semibold text-amber-700">
                        Pending redemption (≤72h)
                      </p>
                      <p className="mb-3 text-sm text-zinc-800 dark:text-zinc-100">
                        {formatAsset(pendingRedeem.shares, 18, vault.symbol)} shares escrowed
                      </p>
                      <button type="button" onClick={handleCancelRedeem} disabled={isBusy} className="w-full rounded-xl border border-amber-300 bg-white/80 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-white dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60">
                        {isBusy ? "Cancelling..." : "Cancel Request"}
                      </button>
                    </div>
                  )}

                  {/* Request redeem form */}
                  <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                    Share balance:{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {shareBalance !== undefined ? formatAsset(shareBalance, 18, vault.symbol) : "—"}
                    </span>
                  </p>
                  <label htmlFor="redeem-shares" className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    {`Shares to redeem (${vault.symbol})`}
                  </label>
                  <div className="mb-2 flex items-center rounded-xl border border-zinc-300 bg-white/95 px-3 py-1.5 shadow-sm dark:border-[#1A1F2B] dark:bg-[#121722]">
                    <input
                      id="redeem-shares"
                      placeholder="0.00"
                      value={requestRedeemShares}
                      onChange={(e) => setRequestRedeemShares(e.target.value)}
                      type="number"
                      min="0"
                      disabled={isBusy}
                      className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2.5 text-base font-medium text-zinc-900 placeholder:text-zinc-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-0 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                    />
                    <span className="shrink-0 rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:border-[#232938] dark:bg-[#161B26] dark:text-zinc-300">
                      {vault.symbol}
                    </span>
                  </div>
                  <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
                    Async ERC-7540: operator fulfills within 72h, then you claim.
                    {vault.withdrawalFeePercent ? ` Withdrawal fee: ${vault.withdrawalFeePercent.toFixed(2)}%.` : ""}
                  </p>

                  {needsShareApprove ? (
                    <div>
                      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                        Step 1: Approve vault to escrow your shares
                      </p>
                      <button type="button" onClick={handleApproveShares} disabled={isBusy} className={ACTION_BTN_CLASS}>
                        {isBusy ? "Approving shares..." : `Approve ${vault.symbol}`}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={handleRequestRedeem} disabled={isBusy || !requestRedeemShares || requestSharesParsed <= BigInt(0)} className={DEPOSIT_BTN_CLASS}>
                      {isBusy ? "Requesting..." : "Request Redeem"}
                    </button>
                  )}
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
