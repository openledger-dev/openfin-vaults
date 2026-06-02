# OpenVault

A multi-platform DeFi vault dashboard built with Next.js, supporting UltraYield, Morpho, and Midas vaults.

## Requirements

- Node.js 24+
- pnpm 11+
- Redis (local or remote — see `.env.local.example`)

## Local Development

```bash
# Install dependencies
pnpm install

# Copy and configure environment variables
cp .env.local.example .env.local
# Edit .env.local with your RPC URLs, vault addresses, etc.

# Start the development server (port 3032)
pnpm dev
```

Open [http://localhost:3032](http://localhost:3032) in your browser.

## Production Build (Docker)

The recommended way to run in production is via Docker Compose, which bundles the Next.js app and Redis together.

```bash
# 1. Create your environment file
cp .env.local.example .env.compose
# Edit .env.compose — fill in NEXT_PUBLIC_REOWN_PROJECT_ID, RPC_URL_1, vault addresses, etc.

# 2. Build and start
docker compose --env-file .env.compose up --build

# 3. Open http://localhost:3032
```

> **Note:** `NEXT_PUBLIC_*` variables are baked into the JS bundle at build time.
> Rebuild with `--build` whenever they change.

To stop and remove containers:

```bash
docker compose down          # keep Redis data
docker compose down -v       # also wipe Redis volume
```

## Production Build (Manual)

```bash
pnpm install
pnpm build
pnpm start   # listens on port 3032
```

Runtime environment variables (`REDIS_URL`, `RPC_URL_*`, etc.) must be set before starting the server.

## Security

Run `pnpm audit` to check for vulnerabilities. The `pnpm-workspace.yaml` contains dependency overrides to keep transitive deps patched.

## Environment Variables

See `.env.local.example` for the full reference — vault addresses, Redis URL, RPC endpoints, API keys, and cache TTL overrides.
