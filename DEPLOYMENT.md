# BMD · Guide de déploiement

Trois cibles supportées : **Vercel + Railway/Render** (recommandé MVP), **Docker self-host** (Hetzner/OVH/Scaleway), **Cloudflare Pages + Workers** (edge global).

## 🎯 Choix de la cible

| Cible | Quand | Coût/mois (10k MAU) |
|---|---|---|
| **Vercel + Railway** | MVP rapide, peu d'infra à gérer | ~50-100 € |
| **Docker self-host** | Contrôle total, conformité, économies à l'échelle | ~30-60 € (VPS 4 vCPU + Postgres managé) |
| **Cloudflare Pages + Workers** | Latence edge globale, scaling massif | ~20-80 € (Workers + D1 ou Postgres externe) |

---

## 1️⃣ Vercel + Railway (recommandé MVP)

### Web (Vercel)

```bash
# Une seule fois :
npm i -g vercel
vercel link        # depuis apps/web/

# Variables Vercel à configurer dans Project Settings → Environment Variables :
NEXT_PUBLIC_API_URL=https://api.backmesdo.com
```

Vercel utilise automatiquement :
- `next.config.js headers()` pour les cache HTTP
- Edge runtime sur les pages avec `export const runtime = "edge"`
- Brotli/gzip auto sur toutes les réponses
- CDN global avec cache des assets `_next/static/*` (1 an immutable)

### API (Railway / Render / Fly.io)

```bash
# Railway :
railway login
cd apps/api
railway init
railway up

# Variables à configurer (Railway Dashboard) :
DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=1
JWT_SECRET=<openssl rand -hex 32>
OTP_PEPPER=<openssl rand -hex 16>
WEB_BASE_URL=https://app.backmesdo.com
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
```

### Database (Neon / Supabase / Railway PG)

- **Neon** : free tier 500 MB suffit pour MVP, autoscaling automatique, branches DB pour preview
- **Supabase** : free tier 500 MB + PostgREST inclus si besoin
- **Railway PG** : 5 € / mois pour 1 GB

---

## 2️⃣ Docker self-host

### `Dockerfile` API (déjà fourni : `apps/api/Dockerfile`)

```bash
docker build -t bmd-api -f apps/api/Dockerfile .
docker run -d --name bmd-api -p 4000:4000 \
  --env-file apps/api/.env.production \
  bmd-api
```

### `Dockerfile` Web (déjà fourni : `apps/web/Dockerfile`)

```bash
docker build -t bmd-web -f apps/web/Dockerfile .
docker run -d --name bmd-web -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://api:4000 \
  bmd-web
```

### `docker-compose.yml` complet

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: bmd
      POSTGRES_USER: bmd
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports: ["5432:5432"]
    restart: unless-stopped

  pgbouncer:
    image: edoburu/pgbouncer:latest
    environment:
      DATABASE_URL: postgresql://bmd:${DB_PASSWORD}@postgres:5432/bmd
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 1000
      DEFAULT_POOL_SIZE: 25
    depends_on: [postgres]
    ports: ["6432:6432"]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://bmd:${DB_PASSWORD}@pgbouncer:6432/bmd?pgbouncer=true&connection_limit=1
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      OTP_PEPPER: ${OTP_PEPPER}
      WEB_BASE_URL: https://app.backmesdo.com
      NODE_ENV: production
      PORT: 4000
      HOST: 0.0.0.0
    depends_on: [pgbouncer, redis]
    ports: ["4000:4000"]
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      NEXT_PUBLIC_API_URL: https://api.backmesdo.com
      NODE_ENV: production
    ports: ["3000:3000"]
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddydata:/data
    ports: ["80:80", "443:443"]
    depends_on: [web, api]
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  caddydata:
```

### `Caddyfile` (TLS auto + reverse proxy)

```
app.backmesdo.com {
  reverse_proxy web:3000
  encode gzip zstd
  header X-Frame-Options DENY
  header X-Content-Type-Options nosniff
}

api.backmesdo.com {
  reverse_proxy api:4000
  encode gzip zstd
}
```

### Migrations Prisma au déploiement

```bash
# Une fois la DB up :
docker-compose exec api npx prisma migrate deploy
docker-compose exec api npx prisma db seed     # seeds idempotents
```

---

## 3️⃣ Cloudflare Pages + Workers

Pour un **scaling edge global massif**, mais demande plus de refacto (l'API Fastify n'est pas Workers-compatible nativement). Plan :

- **Web (Cloudflare Pages)** : `next-on-pages` ou `wrangler pages deploy`. Most pages avec `runtime: "edge"` deviennent natives ; le reste tombe sur Cloudflare's nodejs_compat.
- **API (Workers)** : nécessite refacto Fastify → Hono (similar API, edge-native). À planifier si tu vises >10M requêtes/mois.

Pour le MVP, **Vercel reste plus simple**.

---

## 🔐 Secrets management

**Jamais commiter** : `.env`, `.env.production`, `*.secret`, fichiers Stripe/Apple .p8.

Utilise :
- **Vercel** : Project Settings → Environment Variables (encrypted at rest)
- **Railway** : Variables tab (idem)
- **Self-host** : `.env.production` non-commité + secrets manager (HashiCorp Vault, Doppler, 1Password CLI)

Génération des secrets initiaux :

```bash
# JWT_SECRET (32 bytes hex)
openssl rand -hex 32

# OTP_PEPPER (16 bytes hex)
openssl rand -hex 16

# PAYMENT_VAULT_KEY (AES-256, 32 bytes base64)
openssl rand -base64 32

# WHATSAPP_WEBHOOK_VERIFY_TOKEN (à coller aussi dans Meta App Dashboard)
openssl rand -base64 24

# VAPID keys (push notif)
npx web-push generate-vapid-keys
```

---

## 💳 Stripe setup checklist

Une fois en prod :

1. **Activer** ton compte Stripe (vérification entreprise SIREN/RCS)
2. Créer les **Products** : `Premium`, `Communauté`, `Paroisse`, `Événement`
3. Pour chaque Product, créer les **Prices** (1 par devise/intervalle) :
   - Premium mensuel : 2,99 € (recurring monthly)
   - Premium annuel : 29,00 € (recurring yearly)
   - Communauté mensuel : 10,00 € (recurring monthly)
   - Paroisse mensuel : 15,00 € (recurring monthly)
   - Événement : 29,00 € (one-time)
4. Coller les **Price IDs** dans Console BMD → Tarifs régionalisés
5. Configurer le **webhook** : `https://api.backmesdo.com/webhooks/stripe`
   - Events : `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`, `account.updated`
   - Récupérer le **signing secret** → variable `STRIPE_WEBHOOK_SECRET`
6. Pour Stripe Connect (commerciaux) : activer Connect Express dans Settings

---

## 📱 Meta WhatsApp Business setup

1. Créer une **Meta App** (developers.facebook.com → My Apps → Create App → Business)
2. Ajouter le produit **WhatsApp Business** à l'App
3. Récupérer un **Phone Number ID** + **Permanent Access Token**
4. Configurer le **webhook** : `https://api.backmesdo.com/webhooks/whatsapp`
   - Verify Token : ta valeur `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Subscribe events : `messages`
5. **Templates** pré-approuvés Meta (OTP, rappels) — soumettre au reviewer Meta (24-48h)
6. Variables :
   - `WHATSAPP_PHONE_NUMBER_ID=...`
   - `WHATSAPP_ACCESS_TOKEN=...`
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN=...`
   - `WHATSAPP_APP_SECRET=...` (Settings → Basic → App Secret)
   - `WHATSAPP_BUSINESS_NUMBER=33612345678` (sans le +)
   - `WHATSAPP_OTP_TEMPLATE=bmd_otp_v1`

---

## 📲 Apple Sign-In setup

1. **developer.apple.com** → Identifiers → Services ID
2. Créer un Service ID `com.backmesdo.signin`
3. Activer **Sign In with Apple** + configurer les **Return URLs** :
   - `https://api.backmesdo.com/auth/apple/callback`
4. Créer une **Key** (Apple Sign In capability) → télécharger le `.p8`
5. Variables :
   - `APPLE_CLIENT_ID=com.backmesdo.signin`
   - `APPLE_TEAM_ID=ABCDE12345` (Membership)
   - `APPLE_KEY_ID=ABCDE12345` (de la Key créée)
   - `APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."` (contenu .p8 multi-lignes échappées)

---

## 🔍 Google Sign-In setup

1. **Google Cloud Console** → APIs & Services → Credentials → OAuth 2.0 Client ID type "Application Web"
2. Authorized redirect URIs : `https://api.backmesdo.com/auth/google/callback`
3. Variables :
   - `GOOGLE_CLIENT_ID=...apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET=...`

---

## 📊 Monitoring / observabilité

- **Sentry** (errors) : ajoute `@sentry/nextjs` côté web + `@sentry/node` côté API. Les `error.tsx` Next + ErrorBoundary React loggent déjà `console.error` — il suffit d'init Sentry au boot.
- **Datadog APM** ou **OpenTelemetry** : le request ID `X-Request-Id` est déjà propagé. Brancher l'OTEL SDK dans `apps/api/src/server.ts` au boot.
- **UptimeRobot / Better Uptime** : pinger `https://api.backmesdo.com/health` toutes les 60s.
- **Prometheus** : scraper `https://api.backmesdo.com/metrics` (format Prometheus déjà exposé).

---

## 🚦 Smoke tests post-déploiement

```bash
# 1. Health
curl https://api.backmesdo.com/health
# attendu : {"status":"ok","checks":{"db":"ok",...}}

# 2. Auth — request OTP
curl -X POST https://api.backmesdo.com/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"contactType":"EMAIL","contactValue":"test@example.com"}'

# 3. Web → /login charge (HTML)
curl -I https://app.backmesdo.com/login

# 4. PWA manifest accessible
curl -I https://app.backmesdo.com/manifest.json

# 5. Service Worker accessible
curl -I https://app.backmesdo.com/sw.js
```

---

## 🆘 Dépannage

**Web ne se charge pas après déploiement**
- Vérifie `NEXT_PUBLIC_API_URL` côté Vercel
- Si CORS bloque : la config Fastify a `cors: { origin: true, credentials: true }` (accepte tout). Vérifie qu'aucun proxy upstream ne strippe les headers.

**API DB connection refused**
- Vérifie `DATABASE_URL`. Si PgBouncer activé : ajoute `?pgbouncer=true&connection_limit=1`.
- Logs : `docker logs bmd-api` (cherche les erreurs Prisma au boot).

**Webhooks Stripe en 400**
- Vérifie que `STRIPE_WEBHOOK_SECRET` correspond au signing secret du webhook créé dans le Stripe Dashboard.
- Le hook lit le raw body — assure-toi qu'aucun middleware n'a parsé le JSON avant.

**Push notifs iOS ne marchent pas**
- iOS exige PWA installée sur écran d'accueil (iOS 16.4+). Le bandeau `<IosInstallNotice>` guide l'utilisateur.
- Vérifie que les VAPID keys sont les mêmes côté API (génération) et côté navigateur (subscribe).

---

## ✅ Checklist go-live

- [ ] PostgreSQL 16+ provisionné avec PgBouncer en transaction mode
- [ ] Redis 7+ provisionné (optionnel mais recommandé pour multi-instance)
- [ ] Migrations Prisma appliquées (`prisma migrate deploy`)
- [ ] Seeds idempotents exécutés (currencies, locales, plans, regions)
- [ ] DNS pointé vers Vercel (web) + Railway (api)
- [ ] TLS auto via Caddy/Vercel/Cloudflare
- [ ] Tous les secrets `.env` configurés (cf. `.env.example`)
- [ ] Stripe Products + Prices + Webhook configurés
- [ ] Apple Sign-In + Google Sign-In configurés (si offerts au login)
- [ ] WhatsApp Business + webhook vérifié + templates approuvés Meta (24-48h)
- [ ] OPENAI_API_KEY configuré (LLM + Whisper STT vocal + auto-traduction)
- [ ] Sentry / Datadog branché (errors + APM)
- [ ] UptimeRobot pinger `/health` toutes les 60s
- [ ] Smoke tests passés (cf. section ci-dessus)
- [ ] 1er super-admin créé : `npm run make-admin <ton_email>`
- [ ] Politique privacy + CGU à jour (`/legal/privacy` rédigée + ToS si nécessaire)
- [ ] Mention RGPD + email DPO si EU users

Bonne chance ! 🚀
