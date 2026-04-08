/**
 * Referral id for `depositAssetWithReferral` (Solidity `string`).
 * Set in `.env.local`: NEXT_PUBLIC_REFERRAL_ID=0x...
 */
export const DEPOSIT_REFERRAL_ID =
  process.env.NEXT_PUBLIC_REFERRAL_ID?.trim() ?? "";

/**
 * Midas deposit vault expects `bytes32` referral id.
 * Fallback to zero-bytes32 when env var is empty/invalid.
 */
export const MIDAS_DEPOSIT_REFERRAL_ID: `0x${string}` =
  /^0x[0-9a-fA-F]{64}$/.test(DEPOSIT_REFERRAL_ID)
    ? (DEPOSIT_REFERRAL_ID as `0x${string}`)
    : ("0x0000000000000000000000000000000000000000000000000000000000000000" as const);
