#!/usr/bin/env python3
"""
V133 — Injecte proprement FIREBASE_SERVICE_ACCOUNT_JSON dans .env.

Usage :
    python3 scripts/setup-firebase-env.py <chemin/vers/firebase-adminsdk.json>

Le script :
  1. Backup .env → .env.bak.<timestamp>
  2. Lit le JSON Firebase, valide qu'il est parseable
  3. Supprime TOUTES les anciennes lignes FIREBASE_SERVICE_ACCOUNT_JSON
     (mono ou multi-ligne) du .env
  4. Ajoute une seule variable, JSON aplati sur 1 ligne
  5. Vérifie que tout est OK

Robuste face à :
  - JSON multi-ligne dans .env (PEM keys avec vrais \n)
  - Doublons (3+ entrées empilées)
  - Commentaires associés à nettoyer aussi
"""
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/setup-firebase-env.py <chemin/vers/firebase.json>")
        sys.exit(1)

    json_path = Path(sys.argv[1]).expanduser().resolve()
    env_path = Path(".env").resolve()

    if not json_path.is_file():
        print(f"❌ Fichier introuvable: {json_path}")
        sys.exit(1)

    if not env_path.is_file():
        print(f"❌ .env introuvable dans {env_path.parent}")
        sys.exit(1)

    # 1. Backup
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = env_path.parent / f".env.bak.{ts}"
    shutil.copy(env_path, backup)
    print(f"✅ Backup → {backup.name}")

    # 2. Lire et valider le JSON
    with open(json_path) as f:
        try:
            firebase_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"❌ JSON invalide: {e}")
            sys.exit(1)

    project_id = firebase_data.get("project_id")
    client_email = firebase_data.get("client_email")
    if not project_id or not client_email:
        print("❌ Le JSON ne ressemble pas à un service account Firebase")
        sys.exit(1)

    print(f"✅ JSON valide · project_id={project_id} · client_email={client_email}")

    # 3. Aplatir en 1 ligne
    flat = json.dumps(firebase_data, separators=(",", ":"))
    print(f"✅ Aplati: {len(flat)} caractères")

    # 4. Nettoyer .env : supprimer tout bloc FIREBASE existant (1 ligne ou N lignes)
    with open(env_path) as f:
        lines = f.readlines()

    cleaned = []
    inside = False
    removed = 0
    for line in lines:
        if line.startswith("FIREBASE_SERVICE_ACCOUNT_JSON="):
            inside = True
            removed += 1
            if line.rstrip().endswith("}'") or line.rstrip().endswith('}"'):
                inside = False
            continue
        if inside:
            if line.rstrip().endswith("}'") or line.rstrip().endswith('}"'):
                inside = False
            continue
        # Supprime commentaires V133 orphelins
        if line.strip().startswith("# V133 — Firebase"):
            continue
        cleaned.append(line)

    # Squeeze blank lines
    out = []
    prev_blank = False
    for line in cleaned:
        if line.strip() == "":
            if prev_blank:
                continue
            prev_blank = True
        else:
            prev_blank = False
        out.append(line)

    # Assure une newline finale
    if out and not out[-1].endswith("\n"):
        out[-1] = out[-1] + "\n"

    # 5. Ajouter la variable proprement
    out.append("\n")
    out.append("# V133 — Firebase service account (push Android FCM)\n")
    out.append(f"FIREBASE_SERVICE_ACCOUNT_JSON='{flat}'\n")

    with open(env_path, "w") as f:
        f.writelines(out)

    print(f"✅ Nettoyage: {removed} entrée(s) FIREBASE supprimée(s)")
    print(f"✅ Nouvelle variable injectée sur 1 ligne")

    # 6. Vérif finale
    with open(env_path) as f:
        content = f.read()

    matches = re.findall(r"^FIREBASE_SERVICE_ACCOUNT_JSON=", content, re.MULTILINE)
    if len(matches) != 1:
        print(f"❌ Trouvé {len(matches)} entrées FIREBASE (devrait être 1)")
        sys.exit(1)

    # Test parse final (simulant ce que Node fait)
    m = re.search(r"FIREBASE_SERVICE_ACCOUNT_JSON='([^']+)'", content)
    if not m:
        print("❌ Variable mal formée après injection")
        sys.exit(1)

    try:
        parsed = json.loads(m.group(1))
        assert parsed["project_id"] == project_id
    except Exception as e:
        print(f"❌ Re-parse échoué: {e}")
        sys.exit(1)

    print(f"")
    print(f"✅ ✅ ✅  TOUT EST BON")
    print(f"   - 1 seule variable FIREBASE_SERVICE_ACCOUNT_JSON dans .env")
    print(f"   - JSON parseable côté Node")
    print(f"   - project_id confirmé: {project_id}")
    print(f"")
    print(f"Prochaine étape : redémarrer l'API (Ctrl-C dans le terminal `npm run dev`, puis relancer).")


if __name__ == "__main__":
    main()
