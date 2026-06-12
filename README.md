# OpenFin

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
# First-time only: create a multi-platform builder
docker buildx create --name multibuilder --use && docker buildx inspect --bootstrap

# Build for linux/amd64 and push to Docker Hub in one step
./scripts/build-push.sh v1.0.0
```

The script reads all `NEXT_PUBLIC_*` vars from `.env.compose` automatically and targets `linux/amd64` (required when building on Apple Silicon for a Linux server).

> **Note:** plain `docker compose build` / `docker compose push` produces an ARM64 image on Apple Silicon which will fail with `exec format error` on AMD64 servers. Always use `./scripts/build-push.sh` to push production images.


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


```
APP_IMAGE=openledgerhub/openfin-vault:v1.0.0 \
REDIS_PASSWORD=0fcf9a47f2d07c4e \
RPC_URL_1=https://mainnet.infura.io/v3/2dcbe335114c4927a5cd5ab9c1fc7490 \
RPC_URL_8453=https://base-mainnet.infura.io/v3/2dcbe335114c4927a5cd5ab9c1fc7490 \
docker compose -f compose.prod.yaml up -d
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
