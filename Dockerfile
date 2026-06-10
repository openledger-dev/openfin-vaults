# ──────────────────────────────────────────────────────────────────────────────
# Multi-stage Dockerfile for OpenVault (Next.js 16, npm, Node 24 LTS)
#
# Stages:
#   base    — Node 24 Alpine (pinned patch version)
#   deps    — Install production + dev dependencies (npm ci)
#   builder — Build the Next.js app (output: standalone)
#   runner  — Minimal runtime image (~no node_modules)
#
# Build-time variables (NEXT_PUBLIC_* are baked into the client bundle):
#   docker build \
#     --build-arg NEXT_PUBLIC_REOWN_PROJECT_ID=... \
#     --build-arg NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR=... \
#     --build-arg NEXT_PUBLIC_MORPHO_VAULT_ADDR=... \
#     --build-arg NEXT_PUBLIC_APP_URL=https://your-domain.com \
#     -t openvault .
#
# Runtime variables (pass to container via -e or --env-file):
#   REDIS_URL, RPC_URL_1, RPC_URL_8453, RATE_LIMIT_ENABLED,
#   ONEINCH_API_KEY, ONECLICK_JWT_TOKEN
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: base ─────────────────────────────────────────────────────────────
FROM node:24.16.0-alpine3.23 AS base

# ── Stage 2: deps ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json /app/
RUN npm ci

# ── Stage 3: builder ──────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# ── Build-time env vars (NEXT_PUBLIC_* are inlined into the JS bundle) ────────
ARG NEXT_PUBLIC_REOWN_PROJECT_ID
ARG NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR
ARG NEXT_PUBLIC_ULTRAYIELD_CHAIN_ID=1
ARG NEXT_PUBLIC_MORPHO_VAULT_ADDR
ARG NEXT_PUBLIC_MIDAS_VAULT_ADDR
ARG NEXT_PUBLIC_MIDAS_CHAIN_ID=1
ARG NEXT_PUBLIC_SWAP_MIN_USD=5
ARG NEXT_PUBLIC_APP_URL
ARG SHOW_ALLOCATION=false

ENV NEXT_PUBLIC_REOWN_PROJECT_ID=$NEXT_PUBLIC_REOWN_PROJECT_ID
ENV NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR=$NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR
ENV NEXT_PUBLIC_ULTRAYIELD_CHAIN_ID=$NEXT_PUBLIC_ULTRAYIELD_CHAIN_ID
ENV NEXT_PUBLIC_MORPHO_VAULT_ADDR=$NEXT_PUBLIC_MORPHO_VAULT_ADDR
ENV NEXT_PUBLIC_MIDAS_VAULT_ADDR=$NEXT_PUBLIC_MIDAS_VAULT_ADDR
ENV NEXT_PUBLIC_MIDAS_CHAIN_ID=$NEXT_PUBLIC_MIDAS_CHAIN_ID
ENV NEXT_PUBLIC_SWAP_MIN_USD=$NEXT_PUBLIC_SWAP_MIN_USD
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV SHOW_ALLOCATION=$SHOW_ALLOCATION
ENV NEXT_PUBLIC_SHOW_ALLOCATION=$SHOW_ALLOCATION
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules /app/node_modules
COPY . /app/

RUN npm run build

# ── Stage 4: runner ───────────────────────────────────────────────────────────
FROM node:24.16.0-alpine3.23 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3032
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs \
 && mkdir -p /var/log \
 && chown nextjs:nodejs /var/log

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone /app/
COPY --from=builder --chown=nextjs:nodejs /app/.next/static /app/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public /app/public

VOLUME ["/var/log"]

USER nextjs

EXPOSE 3032

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3032)+'/',function(r){process.exit(r.statusCode<500?0:1)}).on('error',function(){process.exit(1)})"

CMD ["node", "/app/server.js"]
