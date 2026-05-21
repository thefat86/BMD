# Tester la tontine **Hui (enchères chinoises)**

> Mode AUCTION — spec §3.4. À chaque tour, les membres misent ce qu'ils acceptent
> de céder aux autres pour gagner le pot ce mois-ci. La plus haute mise gagne.

## 🎯 Pré-requis

1. **Au moins 3 utilisateurs** connectés (toi + 2 autres pour bidder)
2. **Un groupe** dont tu es ADMIN, avec ces 3+ membres
3. **Plan PREMIUM** sur ton compte (sinon 402 — voir solutions plus bas)
4. **API + Web** lancés (`npm run dev` à la racine)

---

## 🧪 Test rapide — UI Web

### 1. Crée la tontine en mode AUCTION

Dashboard → ton groupe → onglet **Tontine** → **Créer une tontine**

- Montant cotisation : `100 EUR`
- Fréquence : `Mensuel`
- Date de début : aujourd'hui
- **Mode → « Enchères (Hui) »** ⚠️ critique
- Pot : centralisé

### 2. Active la tontine

Bouton **Activer** → l'API génère N tours en `PENDING` (un par membre).
En mode AUCTION, l'ordre initial est shuffled mais chaque tour sera décidé
par enchère.

### 3. Place une enchère sur le 1er tour

Tour 1 → bouton **Miser** → entre un montant (ex: `15 EUR`).
Avec 3 utilisateurs connectés, fais miser :
- User A : `10 EUR`
- User B : `20 EUR`
- User C : `15 EUR`

### 4. Clôture les enchères (admin uniquement)

Tour 1 → **Clôturer les enchères**.
→ User B gagne (20 EUR), devient bénéficiaire effectif du tour.
→ Tour passe en `IN_PROGRESS`, les cotisations PENDING sont créées.

### 5. Workflow normal

À partir de là, c'est le même flow que les autres modes :
- Chaque membre marque sa cotisation comme **payée**
- User B (le bénéficiaire) confirme la réception
- Quand tout est confirmé → l'admin **distribue le pot**
- Tour 2 s'ouvre automatiquement aux enchères

---

## 🛠️ Test rapide — cURL (sans UI)

```bash
# 0. Authentifie-toi (récupère $TOKEN — adapté selon ton flow OTP/magic-link)
TOKEN="ton_jwt"
GROUP_ID="ton_group_id"
API="http://localhost:4000"

# 1. Crée une tontine en mode AUCTION
curl -X POST $API/groups/$GROUP_ID/tontine \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contributionAmount": "100",
    "frequency": "MONTHLY",
    "startDate": "2026-05-15T00:00:00Z",
    "orderMode": "AUCTION",
    "centralizedPot": true
  }'
# → { id: "tontine_xxx", status: "DRAFT" }

# 2. Active (génère N turns en PENDING)
TONTINE_ID="tontine_xxx"
curl -X POST $API/tontines/$TONTINE_ID/activate \
  -H "Authorization: Bearer $TOKEN"

# 3. Récupère l'ID du 1er tour
curl $API/groups/$GROUP_ID/tontine \
  -H "Authorization: Bearer $TOKEN" | jq '.turns[0]'
TURN_ID="turn_xxx"

# 4. Pose une enchère (depuis chaque user concerné)
curl -X POST $API/tontine-turns/$TURN_ID/bids \
  -H "Authorization: Bearer $TOKEN_USER_A" \
  -H "Content-Type: application/json" \
  -d '{"amount": "10"}'

curl -X POST $API/tontine-turns/$TURN_ID/bids \
  -H "Authorization: Bearer $TOKEN_USER_B" \
  -H "Content-Type: application/json" \
  -d '{"amount": "20"}'

# 5. Liste les enchères (transparent : tous les membres voient tout)
curl $API/tontine-turns/$TURN_ID/bids \
  -H "Authorization: Bearer $TOKEN" | jq

# 6. Clôture (admin uniquement)
curl -X POST $API/tontine-turns/$TURN_ID/bids/close \
  -H "Authorization: Bearer $TOKEN_ADMIN"
# → { winnerUserId: "...", winningBid: "20" }
```

---

## 🚧 Solutions aux blocages

### « Pour créer un groupe supplémentaire, il te faudrait passer en formule PREMIUM »

Tu es sur **FREE** (2 groupes max). Trois options :

**Option A — Studio Prisma (le plus rapide pour dev) :**
```bash
cd apps/api && npx prisma studio
# → User → édite ton user → planCode = "PREMIUM" → Save
```

**Option B — SQL direct :**
```sql
UPDATE "User" SET "planCode" = 'PREMIUM' WHERE id = '<ton-id>';
```

**Option C — Augmente la limite FREE :**
```sql
UPDATE "Plan"
SET limits = jsonb_set(limits, '{maxGroups}', '5')
WHERE code = 'FREE';
```

⚠️ Cache 5 min dans `plan-limits.ts` → redémarre l'API ou attends.

### « Ce tour n'est pas en mode enchères »

Tu as créé la tontine en `MANUAL` ou `RANDOM`. Recrée-la en `AUCTION`.

### « Personne n'a encore placé d'enchère »

Avant de **clôturer**, il faut **au moins une enchère**. Place-en une avec
n'importe quel user.

---

## 📐 Logique métier

| Champ | Valeur | Sens |
|-------|--------|------|
| `Tontine.orderMode` | `AUCTION` | Mode enchères activé pour tous les tours |
| `TontineTurn.status` | `PENDING` | Enchères en cours, on peut bidder |
| `TontineTurn.status` | `IN_PROGRESS` | Enchère clôturée, cotisations PENDING |
| `TontineBid.amount` | Decimal > 0 | Montant cédé aux autres si je gagne |
| `TontineBid.won` | `true` | Ce bid a gagné l'enchère du tour |

**Une seule enchère active par membre par tour** (clé unique
`@@unique([turnId, bidderId])`). Tu peux écraser ta mise tant que le tour
est `PENDING` (le code utilise un `upsert`).

À la clôture (`closeBidding`) :
1. Le bid avec le `amount` le plus élevé gagne (`won = true`)
2. `TontineTurn.beneficiaryUserId` est overridé avec le winner
3. Status passe à `IN_PROGRESS`
4. Les `TontineContribution` PENDING sont créées comme en mode normal

⚠️ La répartition de la mise gagnante **en intérêts pour les perdants**
n'est pas encore automatisée — pour l'instant c'est juste un bénéfice
moral et une déclaration d'engagement. Côté financier, le bénéficiaire
reçoit le pot standard (N-1 cotisations × montant).

---

## 🎨 UI à implémenter (à venir)

Pour l'instant les routes API sont opérationnelles, mais la page
`/dashboard/groups/[id]/tontine` n'expose pas encore les boutons « Miser »
et « Clôturer ». TODO sur la prochaine itération frontend.
