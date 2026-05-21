# Runbook V46 → V49 · Activation Stripe live + migration users

Ce document détaille **étape par étape** les opérations à faire pour activer
la nouvelle grille tarifaire BMD (FREE / PERSO / FAMILLE / PRO + Lifetime +
Pack IA Booster) en production, avec Stripe live.

**Prérequis** : Stripe account vérifié avec Identity + RIB validé pour
recevoir les payouts. Connect Express activé pour les commissions affiliés.

---

## 1 · Variables d'environnement à configurer

Sur l'hébergement prod (Railway, Render, Fly, etc.), ajouter ou vérifier :

```env
# === Stripe live ===
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2024-12-18.acacia

# === URLs (déjà configurées normalement) ===
WEB_BASE_URL=https://app.backmesdo.com

# === Stripe Connect (commissions affiliés, déjà en place) ===
STRIPE_CONNECT_ENABLED=true
```

**Vérification** : redémarrer le backend et vérifier dans les logs au boot :
```
[stripe] Configured with API version 2024-12-18.acacia
```

Si l'app boot sans erreur Stripe, la clé est bien lue.

---

## 2 · Créer les Stripe Products côté dashboard

Aller sur https://dashboard.stripe.com → Products → **+ Add product**.

Créer **8 prix** au total (4 plans × mensuel/annuel) :

| Plan | Nom Stripe | Type | Prix | Devise | Recurrence |
|---|---|---|---|---|---|
| PERSONAL | BMD Perso · mensuel | Service | 3.99 € | EUR | Monthly |
| PERSONAL | BMD Perso · annuel | Service | 39.00 € | EUR | Yearly |
| FAMILY | BMD Famille · mensuel | Service | 5.99 € | EUR | Monthly |
| FAMILY | BMD Famille · annuel | Service | 69.00 € | EUR | Yearly |
| PRO | BMD Pro · mensuel | Service | 16.99 € | EUR | Monthly |
| PRO | BMD Pro · annuel | Service | 199.00 € | EUR | Yearly |
| LIFETIME_PERSONAL | BMD Perso · à vie | Service | 99.00 € | EUR | One-time |
| (Pack Booster) | BMD Pack IA Booster | — | 4.99 € | EUR | One-time (créé à la volée par notre code, pas besoin d'un Price permanent) |

**Pour chaque Price créé**, copier le `price_id` (commence par `price_...`).

---

## 3 · Stocker les Stripe Price IDs dans `PlanPriceTier`

Via la console admin BMD (`/admin/pricing-matrix`) :

1. Sélectionner la région **EUROPE_NA** (Europe & Amérique du Nord)
2. Pour chaque plan PERSONAL / FAMILY / PRO / LIFETIME_PERSONAL :
   - Coller le `stripePriceId` mensuel
   - Coller le `stripePriceIdYearly` annuel
3. Sauvegarder

Côté SQL direct si console pas dispo :
```sql
UPDATE "PlanPriceTier" SET "stripePriceId" = 'price_xxx_perso_mensuel'
  WHERE "planCode" = 'PERSONAL' AND "regionCode" = 'EUROPE_NA';
UPDATE "PlanPriceTier" SET "stripePriceIdYearly" = 'price_xxx_perso_annuel'
  WHERE "planCode" = 'PERSONAL' AND "regionCode" = 'EUROPE_NA';
-- Idem pour FAMILY, PRO, LIFETIME_PERSONAL
```

---

## 4 · Configurer le Webhook endpoint Stripe

Dashboard Stripe → **Developers** → **Webhooks** → **+ Add endpoint**.

**Endpoint URL** : `https://api.backmesdo.com/webhooks/stripe`

**Events à écouter** (sélectionner exactement ces 6) :
- `checkout.session.completed` *(subscription + pack booster + plan one-shot)*
- `invoice.payment_succeeded` *(renouvellement subscription)*
- `invoice.payment_failed` *(échec paiement → grâce)*
- `customer.subscription.deleted` *(annulation)*
- `payment_intent.succeeded` *(Pack Booster via PaymentIntent direct)*
- `account.updated` *(Connect KYC commerciaux)*

Copier le **Signing secret** (commence par `whsec_...`) → variable d'env
`STRIPE_WEBHOOK_SECRET`.

---

## 5 · Exécuter les migrations Prisma

Sur la DB prod :

```bash
cd apps/api
# Vérifie l'état actuel
npx prisma migrate status

# Applique les migrations V46/V47
npx prisma migrate deploy

# Régénère le client Prisma
npx prisma generate
```

Les 2 migrations critiques sont :
- `20260515_v46_plan_rename_personal_family_pro` → renomme `PREMIUM→PERSONAL`,
  `COMMUNITY→FAMILY`, `PARISH→PRO`, `EVENT→PERSONAL` sur les tables `User`,
  `SubscriptionState`
- `20260516_v47_plan_booster_purchase` → crée la table `PlanBoosterPurchase`

**Vérification post-migration** :
```sql
-- Count users par plan (vérifie qu'on n'a plus de PREMIUM/COMMUNITY/PARISH/EVENT actifs)
SELECT "planCode", COUNT(*) FROM "User" GROUP BY "planCode" ORDER BY 2 DESC;
-- Doit retourner : FREE, PERSONAL, FAMILY, PRO, LIFETIME_PERSONAL (et 0 legacy)

-- Vérifie la table Booster
SELECT COUNT(*) FROM "PlanBoosterPurchase";
-- Doit retourner 0 si jamais utilisée encore
```

---

## 6 · Tests Stripe en mode Test avant de basculer Live

**Tester avec une carte test** sur le mode Test de Stripe :
1. Bascule temporaire des env vars sur les clés **TEST** (`sk_test_...`, `whsec_test_...`)
2. Connecte-toi en tant que user FREE sur l'app
3. Force le quota à 0 (scan 3 factures pour atteindre la limite)
4. Au 4e scan → paywall apparaît
5. Clique « Acheter Pack Booster 4,99 € »
6. Redirige vers Stripe Checkout → utilise carte test :
   - **Succès direct** : `4242 4242 4242 4242`
   - **Demande 3DS** : `4000 0027 6000 3184`
   - **Refus carte** : `4000 0000 0000 0002`
7. Après paiement → revient sur `/dashboard/plans?booster=success`
8. **Vérification BDD** :
   ```sql
   SELECT * FROM "PlanBoosterPurchase" ORDER BY "createdAt" DESC LIMIT 1;
   ```
   La ligne doit exister avec `scansAdded=100`, `scansUsed=0`, `expiresAt = now + 30j`.
9. **Vérification webhook** : dashboard Stripe → Webhooks → liste des events,
   `checkout.session.completed` doit être en `200 OK`.
10. **Vérification scan rétabli** : retourner sur `/dashboard/groups/.../expenses`,
    cliquer Scanner → doit fonctionner (consomme du Booster, pas du quota plan).

**Tester upgrade Perso** :
1. Sur `/dashboard/plans`, cliquer « Passer à Perso · 39 €/an »
2. Redirige vers Stripe Checkout avec le Price ID Perso annuel
3. Paie avec `4242 4242 4242 4242`
4. Revient sur `/dashboard/plans/success`
5. `User.planCode` doit être `PERSONAL`
6. `SubscriptionState.status` doit être `ACTIVE`
7. `SubscriptionState.expiresAt` doit être `now + 1 an`

---

## 7 · Basculer en Live

Une fois TOUS les tests OK en mode Test :

1. Remplacer les env vars par les clés **Live** (`sk_live_...`, `whsec_live_...`)
2. Refaire le webhook config sur le mode Live dans Stripe dashboard
3. Re-déployer
4. **Faire 1 vrai paiement réel** (4,99 €) avec ta propre carte pour validation finale
5. Sur le dashboard Stripe (mode Live) → Payments → vérifier que la transaction
   apparaît avec le bon montant

**Désormais en production live**.

---

## 8 · Communication aux users existants

Une fois la migration faite, prévenir les abonnés actuels (PREMIUM / COMMUNITY /
PARISH / EVENT) que leur plan a été **renommé** mais sans changement de prix
ni de features pour eux :

| Ancien plan | Nouveau nom |
|---|---|
| PREMIUM | PERSO |
| COMMUNITY | FAMILLE |
| PARISH | PRO |
| EVENT | PERSO (avec Pack Booster offert) |

Template email à envoyer (en 27 langues via le système i18n existant) :

> Bonjour {{prénom}},
>
> Bonne nouvelle : ton plan BMD vient d'évoluer 🎉
>
> Ton ancien plan **{{ancienNom}}** s'appelle désormais **{{nouveauNom}}**.
> Aucun changement de prix, et tu gardes toutes tes fonctionnalités —
> on en a même ajouté quelques-unes (voir page Forfaits).
>
> [Voir ton nouveau plan →]
>
> L'équipe BMD

---

## 9 · Monitoring post go-live

À surveiller pendant les premières 48 h :

**Métriques Stripe** :
- Taux de conversion checkout (sessions créées vs sessions completed) → cible > 60 %
- Taux d'échec paiement (carte refusée, 3DS échoué) → < 5 %
- Disputes / chargebacks → 0

**Métriques BMD** :
- Conversions Free → Perso : combien de users franchissent le paywall ?
- Conversions Perso → Famille : si le quota IA pousse les pères de famille ?
- Achats Pack Booster : combien de purchases / jour ?
- Erreurs webhook : `[stripe webhook] handler failed` dans les logs ?

**Sentry / monitoring** :
- Surveiller les erreurs `assertCanUseOcr` (quota dépassé sans paywall affiché ?)
- Surveiller `recordBoosterPurchase` (doublons potentiels malgré idempotence)
- Surveiller `consumeBoosterScan` (race condition possible)

---

## 10 · Rollback si problème majeur

Si un bug critique est détecté en prod :

**Plan A — Rollback code uniquement** :
1. Revenir à la version précédente du backend (git revert + redeploy)
2. Les anciens plans `PREMIUM/COMMUNITY/PARISH/EVENT` sont toujours en base
   (avec `_hidden=true` mais pas supprimés)
3. Remettre `_hidden=false` sur ces plans pour les afficher à nouveau
4. **Note** : les abonnements actifs continuent de fonctionner avec les
   nouveaux planCode (`PERSONAL/FAMILY/PRO`) qui ont les mêmes limites
   que les anciens. **Pas de risque de perte de service**.

**Plan B — Rollback complet incluant la migration users** :
1. Code rollback (Plan A)
2. SQL inverse pour restaurer les anciens planCode :
   ```sql
   UPDATE "User" SET "planCode" = 'PREMIUM' WHERE "planCode" = 'PERSONAL';
   UPDATE "User" SET "planCode" = 'COMMUNITY' WHERE "planCode" = 'FAMILY';
   UPDATE "User" SET "planCode" = 'PARISH' WHERE "planCode" = 'PRO';
   -- Note : on perd la distinction PREMIUM vs EVENT pour les 4% d'EVENT
   ```
3. Désactiver la table Booster temporairement (`UPDATE "Plan" SET "isActive"=false WHERE code='LIFETIME_PERSONAL'`)

**Plan C — Hotfix sans rollback** (préféré si possible) :
- Identifier le bug, patcher uniquement, redéployer.

---

## 11 · Marges réelles attendues

Pour valider que les économies promises se matérialisent, surveiller pendant
30 jours :

| Cohorte | Coût moyen mensuel attendu | Revenu mensuel attendu | Marge attendue |
|---|---|---|---|
| FREE | 0,40 € (3 scans Vision) | 0 € | −0,40 €/user |
| PERSO | 0,15 € (en moy 12 scans Vision) | 3,25 € | **+3,10 €** (95 %) |
| FAMILLE | 2,00 € (60 scans mixte) | 5,75 € | **+3,75 €** (65 %) |
| PRO | 5,80 € (100 scans Mindee) | 16,60 € | **+10,80 €** (65 %) |
| Pack Booster | 0,40 € (100 scans Vision) | 4,99 € one-shot | **+4,59 €** (92 %) |

Si les coûts réels mesurés dépassent ces estimations de **+50 %**, déclencher
un audit du pipeline IA pour identifier la fuite (probablement Mindee appelé
trop souvent en fallback Famille ou Pro).

---

## 12 · Checklist finale go-live

À cocher dans cet ordre **strict** :

- [ ] ENV vars Stripe live configurées sur prod
- [ ] 8 Prices créés dans Stripe Dashboard live
- [ ] Webhook endpoint créé en mode live avec les 6 events
- [ ] Signing secret webhook ajouté à `STRIPE_WEBHOOK_SECRET`
- [ ] Migrations Prisma déployées sur DB prod
- [ ] `prisma generate` exécuté + backend redémarré
- [ ] Console admin : Stripe Price IDs renseignés pour les 4 plans × 2 fréquences
- [ ] Test en mode Test : checkout Perso annuel OK
- [ ] Test en mode Test : checkout Pack Booster OK
- [ ] Test en mode Test : webhook 200 OK pour les 2 events
- [ ] Bascule env vars en mode Live
- [ ] 1 vrai paiement test 4,99 € (Booster) avec ta carte perso
- [ ] Vérification BDD : ligne `PlanBoosterPurchase` créée
- [ ] Sentry / monitoring actifs
- [ ] Email de communication users envoyé via le système i18n
- [ ] Annonce LinkedIn / réseaux : nouvelle grille tarifaire

🎉 **Go live**.

---

## Annexe · Récap technique des changements V46-V49

**Code modifié** :
- `apps/api/src/lib/seed-plans.ts` (refonte complète, +5 plans, +alias legacy)
- `apps/api/src/lib/plan-limits.ts` (+ `assertCanUseVoice`, `getUserIaTier`, `getVoiceUsage`)
- `apps/api/src/lib/booster-service.ts` (nouveau)
- `apps/api/src/modules/ocr/ocr-providers.ts` (pipeline adaptatif 3 niveaux)
- `apps/api/src/modules/ocr/ocr.service.ts` (propage `iaTier`)
- `apps/api/src/modules/ocr/ocr.routes.ts` (consomme Booster post-scan)
- `apps/api/src/modules/voice/voice.routes.ts` (assert voice + endpoint usage)
- `apps/api/src/modules/boosters/boosters.routes.ts` (nouveau · 3 endpoints)
- `apps/api/src/modules/payments/payments.routes.ts` (+ case Booster webhook)
- `apps/api/src/modules/fx/fx.routes.ts` (filtre `_hidden=true`)
- `apps/api/src/server.ts` (enregistre `boostersRoutes`)
- `apps/api/prisma/schema.prisma` (+ `PlanBoosterPurchase`, + `User.boosterPurchases`)
- `apps/web/lib/api-client.ts` (+ 4 méthodes booster + voice usage)
- `apps/web/lib/ui/booster-purchase-card.tsx` (nouveau)
- `apps/web/lib/ui/plan-block.tsx` (`PLAN_VISUALS` étendu)
- `apps/web/app/dashboard/plans/page.tsx` (intègre `BoosterPurchaseCard`)

**Migrations** :
- `20260515_v46_plan_rename_personal_family_pro/migration.sql`
- `20260516_v47_plan_booster_purchase/migration.sql`

**Maquettes** (références visuelles, non déployées en prod) :
- `BMD-V44-mockups.html` — sombre 20 écrans
- `BMD-V45-mockups-clair.html` — clair 20 écrans (référence design)
- `BMD-V46-plans-tarifaires.html` — 6 écrans grille tarifaire

**Tests** :
- `tsc` backend api : 0 erreur
- `tsc` frontend web : 0 erreur
- i18n coverage : 0 clés manquantes sur 25 locales
- Tests E2E Playwright sur flux upgrade : **à faire en V50**

---

*Document maintenu par Fabrice Tsakou · BMD V49 · mai 2026.*
