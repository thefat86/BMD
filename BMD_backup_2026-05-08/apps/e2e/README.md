# BMD · Tests E2E (Playwright)

Tests bout-en-bout couvrant les flows critiques sur 3 viewports
(desktop / iPhone / iPad).

## Setup (1ère fois)

```bash
cd apps/e2e
npm install
npm run install:browsers   # télécharge Chrome/Safari/Firefox headless
```

## Lancer les tests

Démarrer en parallèle l'API et le front (dans 2 terminaux) :

```bash
# Terminal 1
npm run dev --workspace=@bmd/api

# Terminal 2
npm run dev --workspace=@bmd/web

# Terminal 3 — tests
cd apps/e2e
npm test                # tous les tests, mode headless
npm run test:headed     # navigateur visible
npm run test:ui         # interface visuelle Playwright
npm run test:debug      # mode debug pas-à-pas
npm run report          # rapport HTML après échec
```

Pour cibler un seul test :

```bash
npx playwright test marketing.spec.ts --project=desktop-chrome
```

## Couverture actuelle

- `marketing.spec.ts` : vitrine publique (sticky nav, FX ticker, CTA)
- `login-flow.spec.ts` : OTP login (skip — nécessite route helper API)
- `responsive-shell.spec.ts` : séparation mobile / desktop

## À ajouter

- Création de groupe + ajout de dépense (auth requise → besoin du
  helper `/auth/dev/last-otp` côté API)
- Flow upgrade plan (mock Stripe avec `stripe-mock`)
- Pull-to-refresh mobile (touch events)
- Realtime SSE (deux navigateurs en parallèle, vérifier que B reçoit
  l'event quand A crée une dépense)
