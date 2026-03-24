/**
 * ABI fragments verified against UltraYield contract source:
 *  - UltraVault.sol
 *  - BaseControlledAsyncRedeem.sol
 *  - IUltraVault.sol (Fees struct)
 *  - IRedeemQueue.sol (PendingRedeem / ClaimableRedeem structs)
 */

// ── Read ABI (multicall-safe view functions) ─────────────────────────────────

export const VAULT_READ_ABI = [
  // ERC-20
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  // ERC-4626
  {
    name: "asset",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "totalAssets",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  // IPausable
  {
    name: "paused",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  /**
   * IUltraVault.getFees()
   * Returns the full Fees struct (verified against IUltraVault.sol):
   *   struct Fees {
   *     uint64 performanceFee;      // 100% = 1e18
   *     uint64 managementFee;       // 100% = 1e18
   *     uint64 withdrawalFee;       // 100% = 1e18
   *     uint64 lastUpdateTimestamp;
   *     uint256 highwaterMark;
   *   }
   */
  {
    name: "getFees",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "performanceFee", type: "uint64" },
          { name: "managementFee", type: "uint64" },
          { name: "withdrawalFee", type: "uint64" },
          { name: "lastUpdateTimestamp", type: "uint64" },
          { name: "highwaterMark", type: "uint256" },
        ],
      },
    ],
  },
  /**
   * BaseControlledAsyncRedeem.previewDepositForAsset(address, uint256)
   * Returns 0 if vault is paused.
   */
  {
    name: "previewDepositForAsset",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "asset", type: "address" },
      { name: "assets", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  /**
   * BaseControlledAsyncRedeem.getPendingRedeemForAsset(address, address)
   * struct PendingRedeem { uint256 shares; uint256 requestTime; }
   */
  {
    name: "getPendingRedeemForAsset",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "asset", type: "address" },
      { name: "controller", type: "address" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "shares", type: "uint256" },
          { name: "requestTime", type: "uint256" },
        ],
      },
    ],
  },
  /**
   * BaseControlledAsyncRedeem.getClaimableRedeemForAsset(address, address)
   * struct ClaimableRedeem { uint256 assets; uint256 shares; }
   */
  {
    name: "getClaimableRedeemForAsset",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "asset", type: "address" },
      { name: "controller", type: "address" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "assets", type: "uint256" },
          { name: "shares", type: "uint256" },
        ],
      },
    ],
  },
  // ── UltraVault-specific getters ──────────────────────────────────────────
  /** UltraVault.fundsHolder() — address that holds deposited capital */
  {
    name: "fundsHolder",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  /** UltraVault.oracle() — IPriceSource contract address */
  {
    name: "oracle",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  /** UltraVault.feeRecipient() */
  {
    name: "feeRecipient",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  /** BaseControlledAsyncRedeem.rateProvider() — IUltraVaultRateProvider */
  {
    name: "rateProvider",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

// ── Write ABI (state-changing functions) ─────────────────────────────────────

export const VAULT_WRITE_ABI = [
  /**
   * BaseControlledAsyncRedeem.depositAsset(address asset, uint256 assets, address receiver)
   * Requires: ERC-20 approve(vaultAddress, assets) on the asset token first.
   * Reverts if paused.
   */
  {
    name: "depositAsset",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  /**
   * BaseControlledAsyncRedeem.depositAssetWithReferral(address, uint256, address, string)
   * Same as depositAsset plus referral tracking (Referral event).
   */
  {
    name: "depositAssetWithReferral",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "referralId", type: "string" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  /**
   * BaseControlledAsyncRedeem.requestRedeemOfAsset(address, uint256, address, address)
   * Step 1 of async redeem. Requires: vault.approve(vaultAddress, shareAmount) first
   * (vault spends its own shares from owner via _spendAllowance).
   * Asset must be supported by the rateProvider.
   */
  {
    name: "requestRedeemOfAsset",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "shares", type: "uint256" },
      { name: "controller", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "requestId", type: "uint256" }],
  },
  /**
   * BaseControlledAsyncRedeem.redeemAsset(address, uint256, address, address)
   * Step 2 of async redeem — claim after operator fulfillment (≤72h).
   */
  {
    name: "redeemAsset",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "controller", type: "address" },
    ],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  /**
   * BaseControlledAsyncRedeem.cancelRedeemRequestOfAsset(address, address, address)
   * Cancel a pending redeem request before operator fulfillment.
   */
  {
    name: "cancelRedeemRequestOfAsset",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "controller", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;

// ── ERC-20 ABI (asset token reads + writes) ───────────────────────────────────

export const ERC20_ABI = [
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
