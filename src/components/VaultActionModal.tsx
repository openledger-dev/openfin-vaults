"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Modal,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  TextInput,
  Button,
  InlineNotification,
  InlineLoading,
  Tile,
  Tag,
} from "@carbon/react";
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

export function VaultActionModal({ vault, open, onClose, onTxCompleted }: VaultActionModalProps) {
  const { address: userAddress, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [depositAmount, setDepositAmount] = useState("");
  const [requestRedeemShares, setRequestRedeemShares] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

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

  return (
    <>
      <Modal
        open={open}
        onRequestClose={handleClose}
        modalHeading={`${vault.name} — ${vault.platformLabel}`}
        passiveModal
        size="sm"
      >
        <div style={{ padding: "0 0 1rem 0" }}>

        {/* Vault stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
          {[
            { label: "TVL", value: vault.tvlFormatted ?? "—", color: "#4589ff" },
            { label: "Status", value: vault.status === "paused" ? "Paused" : "Active", color: vault.status === "paused" ? "#ff832b" : "#42be65" },
            { label: "Asset", value: assetSymbol, color: "#c6c6c6" },
          ].map((item) => (
            <Tile key={item.label} style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "4px", padding: "0.75rem 1rem" }}>
              <p style={{ fontSize: "0.7rem", color: "#8d8d8d", marginBottom: "0.25rem" }}>{item.label}</p>
              <p style={{ fontSize: "1rem", fontWeight: 700, color: item.color }}>{item.value}</p>
            </Tile>
          ))}
        </div>

        {/* Fee tags (all 3 from the Fees struct) */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
          {vault.performanceFeePercent != null && (
            <Tag type="blue" size="sm">Perf. Fee: {vault.performanceFeePercent.toFixed(2)}%</Tag>
          )}
          {vault.managementFeePercent != null && (
            <Tag type="purple" size="sm">Mgmt. Fee: {vault.managementFeePercent.toFixed(2)}%</Tag>
          )}
          {vault.withdrawalFeePercent != null && (
            <Tag type="teal" size="sm">Withdrawal Fee: {vault.withdrawalFeePercent.toFixed(2)}%</Tag>
          )}
        </div>

        {/* Tx feedback */}
        {isConfirmed && (
          <InlineNotification kind="success" title="Transaction confirmed"
            subtitle={
              txHash ? (
                <a
                  href={getTxExplorerLink(txHash, vault.chainId ?? 1)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#4589ff", textDecoration: "underline" }}
                >
                  View transaction: {txHash.slice(0, 10)}…
                </a>
              ) : "Transaction confirmed"
            }
            style={{ marginBottom: "1rem" }} onCloseButtonClick={() => { resetWrite(); refetch(); }} />
        )}
        {writeError && (
          <InlineNotification kind="error" title="Transaction failed"
            subtitle={writeError.message.slice(0, 120)}
            style={{ marginBottom: "1rem" }} onCloseButtonClick={resetWrite} />
        )}

        {!isConnected ? (
          <p style={{ color: "#8d8d8d", fontSize: "0.875rem", textAlign: "center", padding: "2rem 0" }}>
            Connect your wallet to deposit or withdraw
          </p>
        ) : !vault.assetAddress ? (
          <p style={{ color: "#8d8d8d", fontSize: "0.875rem", textAlign: "center", padding: "2rem 0" }}>
            Asset address unavailable — vault data still loading
          </p>
        ) : (
          <Tabs>
            <TabList aria-label="Vault actions">
              <Tab>Deposit</Tab>
              <Tab>Withdraw</Tab>
            </TabList>
            <TabPanels>

              {/* ── Deposit ─────────────────────────────────────────────── */}
              <TabPanel>
                <div style={{ paddingTop: "1rem" }}>
                  <p style={{ fontSize: "0.8rem", color: "#8d8d8d", marginBottom: "1rem" }}>
                    Wallet balance:{" "}
                    <span style={{ color: "#4589ff", fontWeight: 600 }}>
                      {assetBalance !== undefined ? formatAsset(assetBalance, decimals, assetSymbol) : "—"}
                    </span>
                  </p>
                  <TextInput
                    id="deposit-amount"
                    labelText={`Amount (${assetSymbol})`}
                    placeholder="0.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    type="number"
                    min="0"
                    style={{ marginBottom: "1rem" }}
                    disabled={isBusy || vault.status === "paused"}
                  />

                  {vault.status === "paused" ? (
                    <p style={{ color: "#ff832b", fontSize: "0.8rem" }}>Deposits are disabled while vault is paused.</p>
                  ) : needsApprove ? (
                    <div>
                      <p style={{ fontSize: "0.75rem", color: "#6f6f6f", marginBottom: "0.75rem" }}>
                        Step 1: Approve the vault to spend your {assetSymbol}
                      </p>
                      <Button kind="tertiary" size="md" onClick={handleApproveAsset} disabled={isBusy} style={{ width: "100%" }}>
                        {isBusy ? <InlineLoading description="Approving…" /> : `Approve ${assetSymbol}`}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      kind="primary" size="md"
                      onClick={handleDeposit}
                      disabled={isBusy || !depositAmount || depositAmountParsed <= BigInt(0)}
                      style={{ width: "100%" }}
                    >
                      {isBusy ? <InlineLoading description="Depositing…" /> : `Deposit ${assetSymbol}`}
                    </Button>
                  )}
                </div>
              </TabPanel>

              {/* ── Withdraw (async ERC-7540) ────────────────────────────── */}
              <TabPanel>
                <div style={{ paddingTop: "1rem" }}>

                  {/* Claimable section */}
                  {claimableRedeem && claimableRedeem.shares > BigInt(0) && (
                    <Tile style={{ background: "#1a2e1a", border: "1px solid #42be65", borderRadius: "4px", padding: "1rem", marginBottom: "1rem" }}>
                      <p style={{ fontSize: "0.8rem", color: "#42be65", fontWeight: 600, marginBottom: "0.5rem" }}>
                        Ready to claim
                      </p>
                      <p style={{ fontSize: "0.875rem", color: "#f4f4f4", marginBottom: "0.75rem" }}>
                        {formatAsset(claimableRedeem.assets, decimals, assetSymbol)}
                      </p>
                      <Button kind="primary" size="sm" onClick={handleClaim} disabled={isBusy} style={{ width: "100%" }}>
                        {isBusy ? <InlineLoading description="Claiming…" /> : "Claim Assets"}
                      </Button>
                    </Tile>
                  )}

                  {/* Pending section */}
                  {pendingRedeem && pendingRedeem.shares > BigInt(0) && (
                    <Tile style={{ background: "#2a2000", border: "1px solid #f1c21b", borderRadius: "4px", padding: "1rem", marginBottom: "1rem" }}>
                      <p style={{ fontSize: "0.8rem", color: "#f1c21b", fontWeight: 600, marginBottom: "0.5rem" }}>
                        Pending redemption (≤72h)
                      </p>
                      <p style={{ fontSize: "0.875rem", color: "#f4f4f4", marginBottom: "0.75rem" }}>
                        {formatAsset(pendingRedeem.shares, 18, vault.symbol)} shares escrowed
                      </p>
                      <Button kind="danger--ghost" size="sm" onClick={handleCancelRedeem} disabled={isBusy} style={{ width: "100%" }}>
                        {isBusy ? <InlineLoading description="Cancelling…" /> : "Cancel Request"}
                      </Button>
                    </Tile>
                  )}

                  {/* Request redeem form */}
                  <p style={{ fontSize: "0.8rem", color: "#8d8d8d", marginBottom: "1rem" }}>
                    Share balance:{" "}
                    <span style={{ color: "#be95ff", fontWeight: 600 }}>
                      {shareBalance !== undefined ? formatAsset(shareBalance, 18, vault.symbol) : "—"}
                    </span>
                  </p>
                  <TextInput
                    id="redeem-shares"
                    labelText={`Shares to redeem (${vault.symbol})`}
                    placeholder="0.00"
                    value={requestRedeemShares}
                    onChange={(e) => setRequestRedeemShares(e.target.value)}
                    type="number"
                    min="0"
                    style={{ marginBottom: "0.5rem" }}
                    disabled={isBusy}
                  />
                  <p style={{ fontSize: "0.7rem", color: "#6f6f6f", marginBottom: "1rem" }}>
                    Async ERC-7540: operator fulfills within 72h, then you claim.
                    {vault.withdrawalFeePercent ? ` Withdrawal fee: ${vault.withdrawalFeePercent.toFixed(2)}%.` : ""}
                  </p>

                  {needsShareApprove ? (
                    <div>
                      <p style={{ fontSize: "0.75rem", color: "#6f6f6f", marginBottom: "0.75rem" }}>
                        Step 1: Approve vault to escrow your shares
                      </p>
                      <Button kind="tertiary" size="md" onClick={handleApproveShares} disabled={isBusy} style={{ width: "100%" }}>
                        {isBusy ? <InlineLoading description="Approving shares…" /> : `Approve ${vault.symbol}`}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      kind="secondary" size="md"
                      onClick={handleRequestRedeem}
                      disabled={isBusy || !requestRedeemShares || requestSharesParsed <= BigInt(0)}
                      style={{ width: "100%" }}
                    >
                      {isBusy ? <InlineLoading description="Requesting…" /> : "Request Redeem"}
                    </Button>
                  )}
                </div>
              </TabPanel>

            </TabPanels>
          </Tabs>
        )}
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        modalHeading="Confirm Redemption"
        primaryButtonText="Confirm"
        secondaryButtonText="Cancel"
        onRequestClose={() => setConfirmOpen(false)}
        onRequestSubmit={() => {
          confirmAction?.();
          setConfirmOpen(false);
          setConfirmAction(null);
        }}
        size="sm"
      >
        <p>{confirmMessage}</p>
      </Modal>
    </>
  );
}
