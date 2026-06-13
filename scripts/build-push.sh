#!/usr/bin/env bash
# Build a linux/amd64 image from .env.compose and push to Docker Hub.
#
# Usage:
#   ./scripts/build-push.sh           # tags as "latest"
#   ./scripts/build-push.sh v1.2.0    # tags as v1.2.0 + latest

set -euo pipefail

REPO="openledgerhub/openfin-vault"
VERSION="${1:-latest}"
ENV_FILE="${ENV_FILE:-.env.compose}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.local.example and fill in your values." >&2
  exit 1
fi

# Load build-time vars from the env file (skip comments and blank lines)
load_arg() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-
}

TAGS="-t ${REPO}:${VERSION}"
if [ "$VERSION" != "latest" ]; then
  TAGS="$TAGS -t ${REPO}:latest"
fi

echo "▶ Building ${REPO}:${VERSION} for linux/amd64 from ${ENV_FILE} ..."

docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_REOWN_PROJECT_ID="$(load_arg NEXT_PUBLIC_REOWN_PROJECT_ID)" \
  --build-arg NEXT_PUBLIC_APP_URL="$(load_arg NEXT_PUBLIC_APP_URL)" \
  --build-arg NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR="$(load_arg NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR)" \
  --build-arg NEXT_PUBLIC_ULTRAYIELD_CHAIN_ID="$(load_arg NEXT_PUBLIC_ULTRAYIELD_CHAIN_ID)" \
  --build-arg NEXT_PUBLIC_MORPHO_VAULT_ADDR="$(load_arg NEXT_PUBLIC_MORPHO_VAULT_ADDR)" \
  --build-arg NEXT_PUBLIC_MIDAS_VAULT_ADDR="$(load_arg NEXT_PUBLIC_MIDAS_VAULT_ADDR)" \
  --build-arg NEXT_PUBLIC_MIDAS_CHAIN_ID="$(load_arg NEXT_PUBLIC_MIDAS_CHAIN_ID)" \
  --build-arg NEXT_PUBLIC_SWAP_MIN_USD="$(load_arg NEXT_PUBLIC_SWAP_MIN_USD)" \
  --build-arg SHOW_ALLOCATION="$(load_arg SHOW_ALLOCATION)" \
  --build-arg CSP_REPORT_ONLY="$(load_arg CSP_REPORT_ONLY)" \
  --build-arg RATE_LIMIT_ENABLED="$(load_arg RATE_LIMIT_ENABLED)" \
  --build-arg REDIS_URL="$(load_arg REDIS_URL)" \
  --build-arg REDIS_PASSWORD="$(load_arg REDIS_PASSWORD)" \
  --build-arg ONECLICK_JWT_TOKEN="$(load_arg ONECLICK_JWT_TOKEN)" \
  --build-arg RPC_URL_1="$(load_arg RPC_URL_1)" \
  --build-arg RPC_URL_8453="$(load_arg RPC_URL_8453)" \
  $TAGS \
  --push \
  .

echo "✓ Pushed ${REPO}:${VERSION}"
if [ "$VERSION" != "latest" ]; then
  echo "✓ Pushed ${REPO}:latest"
fi
