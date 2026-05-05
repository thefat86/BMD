# BMD · Back Mes Do

> « L'argent partagé. L'amitié protégée. »

Sprint 0 + MVP vertical slice : **monorepo Turborepo** avec un backend Node.js / Fastify / Prisma et un client web Next.js. Les 4 modules de cœur d'application sont implémentés et testés : **Auth (M01)**, **Groupes (M05)**, **Dépenses (M06)**, **Soldes & règlements (M07)**.

## Démarrage en 3 minutes

Tu as besoin de **Node.js 20+**, **Docker**, et **npm 10+**.

```bash
# 1. Installer les dépendances du monorepo
npm install

# 2. Démarrer Postgres en local (port 5433 pour ne pas entrer en conflit avec un Postgres existant)
npm run db:up

# 3. Configurer l'environnement du backend
cp apps/api/.env.example apps/api/.env

# 4. Créer le schéma de base de données + générer le client Prisma
npm run db:migrate

# 5. Lancer le backend (port 4000) ET le client web (port 3000) en parallèle
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

### Lancer les tests

```bash
# Tests du backend (Vitest, avec couverture ≥ 80%)
npm test --workspace apps/api

# Tests d'un module spécifique
npm test --workspace apps/api -- auth
npm test --workspace apps/api -- groups
npm test --workspace apps/api -- expenses
npm test --workspace apps/api -- settlements
```

> **Note importante** : les tests utilisent la même base que le développement. En CI, une base dédiée `bmd_test` est créée par GitHub Actions (voir `.github/workflows/ci.yml`).

## Architecture

```
bmd/
├── apps/
│   ├── api/                       # Backend Node.js + Fastify + Prisma
│   │   ├── prisma/schema.prisma   # Schéma DB (users, groups, expenses, settlements)
│   │   ├── src/
│   │   │   ├── lib/               # env, db, errors
│   │   │   ├── modules/
│   │   │   │   ├── auth/          # M01 · OTP + JWT + sessions
│   │   │   │   ├── groups/        # M05 · CRUD groupes + membres
│   │   │   │   ├── expenses/      # M06 · saisie + 3 modes de partage
│   │   │   │   └── settlements/   # M07 · soldes + algo de simplification
│   │   │   ├── server.ts          # Fastify app + middlewares + routes
│   │   │   └── index.ts           # Entrypoint
│   │   └── tests/                 # Vitest : 25+ cas de test
│   │
│   └── web/                       # Client web Next.js 15
│       ├── app/
│       │   ├── login/             # Connexion par OTP
│       │   ├── dashboard/         # Liste des groupes
│       │   └── dashboard/groups/[id]/  # Détail groupe + dépenses + soldes
│       └── lib/api-client.ts      # Wrapper typé pour l'API
│
└── packages/
    └── shared-types/              # Types TypeScript partagés API ↔ clients
```

## Modules livrés

### M01 · Auth (Authentication)

- **Connexion sans mot de passe** : OTP à 6 chiffres envoyé par SMS, WhatsApp ou e-mail
- **Sessions JWT** révocables (stockées hashées en DB pour permettre la déconnexion à distance)
- **Anti-bombing** : 5 OTP max par contact / heure → 429 Too Many Requests au-delà
- **Anti-bruteforce** : 3 essais max par code, code consommé en cas de succès (anti-rejeu)
- **OTP hashés argon2 + pepper** : jamais stockés en clair, jamais retournés à l'utilisateur
- **Mode dev** : les OTP s'affichent dans la console du backend (pas besoin de Twilio)

### M05 · Groups (Groupes)

- **6 types de groupes** : tontine, coloc, voyage, événement, club, paroisse, générique
- **Rôles** : ADMIN, TREASURER, MEMBER, OBSERVER (avec contrôles d'accès stricts)
- **Invitations** : ajout d'un membre par téléphone ou e-mail. Si le contact n'existe pas, un compte « shadow » est créé pour qu'il puisse rejoindre dès sa première connexion
- **Vérifications** : pas de groupe en double (idempotence), pas de membre en double, accès interdit aux non-membres

### M06 · Expenses (Dépenses)

- **3 modes de partage** : EQUAL (parts égales), UNEQUAL (parts explicites), PERCENTAGE (%)
- **Decimal-safe** : utilise `decimal.js` côté serveur, `Decimal(14,4)` côté Postgres → zéro perte de centimes
- **Auto-correction des arrondis** : la dernière part absorbe les décimales pour que la somme matche EXACTEMENT le montant
- **Multi-devises prêt** : chaque dépense a sa devise (par défaut celle du groupe)

### M07 · Settlements (Soldes & règlements)

- **Calcul automatique des soldes** par membre : `payé - dû`
- **Algorithme de simplification de dettes** (Greedy minimum cash flow) : O(n log n), apurement parfait des soldes, nombre de transactions ≤ n - 1
- **Suggestions de paiement** : qui doit payer combien à qui, en minimisant le nombre de transactions

## API REST

Toutes les routes (sauf `/health` et `/auth/otp/*`) nécessitent un header `Authorization: Bearer <token>`.

| Méthode | Route                          | Description                           |
| ------- | ------------------------------ | ------------------------------------- |
| GET     | `/health`                      | Health check                          |
| POST    | `/auth/otp/request`            | Demander un OTP                       |
| POST    | `/auth/otp/verify`             | Vérifier OTP + créer session          |
| GET     | `/auth/me`                     | Profil + contacts vérifiés            |
| POST    | `/auth/logout`                 | Révoquer la session                   |
| GET     | `/groups`                      | Lister mes groupes                    |
| POST    | `/groups`                      | Créer un groupe                       |
| GET     | `/groups/:id`                  | Détail du groupe                      |
| POST    | `/groups/:id/members`          | Inviter un membre                     |
| GET     | `/groups/:id/expenses`         | Lister les dépenses du groupe         |
| POST    | `/groups/:id/expenses`         | Ajouter une dépense                   |
| GET     | `/groups/:id/balance`          | Soldes + suggestions de règlement     |

## Stack technique

- **Backend** : Node.js 20 · Fastify 4 · Prisma 5 · Postgres 16 · TypeScript 5 · Zod (validation) · argon2 (OTP) · @fastify/jwt (sessions) · decimal.js (calculs financiers)
- **Web** : Next.js 15 · React 18 · TypeScript · CSS modules
- **Tests** : Vitest · couverture ≥ 80% sur `src/modules/**` et `src/lib/**`
- **Tooling** : Turborepo · npm workspaces · ESLint · Docker Compose · GitHub Actions

## Sécurité

- ✓ OTP hashés argon2 + pepper (impossible à reverse-engineer même avec accès DB)
- ✓ Anti-bombing OTP (rate limit par contact)
- ✓ Anti-bruteforce OTP (3 essais max par code)
- ✓ Anti-replay OTP (consommation après 1 succès)
- ✓ JWT signés HMAC-SHA256, sessions stockées hashées (sha256) et révocables
- ✓ Validation stricte de tous les inputs avec Zod
- ✓ Erreurs métier typées (jamais de stack trace renvoyée au client)
- ✓ CORS configuré (à restreindre en prod sur le domaine front)

## Prochaines étapes (modules à venir)

| Module | Nom                       | Itération | Statut    |
| ------ | ------------------------- | --------- | --------- |
| M02    | Profil & contacts vérifiés (multi-pays) | IT1       | À faire |
| M03    | i18n · 12 langues + RTL    | IT1       | À faire |
| M04    | Multi-devises live (25 devises) | IT1   | À faire |
| M08    | Tontines (cycles, anti-fraude) | IT3   | À faire |
| M09    | Swap de dettes (compensation N-aire) | IT3 | À faire |
| M10    | Partages flexibles (mariages) | IT3   | À faire |
| M11    | Paiements (Lydia, Wave, Wise…) | IT4 | À faire |
| ...    | (voir BMD_plan_developpement.docx) | | |

## Ce que tu dois faire de ton côté (humain)

Toutes les étapes ci-dessous nécessitent ton intervention :

1. **Comptes développeurs**
   - Créer un Apple Developer Account (99 $/an)
   - Créer un Google Play Console Account (25 $)

2. **Comptes partenaires** (au moment de M11)
   - Twilio (SMS), Postmark (email), Meta WhatsApp Business API
   - Lydia, Wise, Revolut Business, PayPal Business, Wero (EPI)
   - Orange Money, MTN MoMo, Wave (avec ton entreprise enregistrée)

3. **Hébergement de production**
   - Backend : Fly.io / Railway / Render + Postgres managé (Supabase / Neon)
   - Web : Vercel
   - Coût estimé : 50-100 $/mois pour démarrer

4. **Légal**
   - Société (SAS / SARL), KYC, ouverture de compte bancaire pro
   - Mentions légales, CGU, politique de confidentialité (avocat recommandé)
   - Déclaration CNIL / DPO si > 250 utilisateurs

5. **Beta-test & lancement**
   - Recruter 50 testeurs réels (10 par communauté cible)
   - Soumettre l'app aux stores et passer la review

## Licence

À définir.
