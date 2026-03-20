export type VaultStatus = "active" | "paused" | "loading";

export interface Vault {
  /** Unique key (vault contract address) */
  id: string;
  address: `0x${string}`;
  /** Platform identifier, e.g. "ultrayield" */
  platform: string;
  /** Human-readable platform label, e.g. "UltraYield Vaults" */
  platformLabel: string;
  /** Vault share token name */
  name: string;
  /** Vault share token symbol */
  symbol: string;
  /** Underlying ERC-20 asset contract address */
  assetAddress: `0x${string}` | undefined;
  /** Underlying asset symbol, e.g. "USDC" */
  assetSymbol: string;
  /** Underlying asset decimals */
  assetDecimals: number;
  /** Formatted TVL string, e.g. "12.50M USDC" */
  tvlFormatted: string;
  /** Raw totalAssets (unscaled bigint) */
  totalAssets: bigint | undefined;
  /** Performance fee percent (0–100 scale). Fees.performanceFee / 1e16 */
  performanceFeePercent: number | undefined;
  /** Management fee percent (0–100 scale). Fees.managementFee / 1e16 */
  managementFeePercent: number | undefined;
  /** Withdrawal fee percent (0–100 scale). Fees.withdrawalFee / 1e16 */
  withdrawalFeePercent: number | undefined;
  status: VaultStatus;
  contractAddress: `0x${string}`;
  /** Optional: enriched from off-chain price feed */
  supplyApy?: number;
  rewardApy?: number;
  totalApy?: number;
  tvlUsd?: number;
  utilization?: number;
  /** Optional: user position data */
  userDepositUsd?: number;
  userDepositAmount?: number;
  earnedUsd?: number;
}

export interface UserPortfolio {
  totalDepositedUsd: number;
  totalEarnedUsd: number;
  netApy: number;
  activeVaults: number;
}
