/**
 * Referral id for `depositAssetWithReferral` (Solidity `string`).
 * Set in `.env.local`: NEXT_PUBLIC_REFERRAL_ID=0x...
 */
export const DEPOSIT_REFERRAL_ID =
  process.env.NEXT_PUBLIC_REFERRAL_ID?.trim() ?? "";
