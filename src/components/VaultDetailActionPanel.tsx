"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import type { SupportedAsset } from "@/hooks/useSupportedAssets";

type VaultKind = "ultrayield" | "morpho" | "midas";

type VaultLike = {
  isLoading: boolean;
  isPaused: boolean;
  symbol?: string;
  userSharesFormatted?: string;
  withdrawalFeePercent?: number;
};

function TxSummaryRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-200 py-2.5 last:border-b-0 dark:border-[#1b1b1f]">
      <span className="shrink-0 text-sm text-gray-500 dark:text-[#afafb2]">{label}</span>
      <div className="min-w-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-black dark:text-zinc-100">{value}</span>
        {sub && <span className="block text-xs tabular-nums text-gray-400 dark:text-zinc-500">{sub}</span>}
      </div>
    </div>
  );
}

interface VaultDetailActionPanelProps {
  walletPending: boolean;
  isConnected: boolean;
  vault: VaultLike;
  hasAssetAddr: boolean;
  actionTabIdx: number;
  setActionTabIdx: (idx: number) => void;
  vaultKind: VaultKind;
  supportedAssets: SupportedAsset[];
  depositAsset: SupportedAsset | null;
  withdrawAsset: SupportedAsset | null;
  setSelectedAssetAddr: (addr: `0x${string}`) => void;
  setSelectedWithdrawAssetAddr: (addr: `0x${string}`) => void;
  setDepositAmount: (value: string) => void;
  setRedeemAmount: (value: string) => void;
  depositAssetBalanceFmt: string;
  depositAmount: string;
  redeemAmount: string;
  isBusy: boolean;
  assetSymForDisplay: string;
  withdrawAssetSym: string;
  depositAssetBalance: bigint | undefined;
  handleMaxDeposit: () => void;
  handleMaxRedeem: () => void;
  termsAccepted: boolean;
  setTermsAccepted: (checked: boolean) => void;
  needsAssetApprove: boolean;
  needsShareApprove: boolean;
  handleApproveAsset: () => void;
  handleMidasDeposit: () => void;
  handleMorphoDeposit: () => void;
  handleUYDeposit: () => void;
  midasDepositParsed18: bigint;
  depositAmountParsed: bigint;
  lastAction: string;
  darkActionBtnClass: string;
  midasLiveShares: bigint | undefined;
  midasInstantFeePct: number | undefined;
  redeemAmountParsed: bigint;
  handleMidasRedeemInstant: () => void;
  handleMidasRedeemRequest: () => void;
  handleMorphoRedeem: () => void;
  handleApproveShares: () => void;
  handleRequestRedeem: () => void;
  openWalletConnect: () => void;
  depositSharesOutFmt: string;
  redeemAssetsOutFmt: string;
  depositSharesOutUsd?: string;
  redeemAssetsOutUsd?: string;
  needsMidasShareApprove?: boolean;
  handleApproveMidasShares?: () => void;
  /** Redemption vault payment token (USDC); required before redeem calls */
  midasRedeemTokenOut?: string;
}

export function VaultDetailActionPanel(props: VaultDetailActionPanelProps) {
  const {
    walletPending,
    isConnected,
    vault,
    hasAssetAddr,
    actionTabIdx,
    setActionTabIdx,
    vaultKind,
    supportedAssets,
    depositAsset,
    withdrawAsset,
    setSelectedAssetAddr,
    setSelectedWithdrawAssetAddr,
    setDepositAmount,
    setRedeemAmount,
    depositAssetBalanceFmt,
    depositAmount,
    redeemAmount,
    isBusy,
    assetSymForDisplay,
    withdrawAssetSym,
    depositAssetBalance,
    handleMaxDeposit,
    handleMaxRedeem,
    termsAccepted,
    setTermsAccepted,
    needsAssetApprove,
    needsShareApprove,
    handleApproveAsset,
    handleMidasDeposit,
    handleMorphoDeposit,
    handleUYDeposit,
    midasDepositParsed18,
    depositAmountParsed,
    lastAction,
    darkActionBtnClass,
    midasLiveShares,
    midasInstantFeePct,
    redeemAmountParsed,
    handleMidasRedeemInstant,
    handleMidasRedeemRequest,
    handleMorphoRedeem,
    handleApproveShares,
    handleRequestRedeem,
    openWalletConnect,
    depositSharesOutFmt,
    redeemAssetsOutFmt,
    depositSharesOutUsd,
    redeemAssetsOutUsd,
    needsMidasShareApprove,
    handleApproveMidasShares,
    midasRedeemTokenOut,
  } = props;

  return (
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
                "-mb-px flex-1 border-b-[0.1875rem] pb-3 text-center text-sm transition " +
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
                "-mb-px flex-1 border-b-[0.1875rem] pb-3 text-center text-sm transition " +
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
                  <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
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
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                  Input amount
                </span>
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
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
                    className="rounded-md bg-gray-200 px-2.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-gray-800 transition hover:bg-gray-300 disabled:opacity-40 dark:border dark:border-[#1b1b1f] dark:bg-[#27272b] dark:text-[#ffffff] dark:hover:bg-[#afafb2]"
                  >
                    Max
                  </button>
                </div>
              </div>

              <div className="mb-4 rounded-xl bg-white/70 px-1 dark:bg-[#141417]/70">
                <TxSummaryRow
                  label="You will receive"
                  value={depositSharesOutFmt}
                  sub={depositSharesOutUsd}
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
                    <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                      Privacy Policy
                    </Link>
                    {" "}and{" "}
                    <Link href="/terms-of-use" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                      Terms of Use
                    </Link>
                  </span>
                </label>
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
                    className={darkActionBtnClass}
                  >
                    {isBusy && lastAction === "approve" ? "Approving..." : `Approve ${assetSymForDisplay}`}
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
                  className={darkActionBtnClass}
                >
                  {isBusy && lastAction === "deposit" ? "Depositing..." : `Deposit ${assetSymForDisplay}`}
                </button>
              )}
            </div>
          )}

          {actionTabIdx === 1 && (
            <div>
              {vaultKind === "midas" && supportedAssets.length > 1 && (
                <div className="mb-4">
                  <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
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
              {vaultKind === "ultrayield" && supportedAssets.length > 1 && (
                <div className="mb-4">
                  <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                    Receive as
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {supportedAssets.map((a) => (
                      <button
                        key={a.address}
                        type="button"
                        disabled={!isConnected}
                        onClick={() => { setSelectedWithdrawAssetAddr(a.address); setRedeemAmount(""); }}
                        className={
                          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 " +
                          (withdrawAsset?.address === a.address
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
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                  Input amount
                </span>
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
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
                    className="rounded-md bg-gray-200 px-2.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-gray-800 transition hover:bg-gray-300 disabled:opacity-40 dark:border dark:border-[#1b1b1f] dark:bg-[#27272b] dark:text-[#ffffff] dark:hover:bg-[#afafb2]"
                  >
                    Max
                  </button>
                </div>
              </div>

              <div className="mb-4 rounded-xl bg-white/70 px-1 dark:bg-[#141417]/70">
                <TxSummaryRow
                  label="You will receive"
                  value={redeemAssetsOutFmt}
                  sub={redeemAssetsOutUsd}
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
                    <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                      Privacy Policy
                    </Link>
                    {" "}and{" "}
                    <Link href="/terms-of-use" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                      Terms of Use
                    </Link>
                  </span>
                </label>
              )}

              {vaultKind === "midas" ? (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-gray-200 bg-white/90 p-3 dark:border-[#1b1b1f] dark:bg-[#141417]">
                      <p className="text-[0.625rem] font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">Instant fee</p>
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
                      <p className="text-[0.625rem] font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">Standard fee</p>
                      <p className="mt-0.5 text-base font-bold text-slate-600 dark:text-zinc-300">0%</p>
                    </div>
                  </div>
                  {isConnected && needsMidasShareApprove && (
                    <>
                      <p className="mb-3 text-xs text-gray-500 dark:text-zinc-400">
                        Step 1 of 2: Approve redemption vault to spend {vault.symbol}
                      </p>
                      <button
                        type="button"
                        onClick={handleApproveMidasShares}
                        disabled={isBusy || !termsAccepted || redeemAmountParsed <= BigInt(0)}
                        className={darkActionBtnClass}
                      >
                        {isBusy && lastAction === "approve" ? "Approving..." : `Approve ${vault.symbol}`}
                      </button>
                    </>
                  )}
                  {isConnected && !needsMidasShareApprove && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleMidasRedeemInstant}
                        disabled={isBusy || !termsAccepted || redeemAmountParsed <= BigInt(0) || !midasRedeemTokenOut}
                        className={darkActionBtnClass}
                      >
                        {isBusy && lastAction === "withdraw" ? "Redeeming..." : (
                          `Instant${midasInstantFeePct !== undefined ? ` (${midasInstantFeePct.toFixed(2)}%)` : ""}`
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleMidasRedeemRequest}
                        disabled={isBusy || !termsAccepted || redeemAmountParsed <= BigInt(0) || !midasRedeemTokenOut}
                        className="w-full rounded-xl border border-gray-300 bg-white px-5 py-3.5 text-base font-semibold text-gray-900 transition hover:bg-gray-50 disabled:opacity-60 dark:border-[#1b1b1f] dark:bg-[#141417] dark:text-[#ffffff] dark:hover:bg-[#27272b]"
                      >
                        {isBusy && lastAction === "withdraw" ? "Requesting..." : "Standard (free)"}
                      </button>
                    </div>
                  )}
                  <p className="mt-3 text-[0.6875rem] leading-relaxed text-gray-500 dark:text-zinc-400">
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
                      className={darkActionBtnClass}
                    >
                      {isBusy && lastAction === "withdraw" ? "Redeeming..." : "Redeem shares"}
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
                        className={darkActionBtnClass}
                      >
                        {isBusy && lastAction === "approve" ? "Approving..." : `Approve ${vault.symbol}`}
                      </button>
                    </>
                  )}
                  {isConnected && vaultKind !== "morpho" && !needsShareApprove && (
                    <button
                      type="button"
                      onClick={handleRequestRedeem}
                      disabled={isBusy || !termsAccepted || redeemAmountParsed <= BigInt(0)}
                      className={darkActionBtnClass}
                    >
                      {isBusy && lastAction === "withdraw" ? "Requesting..." : "Request redeem"}
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
                  Connect your wallet to execute on-chain transactions.
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
  );
}
