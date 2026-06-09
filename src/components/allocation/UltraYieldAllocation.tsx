"use client";

/**
 * UltraYieldAllocation
 *
 * Displays the current strategy/venue allocation breakdown for an UltraYield
 * vault. Data is fetched from /api/ultrayield/allocation?slug={slug}.
 *
 * Each row shows:
 *   • Venue name
 *   • Proportional fill bar
 *   • Percentage of NAV
 *   • USD notional value
 *
 * Platform-specific note:
 *   UltraYield vaults expose per-venue allocation via their REST API.
 *   Other platforms (Morpho, Midas/Re7) have their own allocation logic
 *   and should get their own sibling components in this folder.
 */

import type { UltraYieldAllocation, UltraYieldAllocationItem } from "@/lib/ultrayieldApi";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUsd(value: string): string {
  const n = parseFloat(value);
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(value: string): string {
  const n = parseFloat(value);
  return isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// Deterministic colour per venue name so colours stay stable across refreshes.
const BAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-orange-500",
];

function barColor(index: number): string {
  return BAR_COLORS[index % BAR_COLORS.length];
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function AllocationSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading allocation">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <div className="h-3.5 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-3.5 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
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
  colorClass,
}: {
  item: UltraYieldAllocationItem;
  colorClass: string;
}) {
  const pct = Math.min(Math.max(parseFloat(item.value_pct) || 0, 0), 100);

  return (
    <div className="group">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${colorClass}`}
            aria-hidden
          />
          <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {item.name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-right">
          <span className="text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
            {fmtPct(item.value_pct)}
          </span>
          <span className="w-20 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {fmtUsd(item.value_usd)}
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${item.name}: ${fmtPct(item.value_pct)}`}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface UltraYieldAllocationProps {
  data: UltraYieldAllocation | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function UltraYieldAllocation({
  data,
  isLoading,
  isError,
}: UltraYieldAllocationProps) {
  // Sort descending by allocation percentage so the largest positions appear first
  const sorted: UltraYieldAllocationItem[] = data
    ? [...data.allocation].sort(
        (a, b) => parseFloat(b.value_pct) - parseFloat(a.value_pct)
      )
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
        {data?.date && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            Snapshot: {fmtDate(data.date)}
          </span>
        )}
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
              <AllocationRow key={item.name} item={item} colorClass={barColor(i)} />
            ))}
          </div>

          {/* Summary: total USD */}
          {(() => {
            const totalUsd = sorted.reduce(
              (sum, item) => sum + (parseFloat(item.value_usd) || 0),
              0
            );
            return totalUsd > 0 ? (
              <div className="mt-4 flex justify-end border-t border-zinc-200 pt-3 dark:border-zinc-700">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Total deployed:{" "}
                  <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                    {fmtUsd(String(totalUsd))}
                  </span>
                </span>
              </div>
            ) : null;
          })()}
        </>
      )}
    </section>
  );
}
