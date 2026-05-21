# Post `db:generate` cleanup checklist

> Ce document liste les `(prisma as any)` casts ajoutés pendant les sprints
> V23 (SiteConfig) et V30 (CrossGroupSettlement) qui peuvent être enlevés
> **dès que le client Prisma est régénéré** sur l'environnement local.
>
> Ces casts sont strictement défensifs : le code fonctionne en production
> dès que la migration est appliquée et `prisma generate` exécuté.

## Pourquoi ces casts existent

Le sandbox de développement n'a pas accès au binaire Prisma (`prisma generate`
échoue avec un 403 sur le download du moteur). Les modèles ajoutés au schéma
ne sont donc pas connus du client TypeScript généré, et `tsc` refuse
`prisma.crossGroupSettlement.create(...)` en disant que la propriété n'existe pas.

Pour ne pas bloquer la livraison, on cast `prisma as any` aux endroits qui
utilisent ces modèles non-encore-générés. C'est sûr — le runtime Prisma sait
gérer ces modèles dès que la migration est appliquée.

## Action requise (1 fois, en local)

```bash
cd apps/api
npm run db:generate    # régénère le client avec les nouveaux modèles
npm run db:migrate     # applique les migrations en attente
```

## Casts à enlever après `db:generate`

### V23 · SiteConfig (déjà documenté dans CHANGELOG V23)

```
apps/api/src/modules/admin/admin.routes.ts          (~3 occurrences)
apps/api/src/modules/fx/fx.routes.ts                (~1 occurrence)
```

Pattern : `(prisma as any).siteConfig.findUnique/upsert/...`

→ Remplacer par `prisma.siteConfig.*` standard.

### V30 · CrossGroupSettlement

```
apps/api/src/modules/settlements/cross-group-settlement.service.ts
  - 4 occurrences de `(tx as any).crossGroupSettlement.*` ou `(tx as any).settlement.*`
  - 1 occurrence `(prisma as any).crossGroupSettlement.findUnique`
  - 2 occurrences `px.crossGroupSettlement.update` / `px.settlement.updateMany`
    (où `px = prisma as any`)

apps/api/src/modules/settlements/settlements.routes.ts
  - 1 occurrence dans `GET /me/cross-settlements`
  - 1 type annotation `(c: any)` dans le map ; `(ch: any)` aussi
```

Recherche programmatique :

```bash
grep -rn "prisma as any\|tx as any\|(c: any)\|(ch: any)" apps/api/src \
  | grep -v node_modules \
  | grep -v ".d.ts"
```

Une fois `db:generate` exécuté, ces casts deviennent inutiles. Le TS check
passe sans eux. Pour vérifier :

```bash
cd apps/api && npx tsc --noEmit
```

## Ne PAS toucher

Certains casts `as any` sont **volontaires** et restent même après
`db:generate` :

- Les casts dans `admin.routes.ts` pour `payload as any` (champ JSON Prisma
  qui n'a pas de type strict côté TS — c'est attendu).
- Les casts dans les helpers de filtres dynamiques (où le type Prisma serait
  trop restrictif pour exprimer l'union de tous les filtres possibles).

Si en doute, vérifier que **enlever le cast déclenche bien une erreur TS
liée à un champ inconnu d'un modèle** (= cast V23/V30 à supprimer) versus
**erreur de typage générique JSON ou union complexe** (= cast à garder).

---

Ce TODO disparaît du repo dès qu'il est exécuté en local et que les casts
sont enlevés. La PR de nettoyage devrait contenir uniquement des suppressions
de `as any`/`(tx as any)` et l'ajout de tests de non-régression.
