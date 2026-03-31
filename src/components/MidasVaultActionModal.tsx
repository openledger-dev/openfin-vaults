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

import React, { useState, useMemo } from "react";
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
  Select,
  SelectItem,
} from "@carbon/react";
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits, maxUint256, type Abi } from "viem";
import { ERC20_ABI } from "@/lib/vaultAbi";
import { DEPOSIT_REFERRAL_ID } from "@/lib/referral";
import type { Vault } from "@/types/vault";
import { useSupportedAssets } from "@/hooks/useSupportedAssets";

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
}

function fmt(raw: bigint, dec: number, sym: string): string {
  const n = parseFloat(formatUnits(raw, dec));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(4)}M ${sym}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(4)}K ${sym}`;
  return `${n.toFixed(4)} ${sym}`;
}

export function MidasVaultActionModal({ vault, open, onClose }: Props) {
  const { address: userAddress, isConnected } = useAccount();
  const [depositAmount, setDepositAmount]     = useState("");
  const [redeemAmount, setRedeemAmount]       = useState("");
  const [selectedPaymentToken, setSelectedPaymentToken] = useState("");

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
  const shareDec   = 18; // Midas share tokens are always 18 decimals
  const shareSym   = vault?.symbol ?? "—";
  const paymentDec = activeAsset?.decimals ?? 6;
  const paymentSym = activeAsset?.symbol ?? "—";

  const enabled = !!shareAddr && !!userAddress && open;

  // ── instantFee from redemption vault (1e18 = 100%) ───────────────────────
  const { data: feeData } = useReadContracts({
    contracts: redeemVault
      ? [{ address: redeemVault, abi: MIDAS_REDEEM_READ_ABI, functionName: "instantFee" as const }]
      : [],
    query: { enabled: !!redeemVault },
  });
  const instantFeeRaw = feeData?.[0]?.status === "success" ? (feeData[0].result as bigint) : undefined;
  const instantFeePct = instantFeeRaw !== undefined ? Number(instantFeeRaw) / 1e16 : undefined;

  const { data: reads, refetch } = useReadContracts({
    contracts: [
      // [0] payment token wallet balance
      { address: (activePaymentToken || shareAddr) as `0x${string}`, abi: ERC20_ABI as Abi, functionName: "balanceOf",  args: [userAddress!] },
      // [1] payment token allowance to deposit vault
      { address: (activePaymentToken || shareAddr) as `0x${string}`, abi: ERC20_ABI as Abi, functionName: "allowance",  args: [userAddress!, (depositVault || shareAddr) as `0x${string}`] },
      // [2] share balance (for redeem)
      { address: shareAddr!, abi: ERC20_ABI as Abi, functionName: "balanceOf", args: [userAddress!] },
    ],
    query: { enabled: enabled && !!activePaymentToken },
  });

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
      abi: ERC20_ABI,
      functionName: "approve",
      args: [depositVault, maxUint256],
    });
  }

  function handleDeposit() {
    if (!depositVault || !activePaymentToken || depositParsed18 <= BigInt(0)) return;
    writeContract({
      address: depositVault,
      abi: MIDAS_DEPOSIT_ABI,
      functionName: "depositInstant",
      args: [
        activePaymentToken as `0x${string}`,
        depositParsed18,
        BigInt(0), // minReceiveAmount — no sandwich risk on Midas
        DEPOSIT_REFERRAL_ID,
      ],
    });
  }

  function handleRedeemInstant() {
    if (!redeemVault || !activePaymentToken || redeemParsed <= BigInt(0)) return;
    writeContract({
      address: redeemVault,
      abi: MIDAS_REDEEM_ABI,
      functionName: "redeemInstant",
      args: [
        activePaymentToken as `0x${string}`,
        redeemParsed,
        BigInt(0),
      ],
    });
  }

  function handleRedeemRequest() {
    if (!redeemVault || !activePaymentToken || redeemParsed <= BigInt(0)) return;
    writeContract({
      address: redeemVault,
      abi: MIDAS_REDEEM_ABI,
      functionName: "redeemRequest",
      args: [activePaymentToken as `0x${string}`, redeemParsed],
    });
  }

  function handleClose() {
    setDepositAmount("");
    setRedeemAmount("");
    resetWrite();
    refetch();
    onClose();
  }

  if (!vault) return null;

  return (
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
            { label: "TVL",    value: vault.tvlFormatted ?? "—", color: "#4589ff" },
            { label: "Status", value: "Active",                  color: "#42be65" },
            { label: "Token",  value: shareSym,                  color: "#c6c6c6" },
          ].map((item) => (
            <Tile key={item.label} style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "4px", padding: "0.75rem 1rem" }}>
              <p style={{ fontSize: "0.7rem", color: "#8d8d8d", marginBottom: "0.25rem" }}>{item.label}</p>
              <p style={{ fontSize: "1rem", fontWeight: 700, color: item.color }}>{item.value}</p>
            </Tile>
          ))}
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <Tag type="purple" size="sm">Midas RWA</Tag>
          <Tag type="teal" size="sm" style={{ marginLeft: "0.5rem" }}>Instant + Async Redemption</Tag>
        </div>

        {isConfirmed && (
          <InlineNotification kind="success" title="Transaction confirmed"
            subtitle={`Hash: ${txHash?.slice(0, 10)}…`}
            style={{ marginBottom: "1rem" }} onCloseButtonClick={() => { resetWrite(); refetch(); }} />
        )}
        {writeError && (
          <InlineNotification kind="error" title="Transaction failed"
            subtitle={writeError.message.slice(0, 120)}
            style={{ marginBottom: "1rem" }} onCloseButtonClick={resetWrite} />
        )}

        {!isConnected ? (
          <p style={{ color: "#8d8d8d", fontSize: "0.875rem", textAlign: "center", padding: "2rem 0" }}>
            Connect your wallet to deposit or redeem
          </p>
        ) : !depositVault ? (
          <InlineNotification
            kind="warning"
            title="Vault addresses not configured"
            subtitle="Add depositVaultAddress and redemptionVaultAddress in MIDAS_VAULT_CONFIG to enable actions."
            hideCloseButton
          />
        ) : (
          <>
            {/* Payment token selector (shown for both deposit and redeem) */}
            {paymentAssets.length > 1 && (
              <Select
                id="midas-payment-token"
                labelText="Payment token"
                value={activePaymentToken}
                onChange={(e) => setSelectedPaymentToken(e.target.value)}
                style={{ marginBottom: "1rem" }}
              >
                {paymentAssets.map((a) => (
                  <SelectItem key={a.address} value={a.address} text={a.symbol} />
                ))}
              </Select>
            )}

            <Tabs>
              <TabList aria-label="Vault actions">
                <Tab>Deposit</Tab>
                <Tab>Redeem</Tab>
              </TabList>
              <TabPanels>

                {/* ── Deposit ──────────────────────────────────────── */}
                <TabPanel>
                  <div style={{ paddingTop: "1rem" }}>
                    <p style={{ fontSize: "0.8rem", color: "#8d8d8d", marginBottom: "1rem" }}>
                      Wallet balance:{" "}
                      <span style={{ color: "#4589ff", fontWeight: 600 }}>
                        {paymentBalance !== undefined ? fmt(paymentBalance, paymentDec, paymentSym) : "—"}
                      </span>
                    </p>
                    <TextInput
                      id="midas-deposit-amount"
                      labelText={`Amount (${paymentSym})`}
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      type="number"
                      min="0"
                      style={{ marginBottom: "0.5rem" }}
                      disabled={isBusy}
                    />
                    <p style={{ fontSize: "0.7rem", color: "#6f6f6f", marginBottom: "1rem" }}>
                      Instant mint — {shareSym} delivered to your wallet immediately.
                    </p>

                    {needsApprove ? (
                      <div>
                        <p style={{ fontSize: "0.75rem", color: "#6f6f6f", marginBottom: "0.75rem" }}>
                          Step 1: Approve the deposit vault to spend your {paymentSym}
                        </p>
                        <Button kind="tertiary" size="md" onClick={handleApprove} disabled={isBusy} style={{ width: "100%" }}>
                          {isBusy ? <InlineLoading description="Approving…" /> : `Approve ${paymentSym}`}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        kind="primary" size="md"
                        onClick={handleDeposit}
                        disabled={isBusy || depositParsed18 <= BigInt(0)}
                        style={{ width: "100%" }}
                      >
                        {isBusy ? <InlineLoading description="Depositing…" /> : `Deposit ${paymentSym}`}
                      </Button>
                    )}
                  </div>
                </TabPanel>

                {/* ── Redeem ───────────────────────────────────────── */}
                <TabPanel>
                  <div style={{ paddingTop: "1rem" }}>
                    <p style={{ fontSize: "0.8rem", color: "#8d8d8d", marginBottom: "1rem" }}>
                      {shareSym} balance:{" "}
                      <span style={{ color: "#be95ff", fontWeight: 600 }}>
                        {shareBalance !== undefined ? fmt(shareBalance, shareDec, shareSym) : "—"}
                      </span>
                    </p>
                    <TextInput
                      id="midas-redeem-amount"
                      labelText={`${shareSym} to redeem`}
                      placeholder="0.00"
                      value={redeemAmount}
                      onChange={(e) => setRedeemAmount(e.target.value)}
                      type="number"
                      min="0"
                      style={{ marginBottom: "0.5rem" }}
                      disabled={isBusy}
                    />
                    {/* Fee + mode comparison */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
                      <div style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "4px", padding: "0.75rem" }}>
                        <p style={{ fontSize: "0.65rem", color: "#8d8d8d", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
                          Instant Fee
                        </p>
                        <p style={{ fontSize: "0.9rem", fontWeight: 700, color: instantFeePct !== undefined ? "#ff832b" : "#6f6f6f" }}>
                          {instantFeePct !== undefined ? `${instantFeePct.toFixed(2)}%` : "—"}
                        </p>
                        <p style={{ fontSize: "0.65rem", color: "#6f6f6f", marginTop: "0.2rem" }}>Atomic, funds returned immediately</p>
                      </div>
                      <div style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "4px", padding: "0.75rem" }}>
                        <p style={{ fontSize: "0.65rem", color: "#8d8d8d", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
                          Standard Fee
                        </p>
                        <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "#42be65" }}>0%</p>
                        <p style={{ fontSize: "0.65rem", color: "#6f6f6f", marginTop: "0.2rem" }}>Async, processed in order — no cancel</p>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <Button
                        kind="primary" size="md"
                        onClick={handleRedeemInstant}
                        disabled={isBusy || redeemParsed <= BigInt(0)}
                        style={{ width: "100%" }}
                      >
                        {isBusy ? <InlineLoading description="Redeeming…" /> : `Instant${instantFeePct !== undefined ? ` (${instantFeePct.toFixed(2)}% fee)` : ""}`}
                      </Button>
                      <Button
                        kind="secondary" size="md"
                        onClick={handleRedeemRequest}
                        disabled={isBusy || redeemParsed <= BigInt(0)}
                        style={{ width: "100%" }}
                      >
                        {isBusy ? <InlineLoading description="Requesting…" /> : "Async (free)"}
                      </Button>
                    </div>
                  </div>
                </TabPanel>

              </TabPanels>
            </Tabs>
          </>
        )}
      </div>
    </Modal>
  );
}
