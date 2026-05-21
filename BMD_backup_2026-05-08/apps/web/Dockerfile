# =============================================================================
# BMD · Web (Next.js 15) Dockerfile (multi-stage prod)
# =============================================================================
# Build :
#   docker build -f apps/web/Dockerfile -t bmd-web:latest .
#   (depuis la racine du monorepo — contexte = racine pour packages/shared-types)
#
# Run :
#   docker run -p 3000:3000 \
#     -e NEXT_PUBLIC_API_URL=https://api.backmesdo.com \
#     -e NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx \
#     bmd-web:latest
#
# ⚠️ Les vars NEXT_PUBLIC_* doivent être présentes au BUILD time (elles sont
# inlinées dans le bundle JS). Si tu changes l'URL API entre 2 environnements,
# rebuild l'image. Cf next.config.js pour le pattern auto-détection sur LAN.
#
# Conçu pour :
#  - Image finale ~80 Mo (output: standalone Next 15)
#  - User non-root
#  - Healthcheck sur /api/health (à créer si pas existante)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 : deps
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN npm ci --no-audit --no-fund

# -----------------------------------------------------------------------------
# Stage 2 : build (Next standalone)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Args pour les NEXT_PUBLIC_* — passées au build via --build-arg
# Exemple : docker build --build-arg NEXT_PUBLIC_API_URL=https://api.backmesdo.com ...
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL=https://www.backmesdo.com

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1

# node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules

# Sources
COPY package.json package-lock.json* tsconfig.base.json turbo.json ./
COPY apps/web ./apps/web
COPY packages/shared-types ./packages/shared-types

# Compile shared-types (typescript) puis build Next
WORKDIR /app/packages/shared-types
RUN npm run build || true
WORKDIR /app/apps/web
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3 : runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

RUN apk add --no-cache tini curl \
    && addgroup -S bmd && adduser -S bmd -G bmd \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Standalone output : .next/standalone contient un mini-server.js + ses deps
# Seulement les fichiers nécessaires sont inclus → image ~10x plus petite.
COPY --from=build --chown=bmd:bmd /app/apps/web/.next/standalone ./
COPY --from=build --chown=bmd:bmd /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=bmd:bmd /app/apps/web/public ./apps/web/public

USER bmd

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

# Healthcheck : touche la home (200 = ok, redirect 307 vers /login = ok aussi).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ \
        | grep -q "^[23]" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]

# Note : standalone server.js est généré par Next à la racine du build,
# avec un mapping qui pointe vers apps/web. On lance le binaire central.
CMD ["node", "apps/web/server.js"]
