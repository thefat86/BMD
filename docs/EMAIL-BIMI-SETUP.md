# Email avec logo dans le contact (BIMI) — guide de setup

**Objectif** : afficher le logo BMD à côté du nom de l'expéditeur dans Gmail, Apple Mail, Yahoo, Fastmail, La Poste, ProtonMail, etc.

**Standard utilisé** : [BIMI](https://bimigroup.org/) (Brand Indicators for Message Identification) — c'est le standard officiel adopté par Google/Apple/Yahoo depuis 2021.

---

## 📋 Pré-requis (à faire dans cet ordre)

### Étape 1 — Vérifier le domaine dans Resend (si pas déjà fait)

1. Connecte-toi à <https://resend.com/domains>
2. Si `backmesdo.com` n'apparaît pas, clique **"Add Domain"** et entre `backmesdo.com`
3. Resend te donne 3 records DNS à ajouter :
   - 1 record TXT pour SPF (valeur type `v=spf1 include:resend.com -all`)
   - 1 record TXT pour DKIM (valeur type `v=DKIM1; k=rsa; p=MIGfMA0...`)
   - 1 record CNAME pour le tracking (`resend._domainkey` → `resend.com`)
4. Va chez ton registrar (Namecheap / OVH / Gandi / Cloudflare) et ajoute ces 3 records
5. Attends ~10-30 min, puis clique **"Verify Domain"** dans Resend → status **VERIFIED** ✅

> **Sans cette étape, BIMI ne marchera JAMAIS.** Resend doit envoyer tes emails depuis ton domaine, pas depuis `resend.com`.

### Étape 2 — Activer DMARC en mode "enforce"

BIMI exige une politique DMARC **`p=quarantine`** ou **`p=reject`** (le mode `p=none` ne suffit pas).

Ajoute ce record TXT chez ton registrar :

```
Nom (Host)   : _dmarc.backmesdo.com
Type         : TXT
Valeur       : v=DMARC1; p=quarantine; pct=100; rua=mailto:postmaster@backmesdo.com; ruf=mailto:dmarc@backmesdo.com; aspf=s; adkim=s
TTL          : 3600
```

**Ce que ça fait** :
- `p=quarantine` : si un email se prétend de `@backmesdo.com` mais ne passe pas SPF/DKIM, il atterrit en spam (au lieu de l'inbox)
- `pct=100` : applique cette règle à 100% des emails
- `rua=` : rapports agrégés sur les emails reçus (utile pour debug)

> ⚠️ **Avant d'activer `p=quarantine`**, vérifie que TOUS les emails sortants de `@backmesdo.com` passent SPF + DKIM. Sinon tu vas casser ton mailing. Test avec <https://www.mail-tester.com> avant.

### Étape 3 — Héberger le SVG BIMI

Le fichier `bimi-logo.svg` est déjà créé dans `apps/web/public/`. Une fois ton site déployé, il sera accessible à :

```
https://www.backmesdo.com/bimi-logo.svg
```

**Vérifie qu'il est bien servi** :
```bash
curl -I https://www.backmesdo.com/bimi-logo.svg
```

Tu dois voir un `200 OK` avec `Content-Type: image/svg+xml`. Si Next.js sert ça avec un autre Content-Type, il faut ajouter dans `next.config.js` :

```js
headers: [
  {
    source: '/bimi-logo.svg',
    headers: [
      { key: 'Content-Type', value: 'image/svg+xml' },
      { key: 'Cache-Control', value: 'public, max-age=86400' }
    ]
  }
]
```

### Étape 4 — Créer le record BIMI

Ajoute ce record TXT chez ton registrar :

```
Nom (Host)   : default._bimi.backmesdo.com
Type         : TXT
Valeur       : v=BIMI1; l=https://www.backmesdo.com/bimi-logo.svg; a=
TTL          : 3600
```

> **`a=`** est laissé vide volontairement. C'est l'URL d'un certificat VMC (voir étape 5).

### Étape 5 — (Optionnel mais recommandé pour Gmail) Acheter un VMC

**Verified Mark Certificate (VMC)** — c'est une exigence SPÉCIFIQUE à Gmail. Sans VMC, ton logo s'affichera quand même chez Apple Mail, Yahoo, Fastmail, ProtonMail, La Poste, mais PAS dans Gmail.

**Coût** : ~$1 200 - $1 500 / an
**Vendeurs** : DigiCert, Entrust
**Délai** : 1-2 semaines (vérification visuelle de marque + KYC)
**Pré-requis** : marque déposée à l'INPI ou similaire (pour BMD, faut donc déposer la marque d'abord — process à part, ~€250 + tarif d'un IP lawyer)

Une fois le VMC obtenu, tu mets l'URL dans le record BIMI :

```
v=BIMI1; l=https://www.backmesdo.com/bimi-logo.svg; a=https://www.backmesdo.com/bmd.pem
```

> **Décision recommandée** : démarre SANS VMC (gratuit, marche pour tous sauf Gmail). Quand BMD aura traction et un mailing volumineux, achète le VMC pour Gmail.

---

## ✅ Checklist finale

| Étape | Fait ? | Vérification |
|-------|--------|--------------|
| Domaine vérifié dans Resend | [ ] | <https://resend.com/domains> → status VERIFIED |
| SPF record (v=spf1 include:resend.com) | [ ] | `dig TXT backmesdo.com` |
| DKIM record (`resend._domainkey`) | [ ] | `dig TXT resend._domainkey.backmesdo.com` |
| DMARC record (`_dmarc`, p=quarantine) | [ ] | `dig TXT _dmarc.backmesdo.com` |
| SVG hébergé sur le site | [ ] | `curl -I https://www.backmesdo.com/bimi-logo.svg` |
| BIMI record (`default._bimi`) | [ ] | `dig TXT default._bimi.backmesdo.com` |
| (Optionnel) VMC pour Gmail | [ ] | URL du `.pem` valide |

---

## 🧪 Tester ta config

**1. Validateur BIMI officiel** : <https://bimigroup.org/bimi-generator/>
   Entre `backmesdo.com` et clique "Check". Il te dira ce qui marche et ce qui manque.

**2. Mail Tester** : <https://www.mail-tester.com/>
   Envoie un email à l'adresse qu'il te donne, vérifie que ton score est ≥ 9/10.

**3. Test réel** :
   - Envoie un email depuis BMD vers ton Gmail / iCloud / Yahoo perso
   - Vérifie l'affichage à côté du nom de l'expéditeur
   - Apple Mail : devrait apparaître immédiatement après config
   - Gmail : peut prendre 24-48h après VMC + DMARC enforce
   - Yahoo : ~12-24h

---

## 🆘 Troubleshooting

**"Mon logo n'apparaît pas dans Gmail"**
- Vérifie que tu as un VMC (sans VMC, Gmail n'affiche pas les logos BIMI)
- Vérifie DMARC `p=quarantine` ou `p=reject` (pas `p=none`)
- Vérifie que SPF + DKIM passent à 100% sur tes emails sortants
- Attends 48h après tous les changements DNS

**"Mon logo apparaît mais flou / cassé"**
- Le SVG doit respecter STRICTEMENT le profil BIMI Tiny PS
- Vérifie avec <https://bimigroup.org/bimi-svg-validator/>
- Si non conforme, mon fichier `bimi-logo.svg` peut nécessiter un ajustement

**"Tout est correct mais pas de logo"**
- Vérifie l'URL du SVG dans le record BIMI : doit être `https://` (pas `http://`)
- Vérifie le Content-Type : doit être `image/svg+xml`
- Le SVG ne doit pas dépasser 32 KB (le mien fait < 5 KB ✅)

---

## 💡 Bonus : Gravatar (gratuit, en attendant BIMI complet)

En complément, tu peux uploader un avatar pour `noreply@backmesdo.com` sur <https://gravatar.com>. Ça donnera un fallback dans Apple Mail / Fastmail / ProtonMail le temps que ton BIMI soit complètement validé.

1. Crée un compte Gravatar avec `noreply@backmesdo.com`
2. Uploade ton logo BMD (un PNG carré 512×512 px convient)
3. Done — Apple Mail / Fastmail prendront cet avatar automatiquement.

---

## 📞 Si tu coinces

Le plus probable est que tu aies un souci de DNS (records mal collés, propagation pas finie). Donne-moi le résultat de ces 4 commandes et je te débuggue :

```bash
dig TXT backmesdo.com +short
dig TXT resend._domainkey.backmesdo.com +short
dig TXT _dmarc.backmesdo.com +short
dig TXT default._bimi.backmesdo.com +short
```
