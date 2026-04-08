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

export function MorphoVaultActionModal({ vault, open, onClose, onTxCompleted }: Props) {
  const { address: userAddress, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [depositAmount, setDepositAmount] = useState("");
  const [redeemShares, setRedeemShares] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
          {[
            { label: "TVL",    value: vault.tvlFormatted ?? "—",                                       color: "#4589ff" },
            { label: "Status", value: vault.status === "paused" ? "Paused" : "Active",                 color: vault.status === "paused" ? "#ff832b" : "#42be65" },
            { label: "Asset",  value: assetSym,                                                        color: "#c6c6c6" },
          ].map((item) => (
            <Tile key={item.label} style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "4px", padding: "0.75rem 1rem" }}>
              <p style={{ fontSize: "0.7rem", color: "#8d8d8d", marginBottom: "0.25rem" }}>{item.label}</p>
              <p style={{ fontSize: "1rem", fontWeight: 700, color: item.color }}>{item.value}</p>
            </Tile>
          ))}
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <Tag type="blue" size="sm">ERC-4626 (Morpho)</Tag>
          <Tag type="green" size="sm" style={{ marginLeft: "0.5rem" }}>Sync Redemption</Tag>
        </div>

        {isConfirmed && (
          <>
            <InlineNotification
              kind="success"
              title="Transaction confirmed"
              subtitle={txHash ? `Hash: ${txHash.slice(0, 10)}…` : "Transaction confirmed"}
              style={{ marginBottom: "0.5rem" }}
              onCloseButtonClick={() => { resetWrite(); refetch(); }}
            />
            {txHash && (
              <a
                href={getTxExplorerLink(txHash, vault.chainId ?? 1)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#4589ff", textDecoration: "underline", fontSize: "0.8rem", display: "inline-block", marginBottom: "1rem" }}
              >
                View transaction
              </a>
            )}
          </>
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

              {/* ── Deposit ─────────────────────────────────────────── */}
              <TabPanel>
                <div style={{ paddingTop: "1rem" }}>
                  <p style={{ fontSize: "0.8rem", color: "#8d8d8d", marginBottom: "1rem" }}>
                    Wallet balance:{" "}
                    <span style={{ color: "#4589ff", fontWeight: 600 }}>
                      {assetBalance !== undefined ? fmt(assetBalance, assetDec, assetSym) : "—"}
                    </span>
                  </p>
                  <TextInput
                    id="morpho-deposit-amount"
                    labelText={`Amount (${assetSym})`}
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
                        Step 1: Approve the vault to spend your {assetSym}
                      </p>
                      <Button kind="tertiary" size="md" onClick={handleApprove} disabled={isBusy} style={{ width: "100%" }}>
                        {isBusy ? <InlineLoading description="Approving…" /> : `Approve ${assetSym}`}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      kind="primary" size="md"
                      onClick={handleDeposit}
                      disabled={isBusy || depositParsed <= BigInt(0)}
                      style={{ width: "100%" }}
                    >
                      {isBusy ? <InlineLoading description="Depositing…" /> : `Deposit ${assetSym}`}
                    </Button>
                  )}
                </div>
              </TabPanel>

              {/* ── Withdraw (sync ERC-4626 redeem) ─────────────────── */}
              <TabPanel>
                <div style={{ paddingTop: "1rem" }}>
                  <p style={{ fontSize: "0.8rem", color: "#8d8d8d", marginBottom: "1rem" }}>
                    Share balance:{" "}
                    <span style={{ color: "#be95ff", fontWeight: 600 }}>
                      {shareBalance !== undefined ? fmt(shareBalance, shareDec, shareSym) : "—"}
                    </span>
                  </p>
                  <TextInput
                    id="morpho-redeem-shares"
                    labelText={`Shares to redeem (${shareSym})`}
                    placeholder="0.00"
                    value={redeemShares}
                    onChange={(e) => setRedeemShares(e.target.value)}
                    type="number"
                    min="0"
                    style={{ marginBottom: "0.5rem" }}
                    disabled={isBusy}
                  />
                  <p style={{ fontSize: "0.7rem", color: "#6f6f6f", marginBottom: "1rem" }}>
                    Synchronous ERC-4626 redemption — assets returned immediately.
                  </p>
                  <Button
                    kind="secondary" size="md"
                    onClick={handleRedeem}
                    disabled={isBusy || redeemParsed <= BigInt(0)}
                    style={{ width: "100%" }}
                  >
                    {isBusy ? <InlineLoading description="Redeeming…" /> : "Redeem Shares"}
                  </Button>
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
