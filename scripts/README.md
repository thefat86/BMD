# BMD · Scripts utilitaires

Scripts ponctuels qu'on lance à la main (pas dans le code de prod).

## 🚀 Scripts dev tout-en-un (V145)

Trois commandes pour gérer 100% du dev quotidien :

| Tu veux faire | Commande |
|---|---|
| Démarrer le projet (1ère fois ou après reboot) | `npm run up` |
| Repartir clean après un `git pull` ou changement de schema | `npm run reload` |
| Tester sur iOS + Android | `npm run mobile` |

### `npm run up` — Démarrage tout-en-un

Idempotent (peut être relancé sans risque). Enchaîne :
1. Kill processus zombies sur 3000 / 4000
2. Démarre Docker Desktop si pas actif (et attend qu'il soit prêt)
3. Lance Postgres via `docker compose`
4. Attend que la DB accepte les connexions
5. Applique les migrations Prisma + regen client
6. Lance `npm run dev` (turbo : web + api en parallèle)

Options : `npm run up -- --reset` pour purger aussi les caches Next/Turbo.

### `npm run reload` — Reset complet

À utiliser après :
- un `git pull` avec des nouvelles migrations
- un `npm install` de nouvelles deps
- quand le dev server est coincé et ne reflète pas les modifs

Enchaîne : kill tout → `npm install` → délègue à `up --reset`.

### `npm run mobile` — Build iOS + Android

Synchronise le bundle web vers les projets natifs et ouvre les IDE.

Options :
- `npm run mobile -- --ios` : iOS uniquement
- `npm run mobile -- --android` : Android uniquement
- `npm run mobile -- --sync` : synchronise sans ouvrir les IDE (utile en CI)

Prérequis : `npm run up` doit tourner en parallèle dans un autre terminal.

---


## `translate-fallback-locales.ts`

Re-traduit les clés AC-2 + AC-3 actuellement en fallback EN dans les 22
locales non-natives (pt, ar, sw, wo, ln, am, de, it, lb, ru, ja, ko, hi,
zh, pcm, ha, yo, om, ig, ff, zu, ak), via GPT-4o-mini.

### Coût

~ 0,007 € pour les 22 locales × 90 clés (un seul appel par locale).

### Usage

```bash
cd bmd-app
OPENAI_API_KEY="$(grep ^OPENAI_API_KEY apps/api/.env | cut -d= -f2-)" \
  npx --yes ts-node scripts/translate-fallback-locales.ts
```

ou avec Node 22 directement (sans ts-node) :

```bash
OPENAI_API_KEY=sk-... node --experimental-strip-types scripts/translate-fallback-locales.ts
```

### Idempotence

Le script remplace UNIQUEMENT les clés listées dans `KEYS_TO_TRANSLATE`.
Les autres clés (anciens sprints, traductions humaines existantes) ne sont
pas touchées. Re-runnable autant de fois que tu veux — chaque run repart
des sources EN canoniques.

### Anti-régression

Si une traduction GPT te semble fausse, édite manuellement la valeur dans
`apps/web/lib/i18n/app-strings.ts` après run. La prochaine exécution
écrasera ta modification — pour préserver, retire la clé de `KEYS_TO_TRANSLATE`.
