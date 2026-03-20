"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Button,
  Search,
  SkeletonText,
  InlineNotification,
} from "@carbon/react";
import { VAULT_PLATFORMS } from "@/lib/vaultConfig";
import type { VaultOnChainData } from "@/hooks/useVaultData";
import { use7dApy } from "@/hooks/use7dApy";
import type { Vault } from "@/types/vault";
import { VaultActionModal } from "./VaultActionModal";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBigIntAsset(
  raw: bigint | undefined,
  decimals: number,
  symbol: string | undefined
): string {
  if (raw === undefined) return "—";
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 2);
  const num = parseFloat(`${whole}.${fracStr}`);
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B${symbol ? ` ${symbol}` : ""}`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M${symbol ? ` ${symbol}` : ""}`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K${symbol ? ` ${symbol}` : ""}`;
  return `${num.toFixed(2)}${symbol ? ` ${symbol}` : ""}`;
}

function feePercent(raw: bigint | undefined): string {
  if (raw === undefined) return "—";
  // 1e18 = 100%
  const pct = (Number(raw) / 1e16).toFixed(2);
  return `${pct}%`;
}

function chainVaultToVault(v: VaultOnChainData): Vault {
  const decimals = v.assetDecimals ?? 18;
  return {
    id: v.address,
    address: v.address,
    platform: v.platformId,
    platformLabel: v.platformLabel,
    name: v.name,
    symbol: v.symbol,
    assetAddress: v.assetAddress,
    assetSymbol: v.assetSymbol ?? "—",
    assetDecimals: decimals,
    tvlFormatted: formatBigIntAsset(v.totalAssets, decimals, v.assetSymbol),
    totalAssets: v.totalAssets,
    // Fees: 1e18 = 100%, so divide by 1e16 to get percentage (verified against IUltraVault.sol)
    performanceFeePercent:
      v.performanceFee !== undefined ? Number(v.performanceFee) / 1e16 : undefined,
    managementFeePercent:
      v.managementFee !== undefined ? Number(v.managementFee) / 1e16 : undefined,
    withdrawalFeePercent:
      v.withdrawalFee !== undefined ? Number(v.withdrawalFee) / 1e16 : undefined,
    status: v.isPaused ? "paused" : "active",
    contractAddress: v.address,
  };
}

// ── Table headers ─────────────────────────────────────────────────────────────

const headers = [
  { key: "vault", header: "Vault" },
  { key: "asset", header: "Asset" },
  { key: "tvl", header: "TVL" },
  { key: "apy", header: "7D APY" },
  { key: "perfFee", header: "Perf. Fee" },
  { key: "mgmtFee", header: "Mgmt. Fee" },
  { key: "status", header: "Status" },
  { key: "action", header: "" },
];

// ── APY cell — needs its own component so each row can call use7dApy ──────────

function ApyCell({ v }: { v: VaultOnChainData }) {
  const { apy, label, isLoading } = use7dApy(v.oracleAddress, v.address, v.assetAddress);

  if (isLoading) {
    return <SkeletonText width="40px" />;
  }
  if (apy === null) {
    return <span style={{ color: "#6f6f6f", fontSize: "0.875rem" }}>—</span>;
  }

  const color = apy >= 0 ? "#42be65" : "#ff832b";
  return (
    <span style={{ color, fontSize: "0.875rem", fontWeight: 600 }} title={label}>
      {apy >= 0 ? "+" : ""}{apy.toFixed(2)}%
    </span>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={`skel-${i}`} style={{ background: "#161616", borderBottom: "1px solid #262626" }}>
          {headers.map((h) => (
            <TableCell key={h.key} style={{ padding: "0.875rem 1rem" }}>
              <SkeletonText width="80%" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ── Single platform section ───────────────────────────────────────────────────

interface PlatformSectionProps {
  platformId: string;
  label: string;
  description: string;
  vaults: VaultOnChainData[];
  isLoading: boolean;
  searchQuery: string;
  onDeposit: (vault: Vault) => void;
  onView: (address: string) => void;
}

function PlatformSection({
  label,
  description,
  vaults,
  isLoading,
  searchQuery,
  onDeposit,
  onView,
}: PlatformSectionProps) {
  const filtered = useMemo(() => {
    if (!searchQuery) return vaults;
    const q = searchQuery.toLowerCase();
    return vaults.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.symbol.toLowerCase().includes(q) ||
        (v.assetSymbol ?? "").toLowerCase().includes(q)
    );
  }, [vaults, searchQuery]);

  const tableRows = filtered.map((v) => {
    const vault = chainVaultToVault(v);
    return {
      id: v.address,
      vault: (
        <button
          type="button"
          onClick={() => onView(v.address)}
          style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
        >
          <p style={{ color: "#4589ff", fontWeight: 600, fontSize: "0.875rem", lineHeight: 1.3, textDecoration: "underline", textDecorationColor: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "#4589ff")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
          >
            {v.name}
          </p>
          <p style={{ color: "#6f6f6f", fontSize: "0.75rem", fontFamily: "monospace" }}>
            {v.address.slice(0, 6)}…{v.address.slice(-4)}
          </p>
        </button>
      ),
      asset: (
        <span style={{ color: "#c6c6c6", fontSize: "0.875rem", fontWeight: 500 }}>
          {v.assetSymbol ?? "—"}
        </span>
      ),
      tvl: (
        <span style={{ color: "#c6c6c6", fontSize: "0.875rem" }}>
          {formatBigIntAsset(v.totalAssets, v.assetDecimals ?? 18, v.assetSymbol)}
        </span>
      ),
      apy: <ApyCell v={v} />,
      perfFee: (
        <span style={{ color: "#c6c6c6", fontSize: "0.875rem" }}>
          {feePercent(v.performanceFee)}
        </span>
      ),
      mgmtFee: (
        <span style={{ color: "#c6c6c6", fontSize: "0.875rem" }}>
          {feePercent(v.managementFee)}
        </span>
      ),
      status: v.isPaused ? (
        <Tag type="red" size="sm">Paused</Tag>
      ) : (
        <Tag type="green" size="sm">Active</Tag>
      ),
      action: (
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <Button kind="ghost" size="sm" onClick={() => onView(v.address)}
            style={{ color: "#c6c6c6", fontSize: "0.8rem" }}>
            View
          </Button>
          <Button kind="ghost" size="sm" onClick={() => onDeposit(vault)}
            style={{ color: "#4589ff", fontSize: "0.8rem" }}>
            Deposit →
          </Button>
        </div>
      ),
    };
  });

  return (
    <section style={{ marginBottom: "2.5rem" }}>
      {/* Section header */}
      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#f4f4f4", margin: 0 }}>
          {label}
        </h2>
        <p style={{ color: "#6f6f6f", fontSize: "0.8rem", marginTop: "0.25rem" }}>
          {description}
        </p>
      </div>

      {isLoading ? (
        <DataTable rows={[]} headers={headers}>
          {({ getTableProps, getHeaderProps }) => (
            <TableContainer>
              <Table {...getTableProps()} size="lg">
                <TableHead>
                  <TableRow>
                    {headers.map((header) => {
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const { key: _key, ...headerProps } = getHeaderProps({ header });
                      return (
                        <TableHeader
                          key={header.key}
                          {...headerProps}
                          style={headerStyle}
                        >
                          {header.header}
                        </TableHeader>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  <SkeletonRows count={vaults.length || 3} />
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      ) : filtered.length === 0 ? (
        <p style={{ color: "#6f6f6f", fontSize: "0.875rem", padding: "1.5rem 0" }}>
          No vaults match your search.
        </p>
      ) : (
        <DataTable rows={tableRows} headers={headers} isSortable={false}>
          {({ rows, headers: hdrs, getTableProps, getHeaderProps, getRowProps }) => (
            <TableContainer>
              <Table {...getTableProps()} size="lg">
                <TableHead>
                  <TableRow>
                    {hdrs.map((header) => {
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const { key: _key, ...headerProps } = getHeaderProps({ header });
                      return (
                        <TableHeader key={header.key} {...headerProps} style={headerStyle}>
                          {header.header}
                        </TableHeader>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { key: _key, ...rowProps } = getRowProps({ row });
                    return (
                      <TableRow
                        key={row.id}
                        {...rowProps}
                        style={{ background: "#161616", borderBottom: "1px solid #262626", cursor: "pointer" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#1c1c1c"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#161616"; }}
                      >
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id} style={{ padding: "0.875rem 1rem", verticalAlign: "middle" }}>
                            {cell.value}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}
    </section>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  background: "#1c1c1c",
  borderBottom: "1px solid #393939",
  color: "#8d8d8d",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

// ── Main export ───────────────────────────────────────────────────────────────

interface VaultsTableProps {
  vaults: VaultOnChainData[];
  isLoading: boolean;
}

export function VaultsTable({ vaults: allVaults, isLoading }: VaultsTableProps) {
  const router = useRouter();
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const activePlatforms = VAULT_PLATFORMS.filter((p) => p.vaults.length > 0);

  if (activePlatforms.length === 0) {
    return (
      <InlineNotification
        kind="info"
        title="No vaults configured"
        subtitle="Add vault addresses to NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR in your .env.local to get started."
        hideCloseButton
      />
    );
  }

  return (
    <>
      {/* Global search */}
      <div style={{ marginBottom: "1.5rem", maxWidth: "360px" }}>
        <Search
          id="vault-search"
          labelText="Search vaults"
          placeholder="Search by vault name, symbol…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="md"
        />
      </div>

      {/* One section per platform */}
      {activePlatforms.map((platform) => {
        const platformVaults = allVaults.filter(
          (v) => v.platformId === platform.id
        );
        return (
          <PlatformSection
            key={platform.id}
            platformId={platform.id}
            label={platform.label}
            description={platform.description}
            vaults={platformVaults}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onDeposit={(vault) => {
              setSelectedVault(vault);
              setModalOpen(true);
            }}
            onView={(address) => router.push(`/vaults/${address}`)}
          />
        );
      })}

      <VaultActionModal
        vault={selectedVault}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
