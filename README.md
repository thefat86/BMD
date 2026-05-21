# BMD · Back Mes Do

> « L'argent partagé. L'amitié protégée. »

**BMD** est une fintech sociale pour la diaspora africaine et asiatique. Elle gère collectivement l'argent — dépenses partagées entre amis, **tontines rotatives**, événements ponctuels (mariages, voyages), associations cultuelles — avec un parcours sans friction, multi-devises et multi-langues.

Ce repo est un **monorepo Turborepo** : backend Node.js / Fastify, client web Next.js 15 (PWA installable, mode dark only), et types partagés. La PWA fait office d'app native pour la beta privée — l'app mobile native iOS + Android est prévue pour le go-live grand public.

État au sprint **AD-3** (8 mai 2026) : **227+ sprints livrés**, produit techniquement prêt pour la beta fermée.

---

## Démarrage en 3 minutes

Pré-requis : **Node.js 20+**, **Docker**, **npm 10+**.

```bash
# 1. Installer les dépendances du monorepo
npm install

# 2. Démarrer Postgres en local (port 5433 pour ne pas entrer en conflit)
npm run db:up

# 3. Configurer l'environnement du backend
cp apps/api/.env.example apps/api/.env

# 4. Migrations + génération du client Prisma
npm run db:migrate

# 5. Lancer le backend (port 4000) ET le client web (port 3000) en parallèle
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

En mode dev, l'API affiche aussi les IPs LAN au boot pour que tu puisses tester depuis ton iPhone sur le même Wi-Fi (`http://192.168.x.x:3000`).

### Lancer les tests

```bash
# Backend (Vitest, ≥ 80% de couverture sur src/modules + src/lib)
npm test --workspace apps/api

# i18n strict — zéro régression sur les 27 locales, zéro string FR hardcodée
cd apps/web
npm run i18n:check:strict
npm run i18n:audit:strict

# E2E Playwright (3 viewports : desktop-chrome, mobile-iphone, tablet-ipad)
cd apps/e2e
npm test
```

---

## Architecture du monorepo

```
bmd-app/
├── apps/
│   ├── api/                       # Backend Node.js + Fastify + Prisma
│   │   ├── prisma/schema.prisma   # 81 modèles & enums, 28 migrations
│   │   ├── src/
│   │   │   ├── lib/               # env, db, errors, scheduler, cache, queue,
│   │   │   │                      # email-templates, fx, stripe, totp, web-push,
│   │   │   │                      # crypto-vault, seed-plans, seed-currencies…
│   │   │   ├── modules/           # 38 modules métier (cf. ci-dessous)
│   │   │   ├── server.ts          # Fastify app + middlewares + routes
│   │   │   └── index.ts           # Entrypoint + seeds idempotents + scheduler
│   │   └── tests/                 # Vitest
│   │
│   ├── web/                       # Client Next.js 15 (App Router) + PWA
│   │   ├── app/                   # Vitrine, login, dashboard, admin, legal, cms
│   │   ├── lib/
│   │   │   ├── i18n/              # Catalog typé : 1095+ clés × 27 locales
│   │   │   └── ui/                # 50+ composants partagés
│   │   └── scripts/               # check-i18n-coverage, check-no-fr-strings
│   │
│   └── e2e/                       # Playwright E2E
│
└── packages/
    └── shared-types/              # Types TypeScript partagés API ↔ web
```

---

## Modules livrés

### Foundation

**M01 · Auth** — OTP 6 chiffres (SMS/WhatsApp/email via Twilio Verify + Resend), sessions JWT révocables, **passkeys WebAuthn** (Face ID / Touch ID), SSO Google + Apple + WhatsApp, 2FA TOTP, anti-bombing 5/h, anti-bruteforce 3 essais, anti-replay challenge.

**M02 · Profil & contacts vérifiés** — Multi-contacts (jusqu'à 3 numéros + 3 emails), contact principal, vérification OTP, badge SIM-swap.

**M03 · i18n 27 locales** — fr, en, es, pt, ar (RTL), de, it, lb, ru, ja, ko, hi, zh, sw, wo, ln, am, pcm, ha, yo, om, ig, ff, zu, ak, **fr-cm (Francanglais)**, **fr-ci (Nouchi)**. Console admin reste en FR.

**M04 · Multi-devises** — 25+ devises (XAF, XOF, NGN, INR, etc.), FX live via OpenExchangeRates + fallback, tarification PPA régionale.

### Domaine

**M05 · Groupes** — 7 types (TONTINE, COLOC, TRAVEL, EVENT, CLUB, PARISH, GENERIC), 4 rôles (ADMIN, TREASURER, MEMBER, OBSERVER), invitations par lien WhatsApp / QR / numéro / e-mail, mode invité (compte « shadow »), thèmes par communauté, règles catégories.

**M06 · Dépenses** — 4 modes de saisie (manuel, **OCR ticket** à 3 moteurs avec fallback transparent, vocal Whisper, import bancaire CSV). 4 modes de partage (EQUAL, UNEQUAL, PERCENTAGE, ITEMIZED), **multi-payeurs** sur une dépense, presets de partage réutilisables. Decimal-safe (`Decimal(14,4)` côté DB), auto-correction des arrondis. Pièces jointes, journal d'audit hash-chained immuable, **détection d'anomalies** (montant inhabituel, doublon, retard).

**M07 · Soldes & règlements** — Solde par membre + global multi-groupes (par devise), algorithme greedy de simplification (≤ n-1 transactions), `Settlement` avec confirmation 2 parties, **règlements cross-groupes** (V30) en 1 tap, vue par groupe / vue par personne, page imprimable PDF via Cmd+P.

**M08 · Tontines** — Cycles rotatifs avec ordre RANDOM ou MANUAL, cagnotte centralisée ou versements directs, **mode AUCTION (Hui chinois 標會)** avec enchères par tour, double validation cotisations PENDING → PAID → CONFIRMED, calendrier 6 mois × 5 lignes, journal hash-chained.

**M09 · Swap de dettes** — Détection croisée intra-groupe + transferts binaires A→C↔B, swap **N-aire** triangulaire, acceptation explicite par toutes parties, délai 48h, audit log, gating Premium.

**M10 · Partages flexibles** — Couple, tous les contributeurs, membres choisis, parts inégales / %, presets réutilisables (`SplitPreset`).

### Intégration

**M11 · Paiements** — Stripe (fiat) + add-on billing (réunion premium 1h, audio proof 5min, OCR factures Mindee), **Mobile Money** (M-Pesa, MTN MoMo, Orange Money, Wave, Airtel — orchestration P2P sans séquestre de fonds), vault paiement AES-256-GCM, Stripe portal sur refus add-on.

**M12 · QR Code** — Page `/login/qr` + `/qr-login/[token]` pour connexion par scan depuis mobile. Token URL-safe 24 octets, TTL 14 jours, usage unique. Token de paiement invité `/pay/[token]`.

**M13 · Notifications** — In-app (`<NotificationBell>`), email transactionnel (Resend), SMS / WhatsApp (Twilio + Meta WABA), **Web Push VAPID** (PWA installée iOS 16.4+), tonalités paramétrables (sympa / ferme / humour / pro), mode « Ne pas déranger » par groupe, résumé hebdo automatique, relances invitations J+2/J+5/J+10.

**M16 · Bot WhatsApp** — Adaptateurs Meta WABA Cloud API, signature `X-Hub-Signature-256`, templates pré-approuvés. Bot conversationnel natif **partiel** : OTP + login + à étoffer pour la sync bidirectionnelle complète.

### Intelligence

**M14 · OCR tickets** — Pipeline 3 moteurs avec fallback transparent : **Mindee Invoice/Receipts** > **GPT-4o Vision** > **Tesseract** local. Compteur d'usage par plan (`assertCanUseOcr`). Trial Premium 14 jours auto au 4ᵉ scan.

**M15 · IA conversationnelle** — Parse-expense GPT-4o (« ajoute 25€ pour le resto d'hier »), Whisper (vocal → texte), suggestions IA partage, **réunions enregistrées** (audio S3 + transcription Whisper + extraction de décisions GPT-4o), audio proof 5min cas marché Afrique.

### Plateforme

**M17-M19 · Apps mobiles natives** — Pas démarrées (cible go-live). PWA actuelle : Service Worker network-first, install prompt iOS + Android, push notifications, haptics, safe-areas, passkeys WebAuthn. Cf. roadmap.

**M20 · Web** — Vitrine 3551 lignes (hero, story, features, FAQ, pricing live, lang picker), espace client complet, dashboard dual-view, search globale (incluant transcripts de réunions).

**M21 · Console admin** — Dashboard temps réel (sparklines SSE, pulse LIVE, KPIs MRR/ARR/ARPU/Churn, cohort retention, conversion funnel), recherche/filtres users + groupes + tontines, **plans éditables** depuis l'admin avec cache TTL 5 min, FX override, gestion AB tests, journal d'audit, gestion publicités, CMS pages.

### Cross-cutting

**M22 · Sécurité & audit** — Cf. [SECURITY.md](./SECURITY.md). OTP argon2 + pepper, vault AES-256-GCM, JWT révocables, anti-replay WebAuthn, signatures Stripe + WhatsApp, audit log hash-chained, rate-limit aggressif, headers HSTS/X-Frame/CSP, CORS whitelisté.

**M23 · Monétisation** — 5 plans freemium (FREE / PREMIUM / COMMUNITY / PARISH / EVENT), tarification PPA régionale (XAF, NGN, INR…), trial Premium 14 jours après 4ᵉ scan OCR, **programme parrainage** (filleul → parrain, codes AFF-XXXX commerciaux multi-niveaux, KYC anti-fraude, payouts via Stripe Connect Express), promos, reçus fiscaux automatiques (Article 200 CGI sur PARISH).

---

## Stack technique

**Backend** · Node.js 20 · **Fastify 4** · **Prisma 5** sur PostgreSQL 16 · TypeScript 5 · Zod (validation) · argon2 (OTP) · @fastify/jwt + @fastify/cors + @fastify/multipart + @fastify/compress (Brotli/gzip) · @simplewebauthn/server · decimal.js · pdf-lib · tesseract.js · stripe.

**Frontend web** · **Next.js 15.5** (App Router) · React 18 · TypeScript · CSS-in-JS inline + variables CSS · **mode dark uniquement** · PWA (Service Worker network-first, install prompt iOS + Android, haptics, safe-areas) · @simplewebauthn/browser · hooks `useT()` maison.

**Infra** · Postgres 16 + PgBouncer (transaction pool) · Redis 7 (drop-in optionnel via `REDIS_URL`, fallback in-memory) · BullMQ (jobs lourds, optionnel) · S3 (audio, rotation 90 jours).

**Tests** · Vitest (≥ 80% couverture sur API) · Playwright E2E sur 3 viewports.

**Tooling** · Turborepo · npm workspaces · Docker + Docker Compose · GitHub Actions (`ci.yml`, `e2e.yml`, `deploy.yml`) · pino-pretty (logs structurés avec request-id propagé).

---

## i18n — règle d'or

> Un Chinois ne doit jamais voir du français sur son compte.

Catalog single source of truth en TypeScript (`apps/web/lib/i18n/app-strings.ts`, ~29 000 traductions). CI stricte zéro tolérance : chaque ajout de clé doit être complété sur les 27 locales avant merge. Cf. [CONTRIBUTING.md](./CONTRIBUTING.md) — section « Règle d'or i18n ».

Emails transactionnels : 14 locales avec copy native (fr, en, es, pt, ar, de, it, sw, wo, ln, am, ja, ko, zh) + 11 fallback EN. **Citation BMD du jour** auto-injectée dans chaque email (rotation déterministe par jour pour cohérence intra-journée). Logo BMD inline SVG + BIMI configuré (logo dans Gmail/Apple Mail/Yahoo).

---

## Sécurité

Voir [SECURITY.md](./SECURITY.md) pour le threat model et la checklist go-live complète.

Highlights : pas de mot de passe (OTP + passkeys + SSO uniquement), vault paiement AES-256-GCM, audit log hash-chained immuable, anti-bombing OTP, anti-replay WebAuthn (challenge cleared avant verify), signatures webhooks Stripe + WhatsApp vérifiées, rate-limit `/auth/passkey/options` 30/min/IP, audio proof rotation S3 + rétention 90 jours.

DPO contact : `privacy@backmesdo.com`. Disclosure responsable : `security@backmesdo.com`.

---

## Documentation

| Fichier | Description |
|---|---|
| [`CHANGELOG.md`](./CHANGELOG.md) | Récap exhaustif de tous les sprints (V1 → AD-3, ~2000 lignes) |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Conventions code, règle d'or i18n, fanout GPT auto-traduction |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Vercel + Railway · Docker self-host · Cloudflare Pages, secrets, Stripe / WhatsApp / Apple / Google setup, smoke tests, checklist go-live |
| [`SECURITY.md`](./SECURITY.md) | Threat model, défenses, checklist sécu, procédure d'incident, rotation de secrets |
| [`docs/EMAIL-BIMI-SETUP.md`](./docs/EMAIL-BIMI-SETUP.md) | Setup BIMI (logo dans Gmail / Apple Mail / Yahoo) |
| [`docs/HUI-TEST.md`](./docs/HUI-TEST.md) | Procédure de test des tontines mode AUCTION (Hui chinois) |

---

## Roadmap

### En cours

- **Recrutement beta fermée 50 utilisateurs diaspora** (CM, CI, SN en priorité) — onboarding individuel, feedback WhatsApp, NPS hebdo, cible 6 semaines.
- **Élargissement des statuts juridiques** de TPL Mobility (EURL France, en cours via Legalplace) pour ajouter la création et vente de logiciels.

### Avant le go-live grand public

- **App mobile native iOS + Android** — la PWA actuelle reste l'étape transitoire ; le live se fera sur des apps dans l'App Store et le Play Store. Techno à arbitrer.
- **Création de TPL Group au Luxembourg** — prévu novembre 2026.
- **Compliance & licence paiements** — clarifier statut PSP / Établissement de Paiement / Agent. BMD reste en mode « orchestration sans séquestre de fonds » pour l'instant ; à valider avec un conseil franco-luxembourgeois avant scaling.
- **Vérification fiscale LU/FR** — convention franco-luxembourgeoise, TVA OSS sur abonnements B2C UE.
- **RGPD marchés africains** — audit conformité Cameroun (loi n°2010/012) + Côte d'Ivoire (loi 2013-450), DPO, hébergement local.

### Après le go-live

- Newsletter mensuelle « La lettre BMD » (anonymisations + citation BMD).
- Marketing organique : landing CM/CI/SN dédiées, témoignages vidéo, TikTok diaspora.
- Programme parrainage récompensé activé (1 mois Premium offert).
- Internationalisation paiements : Hong Kong, Taïwan, Singapour, Brésil (Pix).
- Audit a11y systématique (WCAG 2.1 AA).
- Monitoring complet : Sentry (errors), Datadog APM ou OTel, UptimeRobot.

---

## Licence

Propriétaire — © **TPL Mobility** (en transition vers TPL Group LU). Tous droits réservés.
