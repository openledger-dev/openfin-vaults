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
import type { PlatformKind } from "@/lib/vaultConfig";
import { getChainShortName } from "@/lib/chains";
import type { VaultOnChainData } from "@/hooks/useVaultData";
import { use7dApy } from "@/hooks/use7dApy";
import { useSupportedAssets } from "@/hooks/useSupportedAssets";
import type { Vault } from "@/types/vault";
import { VaultActionModal } from "./VaultActionModal";
import { MorphoVaultActionModal } from "./MorphoVaultActionModal";
import { MidasVaultActionModal } from "./MidasVaultActionModal";

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
    kind: v.kind,
    platform: v.platformId,
    platformLabel: v.platformLabel,
    chainId: v.chainId,
    name: v.name,
    symbol: v.symbol,
    assetAddress: v.assetAddress,
    assetSymbol: v.assetSymbol ?? "—",
    assetDecimals: decimals,
    tvlFormatted: formatBigIntAsset(v.totalAssets, decimals, v.assetSymbol),
    totalAssets: v.totalAssets,
    // Fees: 1e18 = 100%, so divide by 1e16 to get percentage
    performanceFeePercent:
      v.performanceFee !== undefined ? Number(v.performanceFee) / 1e16 : undefined,
    managementFeePercent:
      v.managementFee !== undefined ? Number(v.managementFee) / 1e16 : undefined,
    withdrawalFeePercent:
      v.withdrawalFee !== undefined ? Number(v.withdrawalFee) / 1e16 : undefined,
    status: v.isPaused ? "paused" : "active",
    contractAddress: v.address,
    depositVaultAddress: v.depositVaultAddress,
    redemptionVaultAddress: v.redemptionVaultAddress,
    midasApiKey: v.midasApiKey,
  };
}

// ── Table headers — differ by platform kind ───────────────────────────────────

const STANDARD_HEADERS = [
  { key: "vault",   header: "Vault"     },
  { key: "asset",   header: "Asset"     },
  { key: "tvl",     header: "TVL"       },
  { key: "apy",     header: "7D APY"    },
  { key: "perfFee", header: "Perf. Fee" },
  { key: "mgmtFee", header: "Mgmt. Fee" },
  { key: "status",  header: "Status"    },
  { key: "action",  header: ""          },
];

const MORPHO_HEADERS = [
  { key: "vault",     header: "Vault"       },
  { key: "asset",     header: "Asset"       },
  { key: "tvl",       header: "TVL"         },
  { key: "apy",       header: "7D Net APY"  },
  { key: "liquidity", header: "Liquidity"   },
  { key: "status",    header: "Status"      },
  { key: "action",    header: ""            },
];

const RE7_HEADERS = [
  { key: "vault",  header: "Vault"   },
  { key: "asset",  header: "Asset"   },
  { key: "tvl",    header: "TVL"     },
  { key: "apy",    header: "7D APY"  },
  { key: "status", header: "Status"  },
  { key: "action", header: ""        },
];

// ── APY cell ──────────────────────────────────────────────────────────────────
// Branches on vault kind:
//   ultrayield → event-log derived APY via use7dApy (needs its own component
//                so each row can call the hook without violating Rules of Hooks)
//   morpho / midas → pre-fetched APY from apyPrefetched (set by adapters)

function UltraYieldApyCell({ v }: { v: VaultOnChainData }) {
  const { apy, label, isLoading } = use7dApy(v.oracleAddress, v.address, v.assetAddress);

  if (isLoading) return <SkeletonText width="40px" />;
  if (apy === null) return <span style={{ color: "#6f6f6f", fontSize: "0.875rem" }}>—</span>;

  const color = apy >= 0 ? "#42be65" : "#ff832b";
  return (
    <span style={{ color, fontSize: "0.875rem", fontWeight: 600 }} title={label}>
      {apy >= 0 ? "+" : ""}{apy.toFixed(2)}%
    </span>
  );
}

function PrefetchedApyCell({ apy }: { apy: number | null }) {
  if (apy === null) return <span style={{ color: "#6f6f6f", fontSize: "0.875rem" }}>—</span>;
  const pct = apy * 100;
  const color = pct >= 0 ? "#42be65" : "#ff832b";
  return (
    <span style={{ color, fontSize: "0.875rem", fontWeight: 600 }}>
      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

function ApyCell({ v }: { v: VaultOnChainData }) {
  if (v.kind === "ultrayield") return <UltraYieldApyCell v={v} />;
  return <PrefetchedApyCell apy={v.apyPrefetched} />;
}

// ── Supported-assets cell — each row calls its own hook ───────────────────────

function SupportedAssetsCell({ v }: { v: VaultOnChainData }) {
  const { assets, isLoading } = useSupportedAssets(v.address);

  if (isLoading) return <SkeletonText width="60px" />;

  // Fallback: no rateProvider or empty result → show the single base asset
  if (assets.length === 0) {
    return (
      <span style={{ color: "#c6c6c6", fontSize: "0.875rem", fontWeight: 500 }}>
        {v.assetSymbol ?? "—"}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
      {assets.map((a) => (
        <Tag
          key={a.address}
          type={a.isPegged ? "cool-gray" : "blue"}
          size="sm"
          title={a.address}
        >
          {a.symbol}
        </Tag>
      ))}
    </div>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRows({ count, colCount }: { count: number; colCount: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={`skel-${i}`} style={{ background: "#161616", borderBottom: "1px solid #262626" }}>
          {Array.from({ length: colCount }).map((__, j) => (
            <TableCell key={j} style={{ padding: "0.875rem 1rem" }}>
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
  platformKind: PlatformKind;
  label: string;
  description: string;
  vaults: VaultOnChainData[];
  isLoading: boolean;
  searchQuery: string;
  onDeposit: (vault: Vault) => void;
  onView: (address: string) => void;
}

function PlatformSection({
  platformId,
  platformKind,
  label,
  description,
  vaults,
  isLoading,
  searchQuery,
  onDeposit,
  onView,
}: PlatformSectionProps) {
  const isMorpho = platformKind === "morpho";
  const isRe7 = platformId === "re7";
  const headers = isMorpho ? MORPHO_HEADERS : isRe7 ? RE7_HEADERS : STANDARD_HEADERS;

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

  const commonCells = (v: VaultOnChainData, vault: Vault) => ({
    id: v.address,
    vault: (
      <button type="button" onClick={() => onView(v.address)}
        style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
        <p style={{ color: "#4589ff", fontWeight: 600, fontSize: "0.875rem", lineHeight: 1.3, textDecoration: "underline", textDecorationColor: "transparent" }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "#4589ff")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
        >
          {v.name}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.15rem", flexWrap: "wrap" }}>
          <p style={{ color: "#6f6f6f", fontSize: "0.75rem", fontFamily: "monospace" }}>
            {v.address.slice(0, 6)}…{v.address.slice(-4)}
          </p>
          <span style={{
            fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.04em",
            padding: "0.1rem 0.4rem", borderRadius: "3px",
            background: "#262626", color: "#8d8d8d", border: "1px solid #393939",
            lineHeight: 1.5,
          }}>
            {getChainShortName(v.chainId)}
          </span>
        </div>
        {v.userShares !== undefined && v.userShares > BigInt(0) && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.3rem" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#42be65", flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: "0.7rem", color: "#42be65", fontWeight: 600 }}>
              {formatBigIntAsset(v.userAssetsRaw, v.assetDecimals ?? 18, v.assetSymbol)} invested
            </span>
          </div>
        )}
      </button>
    ),
    asset: <SupportedAssetsCell v={v} />,
    tvl: (
      <span style={{ color: "#c6c6c6", fontSize: "0.875rem" }}>
        {formatBigIntAsset(v.totalAssets, v.assetDecimals ?? 18, v.assetSymbol)}
      </span>
    ),
    apy: <ApyCell v={v} />,
    status: v.isPaused
      ? <Tag type="red"   size="sm">Paused</Tag>
      : <Tag type="green" size="sm">Active</Tag>,
    action: (
      <div style={{ display: "flex", gap: "0.25rem" }}>
        <Button kind="ghost" size="sm" onClick={() => onView(v.address)}
          style={{ color: "#c6c6c6", fontSize: "0.8rem" }}>View</Button>
        <Button kind="ghost" size="sm" onClick={() => onDeposit(vault)}
          style={{ color: "#4589ff", fontSize: "0.8rem" }}>Deposit →</Button>
      </div>
    ),
  });

  const tableRows = filtered.map((v) => {
    const vault = chainVaultToVault(v);
    if (isMorpho) {
      return {
        ...commonCells(v, vault),
        liquidity: (
          <span style={{ color: "#c6c6c6", fontSize: "0.875rem" }}>
            {formatBigIntAsset(v.liquidityRaw, v.assetDecimals ?? 18, v.assetSymbol)}
          </span>
        ),
      };
    }
    if (isRe7) {
      return {
        ...commonCells(v, vault),
      };
    }
    return {
      ...commonCells(v, vault),
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
    };
  });

  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#f4f4f4", margin: 0 }}>{label}</h2>
        <p style={{ color: "#6f6f6f", fontSize: "0.8rem", marginTop: "0.25rem" }}>{description}</p>
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
                        <TableHeader key={header.key} {...headerProps} style={headerStyle}>
                          {header.header}
                        </TableHeader>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  <SkeletonRows count={vaults.length || 3} colCount={headers.length} />
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
                    const rowVault = filtered.find((x) => x.address === row.id);
                    const hasPosition = rowVault?.userShares !== undefined && rowVault.userShares > BigInt(0);
                    return (
                      <TableRow key={row.id} {...rowProps}
                        style={{
                          background: hasPosition ? "#0d1e0d" : "#161616",
                          borderBottom: "1px solid #262626",
                          borderLeft: hasPosition ? "2px solid #42be65" : "2px solid transparent",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#1c1c1c"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = hasPosition ? "#0d1e0d" : "#161616"; }}
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
  const [txCompletedNotice, setTxCompletedNotice] = useState(false);

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
      {txCompletedNotice && (
        <InlineNotification
          kind="success"
          title="Transaction completed"
          subtitle="Vault data has been refreshed."
          onCloseButtonClick={() => setTxCompletedNotice(false)}
          style={{ marginBottom: "1rem" }}
        />
      )}

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
            platformKind={platform.kind}
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

      {/* Route to the correct modal based on vault kind */}
      {selectedVault?.kind === "morpho" ? (
        <MorphoVaultActionModal
          vault={selectedVault}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onTxCompleted={() => setTxCompletedNotice(true)}
        />
      ) : selectedVault?.kind === "midas" ? (
        <MidasVaultActionModal
          vault={selectedVault}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onTxCompleted={() => setTxCompletedNotice(true)}
        />
      ) : (
        <VaultActionModal
          vault={selectedVault}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onTxCompleted={() => setTxCompletedNotice(true)}
        />
      )}
    </>
  );
}
