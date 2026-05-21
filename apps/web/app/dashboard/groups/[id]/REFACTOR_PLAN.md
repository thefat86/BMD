# Refactor plan — `groups/[id]/page.tsx`

> **État** : à faire. Le fichier `page.tsx` fait actuellement ~3700 lignes — trop pour être maintenable. Ce document décrit le plan d'extraction en composants pour que la prochaine refonte ne soit pas une explosion de bugs.

## Pourquoi pas tout d'un coup

Tenter d'extraire 3700 lignes en 1 session reviendrait à :
- Toucher 20+ états React et leur logique
- Casser potentiellement le flow `?action=add-expense` (déjà branché)
- Casser le panneau Inviter qui dépend de plusieurs states partagés
- Casser le `useEffect` qui scroll vers section-expenses au mount
- Casser la logique optimistic UI des dépenses (`e._optimistic`)
- Casser les BottomSheets settle, share, expense composer

**Recommandation** : 1 session par sous-composant, dans cet ordre.

## Plan d'extraction (5 sessions max)

### Session 1 — `<GroupHero />`
Déjà extrait via `<GroupHeroBalance />` (lignes 3305-3491). ✅ Done.

### Session 2 — `<GroupQuickActions />`
Le bloc grid 4 colonnes des actions (Dépense / Tontine / Inviter / Réglages).
Déjà extrait via `<GroupQuickAction />` interne. ✅ Done.

### Session 3 — `<GroupExpensesSection />`
**Cible** : extraire la section "Dépenses" (lignes ~2560 à ~3240, env. 680 lignes).

**État partagé à propager via props ou Context** :
- `filteredExpenses`, `expandedExpenseId`, `setExpandedExpenseId`
- `confirmDelete`, `setConfirmDelete`
- `openEditPanel`
- `searchTerm`
- `me`, `group.members` (pour permissions)

**Approche** :
1. Créer `_components/group-expenses-section.tsx`
2. Déplacer le JSX du bloc `<div id="section-expenses" />` + card associée
3. Passer les states en props
4. Tester : ajouter/éditer/supprimer une dépense fonctionne toujours

### Session 4 — `<GroupBalanceSection />`
**Cible** : extraire la section "Balances" + suggestions de règlement (lignes ~2353 à ~2553, env. 200 lignes).

**Composants déjà extraits à réutiliser** :
- Le BottomSheet `settle` (settleTarget) reste dans le parent (déjà fait)
- Les boutons tappables des suggestions appellent `setSettleTarget`

**Approche** :
1. Créer `_components/group-balance-section.tsx`
2. Accepter props `balance`, `me`, `group`, `onSettleClick`
3. Le parent fournit `onSettleClick={(target) => setSettleTarget(target)}`

### Session 5 — `<GroupMembersSection />`
**Cible** : extraire la section "Membres" + permissions admin (lignes ~2700 à ~2900, env. 200 lignes).

**Approche** : straightforward, peu de logique. Props : `group`, `me`, `canManage`, callbacks `onPromote`, `onRemove`.

### Session 6 — `<ExpenseComposerPanel />`
**Cible** : extraire le formulaire d'ajout/édition de dépense (lignes ~1700 à ~2300, env. 600 lignes).

**État partagé** : énorme (~30 states liés au composer : description, amount, splitMode, shares, participants, paidByUserId, multi-payers, OCR scan result, etc.).

**Approche recommandée** :
- Créer un hook custom `useExpenseComposer(groupId, members)` qui encapsule tous ces states + leurs setters + la fn `addExpense` / `updateExpense`
- Le composant `<ExpenseComposerPanel />` consomme ce hook et rend le JSX
- Le parent appelle juste `<ExpenseComposerPanel open={openPanel==="expense"} ... />`

C'est la session la plus risquée — à faire en dernier après les autres extractions.

## Checklist par session

À chaque session :
- [ ] `npx tsc --noEmit` → 0 erreur
- [ ] `i18n:check:strict` → 27/27 OK
- [ ] `i18n:audit:strict` → 0 string FR hardcodée
- [ ] Test manuel sur iPhone via `npm run mobile:fresh`
  - [ ] Ouvrir un groupe avec dépenses existantes
  - [ ] Ajouter une dépense → optimistic UI marche
  - [ ] Éditer une dépense
  - [ ] Supprimer une dépense (BottomSheet confirmation)
  - [ ] Tap suggestion balance → BottomSheet settle
  - [ ] Tap action "Inviter" → BottomSheet share QR
  - [ ] Tap action "Tontine" → navigation vers `/tontine`
  - [ ] Navigation `/groups/[id]?action=add-expense` → scroll + focus auto

Si **un seul** de ces points casse → revert et investiguer.

## Estimation totale

- Session 3 : 1-2h (expenses)
- Session 4 : 1h (balance)
- Session 5 : 30min (members)
- Session 6 : 2-3h (composer + hook)

**Total** : 5-7h sur 4 sessions. À distribuer sur 1 semaine pour éviter la fatigue refactor.

## Note Apple App Store

Ce refactor n'est **pas bloquant** pour la soumission App Store si l'UX mobile est déjà OK (hero compact, quick actions, BottomSheet settle, share QR, etc.). Apple Review regarde l'expérience, pas le code source.

Reportable post-V1 si nécessaire — la dette technique est documentée ici.
