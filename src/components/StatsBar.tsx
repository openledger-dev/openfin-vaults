"use client";

import React from "react";
import { Tile, SkeletonText } from "@carbon/react";
import type { VaultOnChainData } from "@/hooks/useVaultData";

interface StatsBarProps {
  vaults: VaultOnChainData[];
  isLoading: boolean;
}

export function StatsBar({ vaults, isLoading }: StatsBarProps) {
  const totalVaults = vaults.length;
  const activeVaults = vaults.filter((v) => !v.isPaused).length;
  const pausedVaults = vaults.filter((v) => v.isPaused).length;

  const stats = [
    {
      label: "Total Vaults",
      value: isLoading ? null : String(totalVaults),
      subtext: "Configured on-chain",
    },
    {
      label: "Active Vaults",
      value: isLoading ? null : String(activeVaults),
      subtext: "Accepting deposits",
    },
    {
      label: "Paused Vaults",
      value: isLoading ? null : String(pausedVaults),
      subtext: "Deposits suspended",
    },
    {
      label: "Supported Networks",
      value: "4",
      subtext: "ETH · ARB · Base · OP",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "1px",
        background: "#393939",
        borderBottom: "1px solid #393939",
      }}
    >
      {stats.map((stat) => (
        <Tile
          key={stat.label}
          style={{
            borderRadius: 0,
            background: "#161616",
            padding: "1.5rem 2rem",
            borderRight: "1px solid #393939",
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              color: "#8d8d8d",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "0.5rem",
            }}
          >
            {stat.label}
          </p>
          {stat.value === null ? (
            <div style={{ width: "3rem", marginBottom: "0.4rem" }}>
              <SkeletonText />
            </div>
          ) : (
            <p
              style={{
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "#f4f4f4",
                lineHeight: 1.1,
                marginBottom: "0.25rem",
              }}
            >
              {stat.value}
            </p>
          )}
          <p style={{ fontSize: "0.75rem", color: "#6f6f6f" }}>{stat.subtext}</p>
        </Tile>
      ))}
    </div>
  );
}
