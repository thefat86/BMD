# V26 · Audit · Vue par groupe / Vue par personne

> **TL;DR** — Aujourd'hui le dashboard affiche les soldes **par groupe**. L'utilisateur veut pouvoir basculer en **vue par personne** (« combien Karim me doit toutes activités confondues »). Ce document audite l'existant, propose un design propre et liste les étapes d'implémentation **avant tout changement de code**.
>
> Aucune modification n'est appliquée — c'est un rapport pour validation.

---

## 1. Ce qui existe aujourd'hui (mai 2026)

### 1.1 Modèles Prisma concernés

| Modèle | Rôle |
|---|---|
| `Expense` | Une dépense d'un groupe avec `paidById` + `groupId` + `amount` + `currency`. |
| `ExpenseShare` | La part dûe par `userId` pour une `expenseId` (somme = 100% de la dépense). |
| `Settlement` | Un règlement explicite entre `fromUserId` et `toUserId` **dans un `groupId` donné**, avec un `status` (`PROPOSED` → `PAID` → `CONFIRMED`). |
| `SettlementPaymentToken` | Token public 14 j pour qu'un débiteur invité confirme un paiement sans compte. |

> ⚠️ **Point crucial** : `Settlement.groupId` est NOT NULL. Aujourd'hui un règlement existe **toujours dans un seul groupe**.

### 1.2 Service de calcul · `apps/api/src/modules/settlements/balance.service.ts`

Trois fonctions principales :

**`computeBalances(groupId, actorUserId)`** — Pour UN groupe donné :
- Charge toutes les `Expense` + leurs `shares`.
- Pour chaque membre : `net = sum(amount où il a payé) − sum(amountOwed sur ses shares)`.
- Retourne `{ currency, balances: UserBalance[] }`.
- N'inclut PAS les `Settlement` confirmés dans le calcul → le solde brut. (Voir §1.4 pour la subtilité.)

**`simplify(balances, currency)`** — Greedy "minimum cash flow" : matche le plus gros créancier avec le plus gros débiteur jusqu'à ce que tout le monde soit à zéro. Renvoie une liste de `SuggestedSettlement` { from, to, amount, currency }.

**`computeUserGlobalBalance(userId)`** — Pour UN utilisateur, sur **tous ses groupes** :
- Itère `groupMember.findMany({ userId })`.
- Pour chaque groupe : appelle `computeBalances(groupId, userId)`, prend `balances.find(b.userId === userId).net`.
- Convertit chaque solde dans la devise de l'utilisateur via `convert()` du module FX.
- Retourne `{ net, owedToMe, iOwe, primaryCurrency, byCurrency, groupCount }`.

> ⚠️ **Limite de l'agrégat actuel** : on n'a JAMAIS `byPerson` — on perd l'information "qui doit à qui" en route. La vue est purement scalaire (un grand total).

### 1.3 Endpoints API

| Endpoint | Renvoie |
|---|---|
| `GET /groups/:id/balance` | Vue **par groupe** : `{ currency, balances[], suggestions[] }`. |
| `GET /me/global-balance` | Vue agrégée scalaire (cf. §1.2). |
| `POST /groups/:id/settlements` | Crée un règlement attaché à un groupe. |
| `POST /settlements/:id/confirm` | Le créancier confirme la réception. |

### 1.4 Comment `Settlement` interagit avec `computeBalances`

`computeBalances` se base **uniquement** sur les `Expense` + `ExpenseShare`. Les `Settlement` confirmés ne sont **pas** soustraits du net… **sauf** quand un `Settlement` est confirmé : un job (à vérifier — probable hook ailleurs) crée une **Expense compensatoire** ou laisse le solde à 0 par convention. À auditer pendant l'implémentation. Si ce n'est pas le cas, il faudra inclure les Settlements CONFIRMED dans le calcul.

→ **Action de rappel** : ouvrir `apps/api/src/modules/settlements/settlements.routes.ts` et chercher le path post-`CONFIRMED`. Si rien ne crée d'Expense, alors aujourd'hui les `Settlement` n'affectent pas `computeBalances` et le solde reste figé jusqu'à ce que de nouvelles `Expense` viennent compenser. C'est probablement un bug latent à corriger en parallèle de V26.

### 1.5 UI Dashboard actuelle

`apps/web/lib/ui/desktop-dashboard.tsx` (et son équivalent `mobile-dashboard.tsx`) :
- Bandeau du haut : « Tu dois X · On te doit Y · Net = Z » (lit `/me/global-balance`).
- Bloc principal : liste des groupes, chaque ligne montre **son net dans ce groupe** (lit `/groups/:id/balance` à la demande, ou un préchargement memoïsé).
- Détail d'un groupe : ligne par membre + bouton « Régler » → crée un `Settlement` ciblé.

→ Il n'y a **aucune vue qui agrège « ce que telle personne me doit, tous groupes confondus »**.

---

## 2. Ce que veut l'utilisateur (vue par personne)

> *« Lorsqu'on est dans le dashboard sur l'espace client depuis l'appli mobile ou le compte depuis le PC, on voit le solde ligne par ligne sur les vues groupe... est-ce que tu peux permettre que dans cette page on ait deux vues ? vue groupe et vue personne. »*

Concrètement, **vue par personne** veut dire :

> *Karim me doit 142 € net (= 80 € sur Voyage Lisbonne + 100 € sur Coloc Bordeaux − 38 € que je lui dois sur le tontine de Noël).*

Avantages :
- Lecture humaine immédiate quand on partage la vie avec quelqu'un sur **plusieurs groupes** (ex: ma sœur = coloc + voyages + cadeaux famille).
- Permet de **régler en 1 fois** des dettes qui sont aujourd'hui éparpillées sur 3 groupes différents.
- Évite les doubles paiements (« je t'ai payé sur le voyage… mais sur le coloc tu me dois encore… »).

---

## 3. Design proposé · 4 couches

### 3.1 Couche calcul · `computePersonBalances(actorUserId)`

Nouveau service dans `balance.service.ts` :

```ts
export interface PersonBalance {
  counterpartyUserId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Net positif → cette personne te doit. Négatif → tu lui dois. */
  net: Decimal;
  /** Devise (celle de l'utilisateur, après conversion FX). */
  currency: string;
  /** Détail par groupe — utile pour drill-down. */
  byGroup: Array<{
    groupId: string;
    groupName: string;
    net: Decimal;
    currency: string; // devise d'origine (avant conversion vers user.currency)
  }>;
  /** Combien de groupes vous partagez. */
  sharedGroups: number;
}

export async function computePersonBalances(actorUserId: string): Promise<{
  primaryCurrency: string;
  hasConversion: boolean;
  people: PersonBalance[];
}>
```

**Algorithme** :
1. Récupère tous les `groupMember` de `actorUserId` → liste des groupIds.
2. Pour chaque group : `computeBalances(groupId, actorUserId)`.
3. Pour chaque autre membre du groupe : accumule dans une `Map<counterpartyUserId, accumulator>`. La valeur ajoutée vaut :
   - `+myNet * (theirNet < 0 ? share / sumOfNegatives : 0)` sur les expenses où ils sont créditeurs alors que je suis débiteur, et symétriquement.
   - **Plus simple en pratique** : utiliser `simplify(balances, currency)` puis filtrer les paires `(actor, X)` ou `(X, actor)`. Mais ça force à passer par la simplification, qui est *par groupe*. Or on veut le **net réel par paire**, pas la suggestion de cash-flow.

**Algo retenu (plus rigoureux)** : pour chaque groupe, parcourir ses `Expense` :
- Si `actor` a payé et `X` a une `share` → `X` me doit `share.amountOwed` (en devise du groupe).
- Si `X` a payé et `actor` a une `share` → je dois à `X` `share.amountOwed`.

→ Net pair-à-pair = somme algébrique sur tous les groupes, après conversion FX vers `user.defaultCurrency`.

> **Coût** : O(N) sur le total des expenses où l'actor est impliqué. Acceptable pour un utilisateur moyen (< 1 000 expenses). Si scaling pose problème, ajouter un cache 60 s sur la clé `personBalances:${userId}` (déjà la même stratégie que `getMyGlobalBalance`).

### 3.2 Couche API · `GET /me/balances/by-person`

Nouvelle route :

```
GET /me/balances/by-person?currency=EUR
→ {
    primaryCurrency: "EUR",
    hasConversion: true,
    people: [
      {
        counterpartyUserId: "...",
        displayName: "Karim",
        avatarUrl: "...",
        net: "142.50",
        currency: "EUR",
        sharedGroups: 3,
        byGroup: [
          { groupId: "...", groupName: "Voyage Lisbonne",  net: "80.00",  currency: "EUR" },
          { groupId: "...", groupName: "Coloc Bordeaux",  net: "100.00", currency: "EUR" },
          { groupId: "...", groupName: "Tontine Noël",     net: "-37.50", currency: "EUR" },
        ],
      },
      ...
    ]
  }
```

Query param optionnel `currency` pour forcer une devise différente de `user.defaultCurrency` (utile si l'utilisateur veut voir « tout en CFA »).

Cache 30 s par `userId` (le calcul est lourd en lecture, et la donnée bouge toutes les fois qu'une expense est créée — invalidation via le hook `expense.created` du SSE).

### 3.3 Couche client · `apps/web/lib/api-client.ts`

```ts
getMyBalancesByPerson: (currency?: string) =>
  request<{ primaryCurrency: string; hasConversion: boolean; people: PersonBalance[] }>(
    "GET",
    `/me/balances/by-person${currency ? `?currency=${currency}` : ""}`,
  ),
```

### 3.4 Couche UI · Toggle dans le dashboard

Sur `desktop-dashboard.tsx` et `mobile-dashboard.tsx` : ajouter au-dessus du bloc « Mes groupes » un sélecteur :

```
[ Vue par groupe ]   [ Vue par personne ]
```

- **Par groupe** = comportement actuel (on garde tout intact).
- **Par personne** = on remplace le bloc « Liste des groupes » par une liste de cartes :

```
┌────────────────────────────────────────────────┐
│ 👤 Karim Diallo                  +142,50 €    │
│ 3 groupes · clic pour détail              ›    │
└────────────────────────────────────────────────┘
┌────────────────────────────────────────────────┐
│ 👤 Linda Mbeki                    −60,00 €    │
│ 2 groupes · clic pour détail              ›    │
└────────────────────────────────────────────────┘
```

Au clic → drawer/modal qui montre `byGroup` :

```
Karim te doit 142,50 € au total :
  • Voyage Lisbonne  +80,00 €  →  [Régler]
  • Coloc Bordeaux  +100,00 €  →  [Régler]
  • Tontine Noël    −37,50 €  →  [Tu dois → Régler]
```

L'état du toggle est persistant via `localStorage.bmd_dashboard_view = "byGroup" | "byPerson"`.

### 3.5 (Optionnel · phase 2) · Settlement multi-groupe

**Problème** : aujourd'hui régler 142,50 € à Karim quand la dette est éclatée sur 3 groupes nécessite **3 settlements** (un par groupe). UX cassée.

**Proposition pour phase 2** (NE PAS FAIRE en V26) :
- Soit on relâche la contrainte `Settlement.groupId NOT NULL` (lourd : ledger casse).
- Soit on crée un nouveau modèle `CrossGroupSettlement` qui contient une liste de `SettlementChild` (un par groupe affecté), avec une transaction atomique qui les passe tous à `CONFIRMED` ensemble.
- Côté UI : un seul bouton « Régler 142,50 € à Karim » qui crée la grappe de child settlements en backend.

→ À discuter une fois la vue par personne en place et utilisée.

---

## 4. Plan d'implémentation V26 (si tu valides ce design)

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| 1 | Vérifier le hook post-`CONFIRMED` (les Settlement confirmés sont-ils inclus dans `computeBalances` ?) — fixer si bug | `settlements.routes.ts` + `balance.service.ts` | 30 min |
| 2 | Implémenter `computePersonBalances(userId)` avec le détail `byGroup` + conversion FX | `balance.service.ts` | 1 h |
| 3 | Ajouter route `GET /me/balances/by-person` avec cache 30 s | `settlements.routes.ts` | 20 min |
| 4 | Ajouter `getMyBalancesByPerson` dans api-client | `api-client.ts` | 5 min |
| 5 | Toggle « Par groupe / Par personne » sur desktop-dashboard | `desktop-dashboard.tsx` | 45 min |
| 6 | Toggle équivalent sur mobile-dashboard (UX bottom-sheet plus naturel sur mobile) | `mobile-dashboard.tsx` | 45 min |
| 7 | Drawer détail par personne (clic sur une ligne) | nouveau composant `<PersonBalanceDetail>` | 30 min |
| 8 | Tests E2E : « voir Karim me doit X tous groupes confondus » | `apps/e2e/tests/dual-view.spec.ts` | 30 min |
| 9 | Traduction des nouveaux strings dans 27 locales | `i18n/app-strings.ts` | 30 min |
| 10 | TS check + CHANGELOG V26 | — | 10 min |

**Total estimé** : ~5 h pour V26 phase 1 (vue lecture seule). Phase 2 (settlement multi-groupe) = autre sprint.

---

## 5. Points de vigilance

1. **Conversion FX** : si l'utilisateur a un solde de +50 EUR sur un groupe et −20 GBP sur un autre, on les convertit tous les deux dans `user.defaultCurrency` avant somme. Si la conversion échoue (devise hors-table), on l'expose dans `byGroup` avec un disclaimer mais on l'exclut de la somme net.

2. **Confidentialité** : la vue par personne ne doit montrer que les contreparties avec qui l'utilisateur **a au moins un groupe en commun**. On ne doit jamais leaker des soldes de groupes auxquels il n'appartient pas.

3. **Performance** : O(N expenses × M membres) par requête. Cache 30 s + invalidation SSE est suffisant pour < 10 k users. À surveiller sur la grosse cohorte tontine (PARISH plan = 100+ membres × 100+ expenses).

4. **Affichage à zéro** : ne pas montrer les contreparties avec un net = 0 (sauf si l'utilisateur clique sur "Voir tout"). Sinon la liste devient illisible après quelques mois d'usage.

5. **Soldes croisés** : si Karim me doit 80 € sur le voyage et je lui dois 100 € sur le coloc → on affiche le net (= je lui dois 20 €). C'est ce que l'utilisateur attend (= comportement Tricount / Splitwise).

6. **Cohérence cross-device** : le toggle vit dans localStorage, donc desktop et mobile peuvent diverger temporairement. Acceptable — c'est une préférence d'affichage, pas une donnée métier.

---

## 6. Décisions à confirmer

- [ ] On limite V26 à la **vue lecture seule** ? (= phase 1, ~5 h). Phase 2 (settlement multi-groupe) en sprint dédié.
- [ ] Le toggle est-il **persisté en localStorage** (préférence client uniquement) ou en DB sur `User.preferredDashboardView` (synchronisé multi-device) ? Recommandation : localStorage en V26, DB plus tard si demande.
- [ ] L'algo de calcul utilise-t-il les `Settlement CONFIRMED` ou seulement les `Expense` ? À auditer avant V26 (cf §1.4).
- [ ] Les contreparties à net = 0 sont-elles **cachées par défaut** ou **affichées avec un badge "à jour"** ?

→ Une fois ces 4 décisions tranchées, on peut lancer V26 phase 1.
