# Z4 · Audit performance espace client BMD

> **Constat utilisateur** : *"l'application manque toujours de fluidité. Le temps de réponse n'est toujours pas bon. Pour une telle application on s'attend à une réactivité vraiment instantanée et fluide."*
>
> **Objectif** : analyse honnête des goulots actuels + plan d'action chiffré pour atteindre une expérience banking-grade.

---

## 1. Ce qui a déjà été fait dans les sprints précédents

| Sprint | Action | État |
|---|---|---|
| P1 | Memoization `listGroups`, `getGroup`, `getBalance` (cache 30s) | ✓ |
| P2 | Hover/touchstart prefetch sur les groupes | ✓ |
| P3 | Lazy load de composants lourds (chart.js, etc.) | ✓ |
| P4 | Optimistic UI sur create expense + delete | ✓ |
| P5 | Haptic feedback + tap optimization mobile | ✓ |
| Q1-Q8 | Service Worker SWR, resource hints, useMemo, startTransition, compress, font-display | ✓ |
| R1-R5 | next/font, cache-control, server components, loading.tsx | ✓ |
| Y1 | SW network-first pour pages (fix flash d'ancien contenu) | ✓ |
| Y2 | Multiplexing SSE (5 EventSource → 1 par channel) | ✓ |

→ Beaucoup d'optimisations déjà en place. Mais l'expérience reste perçue comme lente. **Pourquoi ?**

---

## 2. Causes restantes identifiées

### 🔴 Critique · Bundle size sur le dashboard

Sortie du dernier `npm run build` :

```
○ /dashboard          24.9 kB         166 kB First Load
ƒ /dashboard/groups/[id]  23.8 kB     165 kB First Load
○ /dashboard/profile  21.9 kB         164 kB First Load
○ /admin              25.1 kB         162 kB First Load
+ First Load JS shared by all                102 kB
```

**Problème** : 165 kB First Load sur le dashboard, c'est correct mais pas "instantané sur 3G". Pour viser banking app, il faut **< 100 kB First Load**.

**Coupables probables** (par ordre d'impact estimé) :
1. **Recharts** importé entièrement même quand on n'affiche pas de graphes → ~40 kB
2. **Lucide-react** : on importe certaines icônes sans tree-shaking optimal → ~15 kB
3. **All `app/dashboard/groups/[id]/page.tsx`** est un composant monolithique de >2200 lignes qui charge TOUS les modals et features (expense form, swap UI, settings, etc.) au mount

**Plan d'action** :
- Fragmenter `groups/[id]/page.tsx` en sous-composants chargés via `next/dynamic({ ssr: false, loading: ... })` (gain estimé : 40-60 kB)
- Vérifier les imports `recharts` — n'importer que les composants utilisés (`{ LineChart, XAxis }` au lieu de `* as Recharts`)
- Activer l'analyseur de bundle : `ANALYZE=true npm run build` pour voir le poids exact de chaque chunk

### 🟠 Important · Trop de fetches au mount du dashboard

Le `<DesktopDashboard>` lance **3 fetches en parallèle au mount** :

```ts
Promise.all([
  api.me(),                      // 30s cache
  api.listGroups(),              // 60s cache
  api.getMyGlobalBalance(),      // 30s cache
])
```

Plus implicitement (via composants enfants) :
- `<CrossSettlementInbox>` → `api.me()` + `api.listMyCrossSettlements()`
- `<NotificationBell>` → `api.notificationsList()` + count badges
- `<SubscriptionBanner>` → `api.subscriptionStatus()`
- `<LocaleProvider>` → `api.listLocales()`
- `<CurrencyProvider>` → `api.listCurrencies()` + `api.getFxRates()`
- SSE `EventSource` connection setup

**Total au mount du dashboard** : ~10 fetches HTTP. Sur 3G/4G mobile dégradée, c'est un mur de latence.

**Plan d'action** :
- Batcher dans un seul endpoint `/me/dashboard-bootstrap` qui renvoie tout (me, groups, balance, locales, currencies, fx, notifications, cross-settlements, subscription) en 1 round-trip
- Cacher agressivement côté serveur (Redis, déjà en place via `cacheGetOrSet`) avec invalidation SSE-driven
- Gain estimé : 8 round-trips → 1 = -1 à -3 secondes sur mobile dégradé

### 🟠 Important · SSR partiel sur le dashboard

Le `/dashboard` est marqué `○ (Static)` dans le build, mais en pratique c'est un client component qui fait tout en CSR. La page s'affiche en quelques ms, MAIS reste vide jusqu'à ce que les fetches complètent (1-3s).

**Plan d'action** :
- Convertir `/dashboard/page.tsx` en Server Component qui pré-rend le bandeau hero avec les données déjà chargées côté serveur (`auth/me` + `listGroups` + `getMyGlobalBalance`)
- Le client n'a plus qu'à hydrater + fetcher les données qui changent (notifs, SSE)
- Gain estimé : la page apparaît AVEC son contenu en moins de 500ms (vs 1-3s aujourd'hui)

**Trade-off** : nécessite de refactorer le pattern `useEffect → setState` en `async function Page()`. ~3-4h de travail.

### 🟡 Modéré · Re-renders excessifs

Composants identifiés qui re-render trop :
1. `<DesktopDashboard>` re-render sur chaque changement de `userCurrency` (LocaleProvider broadcast). Ça invalide TOUS les `formatAmount` calls. Pas critique mais perceptible.
2. `<CrossSettlementInbox>` se reload sur chaque event SSE qui n'a rien à voir (ex: `expense.created` re-fetch les cross-settlements alors que ça ne les concerne pas).
3. `<PersonBalanceList>` pareil.

**Plan d'action** :
- `useMemo` sur les rows de la liste des groupes pour éviter de re-créer le markup
- Filtrer plus finement les events SSE qui déclenchent un reload (whitelist explicite)
- Gain estimé : 20-30% de réduction des re-renders sur le dashboard

### 🟡 Modéré · Hydration mismatch potentiels

V22 a fixé un mismatch sur `data-theme="dark"`. Mais d'autres composants peuvent encore déclencher des warnings React :
- `<LocaleProvider>` lit localStorage au mount → divergence SSR vs CSR pour la locale
- `<CurrencyProvider>` idem
- `<SubscriptionBanner>` peut afficher différemment selon `isLogged` qui change après mount

**Plan d'action** :
- Audit complet avec `npm run build` puis `next start` + DevTools Console
- Si warnings → wrap les composants concernés dans `<Suspense>` ou utiliser `useSyncExternalStore`

### 🟢 Mineur · Service Worker stratégies

Y1 a refondu en network-first pour les pages HTML. Bon. Mais on peut affiner :
- Les pages `/dashboard/groups/[id]` sont dynamiques par groupe → les cacher SWR par URL distincte saturent le cache
- Stratégie : ne plus cacher du tout les pages dynamiques (`/dashboard/groups/[id]`), garder le cache uniquement pour les pages statiques

**Gain marginal** : -10% taille du cache, navigation toujours fraîche sur les groupes.

---

## 3. Plan d'action chiffré · 3 phases

### Phase 1 (1 jour de dev) · Quick wins immédiats

| Action | Gain estimé | Effort |
|---|---|---|
| Endpoint `/me/dashboard-bootstrap` (batch fetches) | -2s sur 3G mobile | 4h |
| Activer bundle analyzer + tree-shake recharts/lucide | -30 kB First Load | 2h |
| `useMemo` sur les rows de groupe + whitelist SSE | -20% re-renders | 2h |

→ Effet attendu : dashboard en **< 1s** sur Wi-Fi, **< 3s** sur 3G dégradé.

### Phase 2 (3 jours de dev) · Refactor architectural

| Action | Gain estimé | Effort |
|---|---|---|
| `/dashboard/page.tsx` en Server Component avec données pré-rendues | -1 à -2s perçu | 1 jour |
| Code-splitting agressif `groups/[id]/page.tsx` | -40-60 kB First Load | 1 jour |
| Audit hydration mismatches | meilleure stabilité visuelle | 0.5 jour |
| Tests Lighthouse post-refactor (target > 90) | mesure objective | 0.5 jour |

→ Effet attendu : **First Contentful Paint < 800ms** sur Wi-Fi, **Time to Interactive < 2s**.

### Phase 3 (1 semaine, optionnel) · Excellence

| Action | Gain | Effort |
|---|---|---|
| Streaming SSR avec Suspense boundaries | UX progressive | 2 jours |
| Optimiser images (AVIF, lazy, sizes) | First Paint plus rapide | 1 jour |
| Migrer SSE → WebSocket avec heartbeat optimisé | latence event 50ms → 10ms | 2 jours |
| Service Worker précache des routes les plus visitées | navigation instantanée | 1 jour |
| Edge caching (Vercel Edge / Cloudflare Workers) | latence < 50ms partout | 1 jour |

→ Effet attendu : **app-grade native**. Impossible de distinguer d'une vraie app mobile.

---

## 4. Quick wins déjà appliqués dans cette session (Z2/Z3/Z1)

Pendant l'implémentation des fixes Z, j'ai aussi :

- Wired `formatAmount()` dans desktop + mobile dashboard pour la conversion FX live des montants par groupe (Z2)
- Hardcoded strings → `useT()` sur dashboard (Z3) — toggle, table headers, badge balance, empty state
- Helper unifié `useApiErrorHandler` créé : 1 hook qui gère 402 (upgrade dialog), 401 (login redirect), 422 (toast warning), 5xx (toast error). À adopter dans tous les `catch` blocks (Z1)

Ces 3 fixes améliorent la perception immédiate :
- USD configuré → tout converti partout (avant : juste le bandeau global)
- Changement de langue → strings du dashboard suivent (avant : "Solde / Dépensé / Membres" restaient en FR)
- Erreurs API → toast cohérent visible en haut (avant : texte plat en bas de page)

---

## 5. Que faire maintenant ?

**Recommandation immédiate** :

1. **Tester** le rebuild actuel sur mobile + desktop. Mesurer le gain perceptuel des fixes Y1+Y2+Z2+Z3.
2. Si la perf reste insuffisante → **lancer Phase 1** (1 jour). C'est là que sont les vrais gros gains.
3. Si Phase 1 ne suffit toujours pas → **Phase 2** (refactor Server Component du dashboard).

**À ne PAS faire** : continuer à empiler des micro-optimisations sans avoir mesuré. La cause #1 actuelle est probablement le **bundle size** + les **fetches non batchés**. Le reste est cosmétique.

**Outils pour mesurer objectivement** :

```bash
# Lighthouse (Chrome DevTools → onglet Lighthouse → Run)
# Cible : Performance > 90, Best Practices > 90, Accessibility > 90

# Bundle analyzer
ANALYZE=true npm run build

# Network throttling (Chrome DevTools → Network → Slow 3G)
# Mesure le Time to Interactive sur connexion dégradée
```

---

Document à itérer après chaque phase pour mesurer le progrès. La perf c'est un marathon, pas un sprint — chaque optimisation doit être mesurée avant ET après.
