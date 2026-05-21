# =============================================================================
# BMD · API Dockerfile (multi-stage prod)
# =============================================================================
# Build :
#   docker build -f apps/api/Dockerfile -t bmd-api:latest .
#   (depuis la racine du monorepo — le contexte doit voir apps/ et packages/)
#
# Run :
#   docker run -p 4000:4000 --env-file apps/api/.env bmd-api:latest
#
# Conçu pour :
#  - Image finale ~150 Mo (alpine + tsc compilé, pas de tsx/dev deps)
#  - Layer cache friendly (npm ci avant copy src)
#  - Healthcheck intégré
#  - User non-root (sécurité)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 : deps (install all deps incluant dev pour build)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

# Outils requis pour compiler argon2 (native binding) sur alpine
RUN apk add --no-cache python3 make g++ \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Workspace root + manifest API + shared-types pour préserver la résolution npm
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/

# `npm ci --workspaces` installe l'arbre complet (root + workspaces).
# --no-audit --no-fund pour CI silencieux.
RUN npm ci --no-audit --no-fund

# -----------------------------------------------------------------------------
# Stage 2 : build (prisma generate + tsc)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Récupère les node_modules déjà installés
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules

# Copie le code source
COPY package.json package-lock.json* tsconfig.base.json turbo.json ./
COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types

# Génère le client Prisma puis compile shared-types et l'API
WORKDIR /app/apps/api
RUN npx prisma generate
WORKDIR /app/packages/shared-types
RUN npm run build || true
WORKDIR /app/apps/api
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3 : runtime (image finale minimale)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# tini : reaps zombie processes (Node ne le fait pas correctement comme PID 1)
# curl : pour les healthchecks
RUN apk add --no-cache tini curl \
    && addgroup -S bmd && adduser -S bmd -G bmd \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Manifest pour npm prune --production
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/

# node_modules de prod uniquement
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared-types/node_modules ./packages/shared-types/node_modules

# Code compilé
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/shared-types/src ./packages/shared-types/src

# Élague les dev-dependencies pour réduire la taille de l'image finale
RUN npm prune --omit=dev --workspaces --include-workspace-root \
    && npm cache clean --force \
    && rm -rf /root/.npm

# Permissions
RUN chown -R bmd:bmd /app

USER bmd

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

EXPOSE 4000

# Healthcheck — touche /health toutes les 30s, marqué unhealthy si 3 échecs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:4000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]

# Migrations Prisma au démarrage puis lancement du serveur.
# Note : si tu déploies plusieurs replicas, il vaut mieux lancer `prisma migrate deploy`
# UNE FOIS dans un job init dédié, et lancer juste `node` ici. Cf DEPLOYMENT.md.
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/index.js"]
