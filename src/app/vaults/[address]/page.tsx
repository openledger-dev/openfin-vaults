"use client";

import React, { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, maxUint256 } from "viem";
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
import { VAULT_WRITE_ABI, ERC20_ABI } from "@/lib/vaultAbi";

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortAddr(addr: string | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function explorerLink(addr: string | undefined): string {
  if (!addr) return "#";
  return `https://etherscan.io/address/${addr}`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color = "#f4f4f4", loading = false,
}: {
  label: string; value: string; sub?: string; color?: string; loading?: boolean;
}) {
  return (
    <div style={{
      background: "#1c1c1c", border: "1px solid #393939", borderRadius: "6px",
      padding: "1.25rem 1.5rem",
    }}>
      <p style={{ fontSize: "0.7rem", color: "#8d8d8d", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
        {label}
      </p>
      {loading
        ? <SkeletonText style={{ width: "70%", marginBottom: "0.25rem" }} />
        : <p style={{ fontSize: "1.5rem", fontWeight: 700, color, lineHeight: 1.2, marginBottom: "0.15rem" }}>{value}</p>
      }
      {sub && <p style={{ fontSize: "0.7rem", color: "#6f6f6f" }}>{sub}</p>}
    </div>
  );
}

// ── Address row ───────────────────────────────────────────────────────────────

function AddressRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0", borderBottom: "1px solid #2e2e2e" }}>
      <span style={{ fontSize: "0.8rem", color: "#8d8d8d" }}>{label}</span>
      <a
        href={explorerLink(value)}
        target="_blank"
        rel="noopener noreferrer"
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VaultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawAddress = Array.isArray(params.address) ? params.address[0] : (params.address ?? "");
  const vaultAddress = /^0x[0-9a-fA-F]{40}$/.test(rawAddress)
    ? (rawAddress as `0x${string}`)
    : undefined;

  const { address: userAddress, isConnected } = useAccount();
  const vault = useVaultDetail(vaultAddress, userAddress);
  const { apy, label: apyLabel, isLoading: apyLoading } = use7dApy(
    vault.oracle,
    vaultAddress,
    vault.assetAddress,
  );

  const [depositAmount, setDepositAmount] = useState("");
  const [redeemShares, setRedeemShares] = useState("");

  const { writeContract, data: txHash, isPending: isWritePending, error: writeError, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
  const isBusy = isWritePending || isConfirming;

  const depositAmountParsed = useMemo(() => {
    try { return depositAmount ? parseUnits(depositAmount, vault.assetDecimals ?? 18) : 0n; }
    catch { return 0n; }
  }, [depositAmount, vault.assetDecimals]);

  const redeemSharesParsed = useMemo(() => {
    try { return redeemShares ? parseUnits(redeemShares, vault.decimals) : 0n; }
    catch { return 0n; }
  }, [redeemShares, vault.decimals]);

  const needsAssetApprove = vault.userAssetAllowance !== undefined
    && depositAmountParsed > 0n
    && vault.userAssetAllowance < depositAmountParsed;

  const needsShareApprove = vault.userShareAllowance !== undefined
    && redeemSharesParsed > 0n
    && vault.userShareAllowance < redeemSharesParsed;

  // ── Tx handlers ─────────────────────────────────────────────────────────
  function handleApproveAsset() {
    if (!vault.assetAddress || !vaultAddress) return;
    writeContract({ address: vault.assetAddress, abi: ERC20_ABI, functionName: "approve", args: [vaultAddress, maxUint256] });
  }
  function handleDeposit() {
    if (!vaultAddress || !vault.assetAddress || !userAddress || depositAmountParsed <= 0n) return;
    writeContract({ address: vaultAddress, abi: VAULT_WRITE_ABI, functionName: "depositAsset", args: [vault.assetAddress, depositAmountParsed, userAddress] });
  }
  function handleApproveShares() {
    if (!vaultAddress) return;
    writeContract({ address: vaultAddress, abi: ERC20_ABI, functionName: "approve", args: [vaultAddress, maxUint256] });
  }
  function handleRequestRedeem() {
    if (!vaultAddress || !vault.assetAddress || !userAddress || redeemSharesParsed <= 0n) return;
    writeContract({ address: vaultAddress, abi: VAULT_WRITE_ABI, functionName: "requestRedeemOfAsset", args: [vault.assetAddress, redeemSharesParsed, userAddress, userAddress] });
  }
  function handleCancelRedeem() {
    if (!vaultAddress || !vault.assetAddress || !userAddress) return;
    writeContract({ address: vaultAddress, abi: VAULT_WRITE_ABI, functionName: "cancelRedeemRequestOfAsset", args: [vault.assetAddress, userAddress, userAddress] });
  }
  function handleClaim() {
    if (!vaultAddress || !vault.assetAddress || !userAddress || !vault.claimableShares || vault.claimableShares === 0n) return;
    writeContract({ address: vaultAddress, abi: VAULT_WRITE_ABI, functionName: "redeemAsset", args: [vault.assetAddress, vault.claimableShares, userAddress, userAddress] });
  }

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

  const assetSym = vault.assetSymbol ?? "—";
  const statusColor = vault.isPaused ? "#ff832b" : "#42be65";

  return (
    <div style={{ minHeight: "100vh", background: "#161616" }}>
      <Navbar />
      <div style={{ paddingTop: "3rem" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 2rem 5rem" }}>

          {/* Breadcrumb */}
          <Breadcrumb style={{ marginBottom: "1.5rem" }}>
            <BreadcrumbItem href="/">Vaults</BreadcrumbItem>
            <BreadcrumbItem isCurrentPage>
              {vault.isLoading ? "Loading…" : vault.name}
            </BreadcrumbItem>
          </Breadcrumb>

          {/* Page header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <button
                type="button"
                onClick={() => router.push("/")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6f6f6f", padding: "0.25rem", display: "flex" }}
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                {vault.isLoading
                  ? <SkeletonText heading style={{ width: "200px" }} />
                  : <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f4f4f4", margin: 0, lineHeight: 1.2 }}>{vault.name}</h1>
                }
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  {vault.symbol && <Tag type="cool-gray" size="sm">{vault.symbol}</Tag>}
                  {assetSym !== "—" && <Tag type="blue" size="sm">Asset: {assetSym}</Tag>}
                  <Tag type={vault.isPaused ? "red" : "green"} size="sm">
                    {vault.isPaused ? "Paused" : "Active"}
                  </Tag>
                  <Tag type="purple" size="sm">ERC-7540 Async Redeem</Tag>
                </div>
              </div>
            </div>
            <a
              href={explorerLink(vaultAddress)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "#4589ff", textDecoration: "none", whiteSpace: "nowrap" }}
            >
              <span style={{ fontFamily: "monospace" }}>{shortAddr(vaultAddress)}</span>
              <Launch size={14} />
            </a>
          </div>

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
            <StatCard label="Total Value Locked" value={vault.tvlFormatted} sub="totalAssets() via oracle" color="#4589ff" loading={vault.isLoading} />
            <StatCard label="Total Supply" value={vault.totalSupplyFormatted} sub="Vault shares outstanding" loading={vault.isLoading} />
            <StatCard label="Share Price" value={vault.sharePriceFormatted} sub={`1 ${vault.symbol || "share"} = X ${assetSym}`} color="#be95ff" loading={vault.isLoading} />
            <StatCard
              label={apyLabel}
              value={apy !== null ? `${apy >= 0 ? "+" : ""}${apy.toFixed(2)}%` : "—"}
              sub="Annualised from oracle event logs"
              color={apy === null ? "#6f6f6f" : apy >= 0 ? "#42be65" : "#ff832b"}
              loading={vault.isLoading || apyLoading}
            />
            <StatCard
              label="Status"
              value={vault.isPaused ? "Paused" : "Active"}
              sub={vault.isPaused ? "Deposits disabled" : "Accepting deposits"}
              color={statusColor}
              loading={vault.isLoading}
            />
          </div>

          {/* Two-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "1.5rem", alignItems: "start" }}>

            {/* ── LEFT COLUMN ─────────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

              {/* Your Position */}
              {isConnected && (
                <section style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "6px", padding: "1.5rem" }}>
                  <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f4f4f4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1.25rem" }}>
                    Your Position
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
                    {[
                      { label: "Shares Held", value: vault.isLoading ? "…" : vault.userSharesFormatted, color: "#be95ff" },
                      { label: "Asset Value", value: vault.isLoading ? "…" : vault.userAssetsFormatted, color: "#4589ff" },
                      { label: "Wallet Balance", value: vault.isLoading ? "…" : vault.userAssetBalanceFormatted, color: "#c6c6c6" },
                    ].map((s) => (
                      <div key={s.label} style={{ background: "#262626", borderRadius: "4px", padding: "1rem" }}>
                        <p style={{ fontSize: "0.7rem", color: "#6f6f6f", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>{s.label}</p>
                        <p style={{ fontSize: "1.125rem", fontWeight: 700, color: s.color }}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Pending redeem */}
                  {vault.pendingShares !== undefined && vault.pendingShares > 0n && (
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

                  {/* Claimable redeem */}
                  {vault.claimableAssets !== undefined && vault.claimableAssets > 0n && (
                    <div style={{ background: "#0d1e0d", border: "1px solid #42be65", borderRadius: "4px", padding: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <p style={{ fontSize: "0.75rem", color: "#42be65", fontWeight: 600, marginBottom: "0.25rem" }}>Ready to Claim</p>
                          <p style={{ fontSize: "0.875rem", color: "#f4f4f4" }}>
                            {vault.userAssetsFormatted} available
                          </p>
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
                        tooltip="Charged on profits above the high-water mark. Max 30%." />
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
                }
              </section>

              {/* Vault Mechanics */}
              <section style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "6px", padding: "1.5rem" }}>
                <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f4f4f4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1.25rem" }}>
                  Vault Mechanics
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {[
                    { title: "Deposit", desc: "Synchronous — assets move to fundsHolder immediately. Returns vault shares." },
                    { title: "Redeem Request", desc: "Async (ERC-7540) — shares escrowed in vault. Operator fulfills within 72h." },
                    { title: "Claim", desc: "After operator fulfillment, assets become claimable via redeemAsset()." },
                    { title: "Pricing", desc: "Share price set by on-chain oracle (UltraVaultOracle). totalAssets() = oracle.getQuote(totalSupply, share, asset)." },
                    { title: "Cancel", desc: "Pending redeem requests can be cancelled before operator fulfillment." },
                  ].map((item) => (
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
                  ? <SkeletonText paragraph lineCount={5} />
                  : <>
                      <AddressRow label="Vault" value={vaultAddress} />
                      <AddressRow label="Asset Token" value={vault.assetAddress} />
                      <AddressRow label="Funds Holder" value={vault.fundsHolder} />
                      <AddressRow label="Oracle" value={vault.oracle} />
                      <AddressRow label="Rate Provider" value={vault.rateProvider} />
                      <AddressRow label="Fee Recipient" value={vault.feeRecipient} />
                    </>
                }
              </section>
            </div>

            {/* ── RIGHT COLUMN — action card (sticky) ─────────────────── */}
            <div style={{ position: "sticky", top: "4rem" }}>
              <div style={{ background: "#1c1c1c", border: "1px solid #393939", borderRadius: "6px", padding: "1.5rem" }}>
                <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f4f4f4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1.25rem" }}>
                  Actions
                </h2>

                {!isConnected ? (
                  <p style={{ fontSize: "0.875rem", color: "#8d8d8d", textAlign: "center", padding: "1.5rem 0" }}>
                    Connect your wallet to deposit or withdraw
                  </p>
                ) : !vault.assetAddress ? (
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

                      {/* Deposit */}
                      <TabPanel>
                        <div style={{ paddingTop: "1rem" }}>
                          <p style={{ fontSize: "0.75rem", color: "#8d8d8d", marginBottom: "0.75rem" }}>
                            Balance:{" "}
                            <span style={{ color: "#4589ff", fontWeight: 600 }}>{vault.userAssetBalanceFormatted}</span>
                          </p>
                          <TextInput
                            id="detail-deposit"
                            labelText={`Amount (${assetSym})`}
                            placeholder="0.00"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            type="number"
                            min="0"
                            style={{ marginBottom: "1rem" }}
                            disabled={isBusy || vault.isPaused}
                          />
                          {vault.isPaused ? (
                            <p style={{ fontSize: "0.8rem", color: "#ff832b" }}>Vault is paused — deposits disabled.</p>
                          ) : needsAssetApprove ? (
                            <>
                              <p style={{ fontSize: "0.7rem", color: "#6f6f6f", marginBottom: "0.75rem" }}>
                                Step 1 of 2: Approve vault to spend {assetSym}
                              </p>
                              <Button kind="tertiary" size="md" onClick={handleApproveAsset} disabled={isBusy} style={{ width: "100%" }}>
                                {isBusy ? <InlineLoading description="Approving…" /> : `Approve ${assetSym}`}
                              </Button>
                            </>
                          ) : (
                            <Button kind="primary" size="md" onClick={handleDeposit}
                              disabled={isBusy || depositAmountParsed <= 0n} style={{ width: "100%" }}>
                              {isBusy ? <InlineLoading description="Depositing…" /> : `Deposit ${assetSym}`}
                            </Button>
                          )}
                        </div>
                      </TabPanel>

                      {/* Withdraw */}
                      <TabPanel>
                        <div style={{ paddingTop: "1rem" }}>
                          <p style={{ fontSize: "0.75rem", color: "#8d8d8d", marginBottom: "0.75rem" }}>
                            Shares:{" "}
                            <span style={{ color: "#be95ff", fontWeight: 600 }}>{vault.userSharesFormatted}</span>
                          </p>
                          <TextInput
                            id="detail-redeem"
                            labelText={`Shares to redeem (${vault.symbol})`}
                            placeholder="0.00"
                            value={redeemShares}
                            onChange={(e) => setRedeemShares(e.target.value)}
                            type="number"
                            min="0"
                            style={{ marginBottom: "0.5rem" }}
                            disabled={isBusy}
                          />
                          <p style={{ fontSize: "0.7rem", color: "#6f6f6f", marginBottom: "1rem", lineHeight: 1.4 }}>
                            Async redemption — operator fulfills within 72h.
                            {vault.withdrawalFeePercent ? ` Withdrawal fee: ${vault.withdrawalFeePercent.toFixed(2)}%.` : ""}
                          </p>
                          {needsShareApprove ? (
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
                              disabled={isBusy || redeemSharesParsed <= 0n} style={{ width: "100%" }}>
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
