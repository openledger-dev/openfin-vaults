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

Two compose files are provided:

| File | Purpose |
|---|---|
| `compose.yaml` | Local testing — builds the image on the fly |
| `compose.prod.yaml` | Production — pulls a pre-built tagged image, Redis auth, resource limits, structured logging |

### Local testing

```bash
cp .env.local.example .env.compose
# Edit .env.compose with your values
docker compose --env-file .env.compose up --build
```

### Production deployment

**Step 1 — Build and push using `.env.compose`** (no `--build-arg` needed):

```bash
# Build the image — all NEXT_PUBLIC_* vars are read from .env.compose
APP_VERSION=v1.0.0 docker compose --env-file .env.compose build

# Push to Docker Hub (openledgerhub/openfin-vault:v1.0.0)
APP_VERSION=v1.0.0 docker compose --env-file .env.compose push
```

`APP_VERSION` controls the image tag. Omit it to tag as `latest`.


**Step 2 — Deploy on the server:**

```bash
# Create .env.prod with runtime secrets
APP_IMAGE=openledgerhub/openfin-vault:v1.0.0
REDIS_PASSWORD=<strong-random-password>
RPC_URL_1=https://eth-mainnet.g.alchemy.com/v2/<key>
RPC_URL_8453=https://base-mainnet.g.alchemy.com/v2/<key>
ONEINCH_API_KEY=...
ONECLICK_JWT_TOKEN=...

docker compose -f compose.prod.yaml --env-file .env.prod up -d
```

> **Note:** `NEXT_PUBLIC_*` variables are baked into the JS bundle at build time.
> Changing them requires a new image build and push.

To stop:

```bash
docker compose -f compose.prod.yaml down        # keep Redis data
docker compose -f compose.prod.yaml down -v     # also wipe Redis volume
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
