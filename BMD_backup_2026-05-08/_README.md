# BMD · Sauvegarde du 8 mai 2026

Cette sauvegarde contient **404 fichiers** (62 MB) — tous les fichiers créés ou modifiés pendant le travail Claude × Cowork sur BMD (sprints 0 à AD-3).

## Contenu

- **`_INDEX.txt`** — liste exhaustive des 403 fichiers sauvegardés (paths relatifs).
- **`_README.md`** — ce fichier.
- **`apps/`** — code source backend (`api/`) + frontend (`web/`).
- **`packages/shared-types/`** — types TypeScript partagés.
- **`docs/`** + **`scripts/`** — documentation et scripts utilitaires.
- **`.github/`** — workflows CI/CD.
- Fichiers racine : `BMD_handoff.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `DEPLOYMENT.md`, `SECURITY.md`, `package.json`, `package-lock.json`, `docker-compose.prod.yml`, `.dockerignore`.

## Comment déplacer cette sauvegarde vers iCloud

Le sandbox de Cowork ne peut pas écrire directement vers iCloud Drive. Pour déplacer cette sauvegarde, exécute la commande suivante dans **Terminal sur ton Mac** (un seul copier-coller) :

```bash
SRC="$HOME/Library/Mobile Documents/com~apple~CloudDocs/2 - Investissement/11 - Entreprenariat - FT/2 - Projets Entreprenariaux/3 - Dev WEB/8 - BMD - Back Mes Do/0 - Developpement appli/1 - Projet Initial Claude/1 - Backup Initial"
mkdir -p "$SRC"
# Adapte le chemin source ci-dessous à l'emplacement de ton repo bmd-app/ sur ton Mac
rsync -av --progress "<TON_CHEMIN_LOCAL_BMD-APP>/BMD_backup_2026-05-08/" "$SRC/BMD_backup_2026-05-08/"
echo "✓ Done — $(find "$SRC/BMD_backup_2026-05-08" -type f | wc -l) fichiers copiés."
```

Remplace `<TON_CHEMIN_LOCAL_BMD-APP>` par le path local de ton repo bmd-app sur ton Mac (par exemple `~/Documents/bmd-app` ou similaire — celui que tu as monté dans Cowork).

Alternative plus simple : ouvre le dossier `BMD_backup_2026-05-08/` dans Finder, et **drag-drop** vers la destination iCloud.

## Vérification après copie

Une fois la sauvegarde dans iCloud, tu peux vérifier qu'elle est complète :

```bash
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/2 - Investissement/11 - Entreprenariat - FT/2 - Projets Entreprenariaux/3 - Dev WEB/8 - BMD - Back Mes Do/0 - Developpement appli/1 - Projet Initial Claude/1 - Backup Initial/BMD_backup_2026-05-08"
echo "Fichiers : $(find "$DEST" -type f | wc -l) (attendu : 404)"
echo "Taille  : $(du -sh "$DEST" | cut -f1)"
```
