# BMD · Scripts utilitaires

Scripts ponctuels qu'on lance à la main (pas dans le code de prod).

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
