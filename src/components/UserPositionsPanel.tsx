"use client";

import React from "react";
import { Tile, Tag, SkeletonText } from "@carbon/react";
import { useAppKitAccount } from "@reown/appkit/react";
import type { VaultOnChainData } from "@/hooks/useVaultData";

interface UserPositionsPanelProps {
  vaults: VaultOnChainData[];
  isLoading: boolean;
}

function formatBigIntAsset(
  raw: bigint | undefined,
  decimals: number,
  symbol: string | undefined
): string {
  if (raw === undefined) return "—";
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4);
  const num = parseFloat(`${whole}.${fracStr}`);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(4)}M${symbol ? ` ${symbol}` : ""}`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(4)}K${symbol ? ` ${symbol}` : ""}`;
  return `${num.toFixed(4)}${symbol ? ` ${symbol}` : ""}`;
}

export function UserPositionsPanel({ vaults, isLoading }: UserPositionsPanelProps) {
  const { isConnected } = useAppKitAccount();

  if (!isConnected) {
    return (
      <Tile
        style={{
          background: "#1c1c1c",
          border: "1px dashed #393939",
          borderRadius: "4px",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <p style={{ color: "#8d8d8d", fontSize: "0.875rem" }}>
          Connect your wallet to view your positions
        </p>
      </Tile>
    );
  }

  const activePositions = vaults.filter(
    (v) => v.userShares !== undefined && v.userShares > 0n
  );

  const totalActiveCount = activePositions.length;

  return (
    <div>
      <h3
        style={{
          fontSize: "1rem",
          fontWeight: 600,
          color: "#f4f4f4",
          marginBottom: "1rem",
          letterSpacing: "0.02em",
        }}
      >
        Your Portfolio
      </h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {[
          {
            label: "Active Positions",
            value: isLoading ? null : String(totalActiveCount),
            color: "#f4f4f4",
          },
          {
            label: "Vaults Deposited",
            value: isLoading ? null : String(totalActiveCount),
            color: "#4589ff",
          },
          {
            label: "Wallet Status",
            value: "Connected",
            color: "#42be65",
          },
        ].map((item) => (
          <Tile
            key={item.label}
            style={{
              background: "#1c1c1c",
              border: "1px solid #393939",
              borderRadius: "4px",
              padding: "1.25rem 1.5rem",
            }}
          >
            <p
              style={{
                fontSize: "0.75rem",
                color: "#8d8d8d",
                marginBottom: "0.5rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {item.label}
            </p>
            {item.value === null ? (
              <SkeletonText style={{ width: "2rem" }} />
            ) : (
              <p
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: item.color,
                }}
              >
                {item.value}
              </p>
            )}
          </Tile>
        ))}
      </div>

      {isLoading ? (
        <p style={{ color: "#6f6f6f", fontSize: "0.875rem" }}>
          Loading your on-chain positions…
        </p>
      ) : activePositions.length > 0 ? (
        <div>
          <p
            style={{
              fontSize: "0.75rem",
              color: "#6f6f6f",
              marginBottom: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Active Positions
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {activePositions.map((vault) => {
              const decimals = vault.assetDecimals ?? 18;
              return (
                <Tile
                  key={vault.address}
                  style={{
                    background: "#1c1c1c",
                    border: "1px solid #393939",
                    borderRadius: "4px",
                    padding: "1rem 1.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <p style={{ color: "#f4f4f4", fontWeight: 600, fontSize: "0.875rem" }}>
                      {vault.name}
                    </p>
                    <p style={{ color: "#6f6f6f", fontSize: "0.75rem", fontFamily: "monospace" }}>
                      {vault.address.slice(0, 6)}…{vault.address.slice(-4)}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "3rem", alignItems: "center" }}>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: "#8d8d8d", fontSize: "0.75rem" }}>Shares</p>
                      <p style={{ color: "#f4f4f4", fontWeight: 600, fontSize: "0.875rem" }}>
                        {formatBigIntAsset(vault.userShares, 18, vault.symbol)}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: "#8d8d8d", fontSize: "0.75rem" }}>Asset Value</p>
                      <p style={{ color: "#4589ff", fontWeight: 600, fontSize: "0.875rem" }}>
                        {formatBigIntAsset(vault.userAssetsRaw, decimals, vault.assetSymbol)}
                      </p>
                    </div>
                    <Tag type={vault.isPaused ? "red" : "green"} size="sm">
                      {vault.isPaused ? "Paused" : "Active"}
                    </Tag>
                  </div>
                </Tile>
              );
            })}
          </div>
        </div>
      ) : (
        <p style={{ color: "#6f6f6f", fontSize: "0.875rem" }}>
          No vault positions found for this wallet.
        </p>
      )}
    </div>
  );
}
