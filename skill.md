# UltraYield Vaults — Complete Frontend Integration Skill

Source: [UltraYield Contracts Repository](https://github.com/UltraYield/contracts)

---

## Table of Contents

1. [Protocol Overview](#1-protocol-overview)
2. [Standards & Compatibility](#2-standards--compatibility)
3. [Contract Architecture](#3-contract-architecture)
4. [Vault Economics & Fee Model](#4-vault-economics--fee-model)
5. [Oracle & Rate Provider System](#5-oracle--rate-provider-system)
6. [Roles & Permissions](#6-roles--permissions)
7. [Vault Lifecycle Flows](#7-vault-lifecycle-flows)
8. [Frontend Integration Patterns](#8-frontend-integration-patterns)
9. [React Query Integration](#9-react-query-integration)
10. [Vault Listing — No On-Chain Registry](#10-vault-listing--no-on-chain-registry)

---

## 1. Protocol Overview

UltraYield vaults give users access to yield-generating strategies across DeFi and CeFi. Users
deposit supported assets and receive vault **shares**. Strategy capital is managed operationally
by designated **curators** using MPC wallets with strict whitelisting rules.

### Custody model

- On deposit, funds transfer to a `fundsHolder` address jointly controlled by curator and
  infrastructure provider.
- Funds may be re-allocated across wallets or chains as strategy requires.
- MPC wallet enforces: which protocols can be accessed, which contracts can be called, and which
  addresses can receive transfers.

### Pricing model

- Yield and NAV are calculated **off-chain** by vault operators/curators.
- Pricing data is published on-chain to a configured **oracle** address.
- Oracle ownership is separate and mutually agreed between curator and infrastructure provider.
- Conservative estimates ensure fulfilled redemptions remain fully payable.

### Async redemption requirement

Capital is strategy-managed and does not sit idle in the vault, so immediate withdrawal is
impossible. The async redeem lifecycle is:

1. User submits a redeem request (shares move to vault escrow).
2. Operators prepare liquidity.
3. Operator fulfills request(s) → moves to claimable state.
4. User calls `redeem` or `withdraw` to claim assets.

> Fulfillment is expected within **72 hours** per vault specification.

Users continue participating in vault performance (yield or drawdown) after requesting a redeem
**until fulfillment**. Final exit amount is fixed at fulfillment time.

---

## 2. Standards & Compatibility

| Standard | Description |
|---|---|
| **ERC-4626** | Tokenized Vault standard — `deposit`, `mint`, `redeem`, `withdraw`, `convertToShares`, `convertToAssets`, `totalAssets` |
| **ERC-7540** | Async redeems (deposits remain synchronous) |
| **ERC-7575** | Multi-Asset Vault — supports multiple deposit/redeem assets |
| **ERC-165** | Standard Interface Detection |
| **ERC-20** | Vault shares are standard ERC-20 tokens |

---

## 3. Contract Architecture

### Inheritance hierarchy

```
UltraVault
  └── BaseControlledAsyncRedeem
        ├── ERC4626 → ERC20
        ├── AccessControl
        ├── Pausable
        ├── RedeemQueue
        └── TimelockedUUPS → UUPSUpgradeable
```

### Responsibility split

**`BaseControlledAsyncRedeem`** provides:
- ERC-4626-compatible deposit/mint interfaces
- Async redeem request / fulfillment / claim accounting
- Multi-asset deposit and withdrawal support
- Role-based access control
- Pause controls
- Upgrade management (timelocked UUPS)

**`UltraVault`** adds:
- Forwarding deposited assets to `fundsHolder` on deposit
- Oracle-driven `totalAssets` (based on published share price)
- Fee configuration and collection (performance / management / withdrawal)

### Storage

Both contracts use explicit **ERC-7201-style storage slots** for upgrade safety and clear
storage ownership per module.

### Hooks

| Hook | Triggered by | Used for |
|---|---|---|
| `beforeDeposit` / `afterDeposit` | deposit/mint | `afterDeposit` transfers assets to `fundsHolder` |
| `beforeWithdraw` / `afterWithdraw` | redeem/withdraw | — |
| `beforeRequestRedeem` | request redeem | — |
| `beforeFulfillRedeem` / `afterFulfillRedeem` | operator fulfillment | `beforeFulfillRedeem` transfers assets in from `fundsHolder` |

### Async redeem data model (per controller + asset)

| State | Description |
|---|---|
| **Pending** | Requested, shares escrowed in vault, not yet settled |
| **Claimable** | Settled by operator, available for claim |

### Core contract functions (all on-chain)

| Function | Type | Description |
|---|---|---|
| `deposit(assets, receiver)` | Write | Deposit base asset, receive shares |
| `mint(shares, receiver)` | Write | Mint exact shares |
| `depositAsset(tokenIn, assetAmount, receiver)` | Write | Deposit a supported non-base asset |
| `depositAssetWithReferral(tokenIn, assetAmount, receiver, referralId)` | Write | Deposit with referral tracking |
| `requestRedeem(shares, receiver, controller)` | Write | Request redeem (base asset out) |
| `requestRedeemOfAsset(tokenOut, shares, receiver, controller)` | Write | Request redeem (specific asset out) |
| `cancelRedeemRequest(...)` | Write | Cancel pending redeem (partial or full) |
| `cancelRedeemRequestOfAsset(tokenOut, receiver, controller)` | Write | Cancel pending redeem for specific asset |
| `redeem(shares, receiver, controller)` | Write | Claim claimable redeem |
| `redeemAsset(tokenOut, shares, receiver, controller)` | Write | Claim claimable redeem for specific asset |
| `withdraw(assets, receiver, controller)` | Write | Claim exact asset amount |
| `withdrawAsset(tokenOut, assets, receiver, controller)` | Write | Claim exact amount of specific asset |
| `fulfillRedeem(...)` | Write (OPERATOR) | Fulfill single pending redeem |
| `fulfillMultipleRedeems(...)` | Write (OPERATOR) | Fulfill batch of pending redeems |
| `collectFees()` | Write (Admin) | Manually trigger fee collection |
| `convertToShares(assets)` | Read | ERC-4626 share conversion |
| `convertToAssets(shares)` | Read | ERC-4626 asset conversion |
| `totalAssets()` | Read | Oracle-driven TVL (totalSupply × sharePrice) |
| `totalSupply()` | Read | Total vault shares in circulation |
| `balanceOf(address)` | Read | User share balance |
| `paused()` | Read | Whether vault is paused |
| `getPendingRedeemForAsset(asset, controller)` | Read | User's pending redeem amount |
| `getClaimableRedeemForAsset(asset, controller)` | Read | User's claimable redeem amount |
| `setOperator(operator, approved)` | Write (User) | Delegate redeem operations to operator |

---

## 4. Vault Economics & Fee Model

### Economic primitives

| Term | Description |
|---|---|
| **Base Asset** | Base accounting token (`asset()`) |
| **Asset** | Any supported deposit/withdrawal token (including base) |
| **Shares** | ERC-20 vault ownership units |
| **Share value** | Assets per 1 share — sourced through oracle valuation |

### Share pricing

- `totalAssets()` = oracle quote of total shares in base asset units
- Share pricing published on-chain after off-chain calculations
- Standard ERC-4626 conversions:
  - `convertToAssets(shares)` → base asset amount
  - `convertToShares(assets)` → share amount

### Fee types

| Fee | Basis | Charged in | Max Rate |
|---|---|---|---|
| **Performance fee** | Share value above high-water mark | Shares (minted to `feeRecipient`) | 30% |
| **Management fee** | Time-based, annualized, linear | Shares (minted to `feeRecipient`) | 5% |
| **Withdrawal fee** | Applied during redeem fulfillment | Output asset units | 1% |

### Fee collection triggers

Fees are crystallized by `_collectFees()` which mints shares to `feeRecipient`. Collection
is triggered automatically on:
- `deposit` / `mint`
- Redeem fulfillment
- Fee config update
- Manual `collectFees()` call

### Performance fee mechanics

```
if (currentShareValue > highwaterMark):
    fee accrues on the gain portion continuously
    on collection: highwaterMark updates to currentShareValue
else:
    no performance fee accrues
```

### Management fee mechanics

```
managementFee ∝ totalAssets × elapsedSeconds / ONE_YEAR × feeRate
```

More TVL and more time elapsed = more management fee.

---

## 5. Oracle & Rate Provider System

There are **two independent pricing layers**:

### Layer 1 — Vault Valuation (`UltraVaultOracle`)

Controls share value and `totalAssets` pricing.

| Function | Description |
|---|---|
| `setPrice(price)` | Instant price update |
| `scheduleLinearPriceUpdate(targetPrice, vestingPeriod)` | Gradual linear update (default path) |
| `getQuote(inAmount, base, quote)` | Compute quote using current (possibly vesting) price |

`UltraVault.totalAssets()` calls:
```
oracle.getQuote(inAmount = totalSupply(), base = shareToken, quote = vaultAsset)
```

### `VaultPriceManager`

Operational controller that updates oracle prices with safety guardrails:
- Per-vault `jump` limit (max update-to-update move)
- Per-vault `drawdown` limit (max fall from high-water mark)
- If update breaches limits → manager attempts to **pause the vault**

### Price update policy

- **Linear vesting updates** are the default (smoother UX)
- **Instant updates** reserved mainly for drawdown handling (fast downside reflection)

### Layer 2 — Asset Conversion (`UltraVaultRateProvider`)

Maps each supported asset to either:
- **Pegged conversion** (decimals normalization only)
- **External `IRateProvider` contract** (for price-based conversion)

Used by:
- `_convertToUnderlying(asset, assets)` — convert deposit asset → base accounting units
- `_convertFromUnderlying(asset, baseAssets)` — convert base units → redeem asset

### Operational flow

```
1. User deposits/redeems in supported asset
2. RateProvider converts asset ↔ base accounting units
3. Oracle provides share price for totalAssets
4. PriceManager enforces movement limits, pauses on suspicious moves
```

---

## 6. Roles & Permissions

### Role identifiers

| Role | Identifier | Responsibilities |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `0x00` | Fee updates, fee recipient, propose/accept oracle/rateProvider/fundsHolder changes |
| `OPERATOR_ROLE` | `0x9766...` | Fulfill pending redeems (single or batch) |
| `PAUSER_ROLE` | `0x65d7...` | Pause / unpause vault operations |
| `UPGRADER_ROLE` | `0x189a...` | Execute timelocked upgrade actions |

### User-level delegation

```ts
// Controller delegates to an operator address
vault.setOperator(operatorAddress, true);
```

Authorized operators can act for the controller in:
- `requestRedeem` / `requestRedeemOfAsset`
- `cancelRedeemRequest` / `cancelRedeemRequestOfAsset`
- `redeem` / `redeemAsset` / `withdraw` / `withdrawAsset`

### Critical address update procedure (timelock)

1. Admin proposes new address (`proposeOracle`, `proposeRateProvider`, `proposeFundsHolder`)
2. Wait timelock period
3. Accept within allowed window (`acceptOracle`, etc.)
4. Vault **automatically pauses** on accept
5. Operators verify setup
6. Admin/Pauser unpauses when ready

---

## 7. Vault Lifecycle Flows

### Flow 1 — Deposit

```
User → depositAsset(tokenIn, amount, receiver)
     → vault previews shares from input assets
     → vault transfers tokens from user
     → vault mints shares to receiver
     → afterDeposit hook: transfers tokens to fundsHolder
```

### Flow 2 — Redeem Request

```
User → requestRedeemOfAsset(tokenOut, shareAmount, receiver, controller)
     → shares moved from owner to vault (escrowed)
     → pending redeem accounting increases for (controller, asset)
     → request remains pending until operator fulfillment
     → user can cancel at any time before fulfillment
```

### Flow 3 — Operator Fulfillment

```
Operator (OPERATOR_ROLE) → fulfillRedeem / fulfillMultipleRedeems
     → beforeFulfillRedeem: assets transferred from fundsHolder to vault
     → pending shares converted to claimable asset amounts
     → pending redeem consumed
     → claimable redeem increased
     → escrowed shares burned
```

> Expected fulfillment window: **≤ 72 hours**

### Flow 4 — Claim (User Exit)

```
User → redeemAsset(tokenOut, shareAmount, receiver, controller)
     OR withdrawAsset(tokenOut, assetAmount, receiver, controller)
     → consumes claimable balance
     → transfers assets from vault to receiver
```

### Flow 5 — Cancel Redeem

```
User → cancelRedeemRequestOfAsset(tokenOut, receiver, controller)
     → pending shares returned to receiver
     → pending redeem accounting decreases
```

### Paused state behavior

| Operation | Paused behavior |
|---|---|
| `deposit` / `mint` | **Blocked** |
| `previewDeposit` / `previewMint` | Returns `0` |
| `redeem` / `withdraw` (claimable) | **Still works** (user exit preserved) |

---

## 8. Frontend Integration Patterns

All write transactions follow the **simulate → write** pattern using wagmi + viem.

```ts
import { useWriteContract } from 'wagmi';
import { simulateContract } from 'viem/actions';

const { data: hash, writeContract } = useWriteContract();

// Pattern:
const { request } = await simulateContract(config, { abi, address, functionName, args });
await writeContract(request);
```

### 8.1 Price Conversion (read-only)

```ts
// Shares for a given asset amount
async getAssetValueInShares({ tokenIn, assetAmount }: {
  tokenIn: Address;
  assetAmount: bigint;
}): Promise<bigint> {
  const result = await publicClient.readContract({
    abi: UltraVaultAbi,
    address: vault.deposits.address,
    functionName: 'convertToShares',
    args: [assetAmount],
  });
  // returns shares per 1 unit of asset (scaled by parseEther('1'))
  return ((result as bigint) * parseEther('1')) / assetAmount;
}

// Assets for a given share amount
async getShareValueInAssets({ tokenOut, shareAmount }: {
  tokenOut: Address;
  shareAmount: bigint;
}): Promise<bigint> {
  const result = await publicClient.readContract({
    abi: UltraVaultAbi,
    address: vault.withdrawals.address,
    functionName: 'convertToAssets',
    args: [shareAmount],
  });
  return result as bigint;
}
```

### 8.2 Deposit

```ts
// Standard deposit (simulate → write)
async prepareDeposit({ tokenIn, assetAmount, receiver }: {
  tokenIn: Address;
  assetAmount: bigint;
  receiver: Address;
}): Promise<SimulateContractReturnType> {
  return simulateContract(config, {
    abi: UltraVaultAbi,
    address: vault.deposits.address,
    functionName: 'depositAsset',
    args: [tokenIn, assetAmount, receiver],
  });
}

// Deposit with referral (use ULTRAYIELD_REFERRAL_ID constant)
async prepareDepositWithReferral({ tokenIn, assetAmount, receiver }: {
  tokenIn: Address;
  assetAmount: bigint;
  receiver: Address;
}): Promise<SimulateContractReturnType> {
  return simulateContract(config, {
    abi: UltraVaultAbi,
    address: vault.deposits.address,
    functionName: 'depositAssetWithReferral',
    args: [tokenIn, assetAmount, receiver, ULTRAYIELD_REFERRAL_ID],
  });
}
```

### 8.3 Redeem — Two-Step Flow

#### Step 1: Request Redeem

```ts
async prepareRequestRedeem({ tokenOut, shareAmount, receiver }: {
  tokenOut: Address;
  shareAmount: bigint;
  receiver: Address;
}): Promise<SimulateContractReturnType> {
  return simulateContract(config, {
    abi: UltraVaultAbi,
    address: vault.withdrawals.address,
    functionName: 'requestRedeemOfAsset',
    args: [tokenOut, shareAmount, receiver, receiver],
  });
}
```

#### Step 2: Claim After Fulfillment (≤72h wait)

```ts
async prepareRedeem({ tokenOut, shareAmount, receiver }: {
  tokenOut: Address;
  shareAmount: bigint;
  receiver: Address;
}): Promise<SimulateContractReturnType> {
  return simulateContract(config, {
    abi: UltraVaultAbi,
    address: vault.withdrawals.address,
    functionName: 'redeemAsset',
    args: [tokenOut, shareAmount, receiver, receiver],
  });
}
```

#### Cancel Redeem Request

```ts
async prepareCancelWithdraw({ tokenOut, receiver }: {
  tokenOut: Address;
  shareAmount: bigint;  // not used in args but kept for UI
  receiver: Address;
}): Promise<SimulateContractReturnType> {
  return simulateContract(config, {
    abi: UltraVaultAbi,
    address: vault.address,
    functionName: 'cancelRedeemRequestOfAsset',
    args: [tokenOut, receiver, receiver],
  });
}
```

### 8.4 Pending Redeem Requests (read)

```ts
async getPendingRedeemRequests({
  chainId,
  redeemsAssetsAddresses,  // all asset addresses to check
  userAddress,
}: {
  chainId: ChainId;
  redeemsAssetsAddresses: Address[];
  userAddress: Address | undefined;
}): Promise<PendingRedeems>
// Contract call: getPendingRedeemForAsset(asset, controller)
// Returns: requests not yet fulfilled, still cancellable
```

### 8.5 Claimable Redeem Requests (read)

```ts
async getClaimableRedeemRequests({
  chainId,
  redeemsAssetsAddresses,
  userAddress,
}: {
  chainId: ChainId;
  redeemsAssetsAddresses: Address[];
  userAddress: Address | undefined;
}): Promise<ClaimableRedeems>
// Contract call: getClaimableRedeemForAsset(asset, controller)
// Returns: fulfilled requests ready for withdrawal
```

### 8.6 Vault Paused State (read)

```ts
async getIsPaused(): Promise<boolean> {
  const result = await publicClient.readContract({
    abi: UltraVaultAbi,
    address: vault.address,
    functionName: 'paused',
  });
  return result as boolean;
  // If true: disable deposit/redeem UI, show paused warning
}
```

### 8.7 Vault TVL (on-chain + API)

```
TVL = totalShares × sharePriceUSD
```

```ts
async getVaultTVL(): Promise<string> {
  // 1. Read totalSupply() from contract
  // 2. Fetch sharePriceUSD from fetchVaultSharePrices() API
  // 3. Return (totalSupply × sharePriceUSD).toString()
}
// Cached with React Query — 20 minute stale time
```

### 8.8 User TVL (on-chain + API)

```
userTVL = userShares × sharePriceUSD
```

```ts
async getUserTVL({ userAddress }: { userAddress: Address }): Promise<string> {
  // 1. Read balanceOf(userAddress) from contract
  // 2. Fetch sharePriceUSD from fetchVaultSharePrices() API
  // 3. Return (userShares × sharePriceUSD).toString()
}
```

### 8.9 Vault Allocation (API)

```ts
export const fetchVaultAllocation = async ({ id }: { id: VaultId }) => {
  return axiosInstance.get(`vaults/${id}/allocation`);
};
```

### 8.10 Vault Share Prices (API)

```ts
fetchVaultSharePrices(); // called by TVL and userTVL calculations
```

### 8.11 Global Pending Withdrawals (API)

```ts
getVaultPendingWithdrawals(
  slug: VaultId,
  recalculate?: boolean,
  skip_cache?: boolean
)
// Source: fetchVaultPendingWithdrawals()
// Used for: monitoring liquidity queue, operational dashboards
```

---

## 9. React Query Integration

```ts
import { queryOptions, useQuery } from '@tanstack/react-query';

// Vault allocation with 20-minute stale time
const vaultAllocationQuery = (id: VaultId) =>
  queryOptions({
    queryKey: [...vaultQueries.all(), 'allocation', id],
    queryFn: () => fetchVaultAllocation({ id }),
    staleTime: 20 * 60 * 1000,   // 20 minutes
  });

// TVL — also 20-minute stale time
const vaultTVLQuery = (id: VaultId) =>
  queryOptions({
    queryKey: [...vaultQueries.all(), 'tvl', id],
    queryFn: () => getVaultTVL(id),
    staleTime: 20 * 60 * 1000,
  });

// Pending redeems — shorter stale time for user-facing data
const pendingRedeemsQuery = (params: PendingRedeemsParams) =>
  queryOptions({
    queryKey: ['pendingRedeems', params],
    queryFn: () => getPendingRedeemRequests(params),
    staleTime: 30 * 1000,  // 30 seconds
  });
```

---

## 10. Vault Listing — No On-Chain Registry

> **There is no on-chain registry contract for listing all vaults.**

The skill and contracts repository contains no `getVaults()` registry function or factory
pattern. Each `UltraVault` is an independent upgradeable proxy.

Vault discovery is done through one of:

| Method | Description |
|---|---|
| **Off-chain API** | `axiosInstance.get('vaults')` — most likely given the existing API pattern used for allocation, share prices, and pending withdrawals |
| **Static config** | A hardcoded map of `VaultId → { address, deposits.address, withdrawals.address, asset, chainId }` |

### Vault config shape (inferred from contract usage)

```ts
type VaultConfig = {
  id: VaultId;              // slug used in API calls
  address: Address;         // main vault proxy address
  deposits: {
    address: Address;       // deposit-facing contract address
  };
  withdrawals: {
    address: Address;       // withdrawal-facing contract address
  } | null;                 // null if vault doesn't support withdrawals
  chainId: number;
  asset: Address;           // base asset address
  supportedAssets: Address[];
};
```

---

## Summary Table

| Feature | Source | Notes |
|---|---|---|
| Price conversion (shares ↔ assets) | On-chain | `convertToShares` / `convertToAssets` |
| Deposit | On-chain write | Sync, assets go to `fundsHolder` immediately |
| Redeem request | On-chain write | Async, shares escrowed |
| Redeem fulfillment | On-chain write (OPERATOR only) | ≤72h window |
| Redeem claim | On-chain write | After fulfillment |
| Cancel redeem | On-chain write | Before fulfillment only |
| Pending redeems | On-chain read | `getPendingRedeemForAsset` |
| Claimable redeems | On-chain read | `getClaimableRedeemForAsset` |
| Vault paused state | On-chain read | `paused()` |
| Vault TVL | On-chain + API | `totalSupply` × share price API |
| User TVL | On-chain + API | `balanceOf` × share price API |
| Vault allocation | API | `vaults/{id}/allocation` |
| Global withdrawal queue | API | `fetchVaultPendingWithdrawals` |
| Vault list | API (not on-chain) | No registry contract exists |
| Fee collection | On-chain (auto + manual) | Performance / Management / Withdrawal |
