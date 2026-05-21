# Contributing à BMD

## 🌍 Règle d'or i18n : « 0 string FR hardcodée dans l'espace client »

L'app sert une diaspora multilingue (25 locales actives). Un utilisateur
chinois, hindi ou yoruba qui voit du français dans son interface, c'est un
bug **bloquant**. Cette section est la convention que tout contributeur
doit suivre — sans exception.

### ✅ À FAIRE pour tout nouveau code

#### 1. Tout texte UI passe par `t()`

```tsx
import { useT } from "../../lib/i18n/app-strings";

function MyComponent() {
  const t = useT();
  return <button>{t("common.save")}</button>;
}
```

Pas de `<button>Enregistrer</button>` ni de `placeholder="Ton nom"`.

#### 2. Variables ⇒ placeholders dans la clé

```tsx
// ❌ NON
toast.success(`${user.name} a rejoint le groupe`);

// ✅ OUI
// Dans app-strings.ts (FR) :
//   "group.memberJoined": "{name} a rejoint le groupe"
toast.success(t("group.memberJoined", { name: user.name }));
```

#### 3. Ajouter une clé = ajouter dans les 25 locales

Le catalog vit dans `apps/web/lib/i18n/app-strings.ts`. Quand tu ajoutes une
clé, tu **dois** :

1. La rédiger nativement en `fr` + `en` + `es` (les 3 piliers)
2. La copier en fallback EN dans les 22 autres locales
3. Lancer le script de retraduction GPT pour la finaliser :
   ```bash
   OPENAI_API_KEY="$(grep ^OPENAI_API_KEY apps/api/.env | cut -d= -f2-)" \
     node --experimental-strip-types scripts/translate-fallback-locales.ts
   ```

Sinon le test CI `npm run i18n:check` fail.

### 🔍 Vérification avant commit

```bash
cd apps/web
npm run i18n:check          # vérifie couverture clés FR vs autres
npm run i18n:audit          # détecte strings FR hardcodées
npm run typecheck           # TypeScript strict
```

Pour CI strict (zéro tolérance) :
```bash
npm run i18n:check:strict   # exit 1 si UNE clé manque
npm run i18n:audit:strict   # exit 1 si UNE string FR hardcodée
```

### 📧 Templates email (apps/api/src/lib/email-templates.ts)

Mêmes règles, mais pour ces templates :
- **14 langues natives** (fr/en/es/pt/ar/de/it/sw/wo/ln/am/ja/ko/zh) : copy
  écrite à la main
- **11 langues fallback EN** (ru/lb/hi/pcm/ha/yo/om/ig/ff/zu/ak) :
  reçoivent automatiquement la version EN via `pickCopy()`

Quand tu ajoutes un nouveau template :
1. Crée le `Partial<Record<EmailLocale, ...>>` avec au minimum FR et EN
2. Utilise `pickCopy(MY_COPY, locale, payload)` au lieu de `MY_COPY[locale]`
3. Ajoute des copies natives pour les langues importantes au fil du temps

### 🚫 Exceptions (peuvent rester en FR)

- `apps/web/app/admin/**` — console admin (interne)
- `apps/web/lib/ui/admin-*.tsx` — composants admin
- `apps/web/lib/i18n/app-strings.ts` — le catalog lui-même
- `apps/web/app/cms/**` — déjà multilingue via DB
- Commentaires de code (`// ...`)
- Logs console (`console.log/warn/error`)

### 🤖 Workflow recommandé pour ajouter une grosse feature

1. Code la feature avec strings FR temporaires
2. Lance `npm run i18n:audit` pour lister tout ce qui doit être extrait
3. Crée un script Python type `add-XXX-i18n.py` (cf. existants comme
   `add-ac5-i18n.py` à la racine du repo) qui ajoute les nouvelles clés
   dans les 25 locales d'un coup
4. Remplace les strings FR par `t("xxx.yyy")` dans tes fichiers
5. Lance `npm run i18n:check` pour valider la couverture
6. Lance le script GPT pour retraduire les fallback EN nativement

---

## 📦 Setup dev

```bash
git clone ...
cd bmd-app
npm install
npm run db:up        # Postgres via docker
npm run db:deploy    # migrations Prisma
npm run dev
```

Voir `DEPLOYMENT.md` pour la prod.

## 📝 Conventions commit

- Imperatif : `"feat: add multi-payeurs editor"` (pas "added")
- Préfixe : `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `i18n:`
- Référence le sprint si pertinent : `feat(AC-5): add i18n coverage check`
