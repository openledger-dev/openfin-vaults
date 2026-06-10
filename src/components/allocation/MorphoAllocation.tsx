"use client";

/**
 * MorphoAllocation
 *
 * Displays the current strategy allocation for a Morpho V2 vault.
 * Data is fetched from /api/morpho/allocation?address={vault}&chainId={chainId}.
 *
 * Adapter types handled (per Morpho docs):
 *   MorphoMarketV1Adapter — expanded to per-market rows using supplyAssetsUsd.
 *   MetaMorphoAdapter     — one row per adapter using assetsUsd.
 *   MorphoVaultV2Adapter  — one row per adapter using assetsUsd.
 *   Idle                  — one row for idleAssetsUsd.
 *
 * Important: adapter.assetsUsd is NOT counted for MorphoMarketV1Adapter rows
 * to avoid double-counting (docs: use position.state.supplyAssetsUsd instead).
 */

import type { MorphoV2Allocation, MorphoAllocationItem } from "@/lib/morphoApi";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUsd(value: number): string {
  if (!isFinite(value) || value === 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function pctOf(part: number, total: number): number {
  if (!total || !isFinite(total)) return 0;
  return Math.min(Math.max((part / total) * 100, 0), 100);
}

// ── Type badge config ─────────────────────────────────────────────────────────

const TYPE_META: Record<
  MorphoAllocationItem["type"],
  { label: string; barClass: string; badgeClass: string }
> = {
  market: {
    label:      "Market",
    barClass:   "bg-blue-500",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  meta_vault: {
    label:      "MetaMorpho",
    barClass:   "bg-violet-500",
    badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  inner_vault: {
    label:      "Vault",
    barClass:   "bg-indigo-500",
    badgeClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  },
  idle: {
    label:      "Idle",
    barClass:   "bg-zinc-400",
    badgeClass: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function AllocationSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading allocation">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-14 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
            <div className="h-3.5 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          </div>
          <div className="h-2 w-full animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
        </div>
      ))}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function AllocationRow({
  item,
  totalAssetsUsd,
}: {
  item: MorphoAllocationItem;
  totalAssetsUsd: number;
}) {
  const meta = TYPE_META[item.type];
  const pct  = pctOf(item.assetsUsd, totalAssetsUsd);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide ${meta.badgeClass}`}
          >
            {meta.label}
          </span>
          <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {item.name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-right">
          <span className="text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
            {pct.toFixed(2)}%
          </span>
          <span className="w-20 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {fmtUsd(item.assetsUsd)}
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${meta.barClass}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${item.name}: ${pct.toFixed(2)}%`}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MorphoAllocationProps {
  data: MorphoV2Allocation | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function MorphoAllocation({
  data,
  isLoading,
  isError,
}: MorphoAllocationProps) {
  // Sort descending by USD value
  const sorted: MorphoAllocationItem[] = data
    ? [...data.items].sort((a, b) => b.assetsUsd - a.assetsUsd)
    : [];

  return (
    <section className="rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-6 shadow-sm dark:border-[#1b1b1f] dark:bg-[#141417]">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span
            className="mt-1.5 h-6 w-1 shrink-0 rounded-full bg-zinc-900 dark:bg-zinc-100"
            aria-hidden
          />
          <h2 className="text-[1.55rem] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Allocation
          </h2>
        </div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-900/25 dark:text-blue-300">
          Morpho V2
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <AllocationSkeleton />
      ) : isError ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Allocation data unavailable.
        </p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No allocation data reported.
        </p>
      ) : (
        <>
          <div className="space-y-3.5">
            {sorted.map((item, i) => (
              <AllocationRow
                key={`${item.type}-${item.name}-${i}`}
                item={item}
                totalAssetsUsd={data!.totalAssetsUsd}
              />
            ))}
          </div>

          {/* Summary footer */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <div className="flex flex-wrap gap-3">
              {(["market", "meta_vault", "inner_vault", "idle"] as const)
                .filter((t) => sorted.some((i) => i.type === t))
                .map((t) => (
                  <span key={t} className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className={`inline-block h-2 w-2 rounded-full ${TYPE_META[t].barClass}`} />
                    {TYPE_META[t].label}
                  </span>
                ))}
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Total:{" "}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {fmtUsd(data!.totalAssetsUsd)}
              </span>
            </span>
          </div>
        </>
      )}
    </section>
  );
}
