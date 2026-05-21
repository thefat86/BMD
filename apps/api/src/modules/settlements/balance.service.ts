import Decimal from "decimal.js";
import { prisma } from "../../lib/db.js";
import { getGroupForMember } from "../groups/groups.service.js";

export interface UserBalance {
  userId: string;
  displayName: string;
  net: Decimal; // positive => the group owes them; negative => they owe the group
}

export interface SuggestedSettlement {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: Decimal;
  currency: string;
}

/**
 * Compute net balances per member for a given group.
 *
 * For each expense:
 *  - The payer is credited with the FULL amount paid.
 *  - Each participant is debited with their amountOwed (their share of the expense).
 *
 * V26-1 — Pour chaque Settlement CONFIRMED :
 *  - Le débiteur (`fromUser`) voit son net AUGMENTER de `amount` (il a réglé sa
 *    dette → la dette ne pèse plus sur son solde).
 *  - Le créancier (`toUser`) voit son net DIMINUER de `amount` (il a reçu son dû
 *    → le groupe ne lui doit plus cette somme).
 *
 * Cette logique était manquante avant V26 : un settlement confirmé n'avait
 * AUCUN effet sur `computeBalances`, ce qui créait l'illusion d'une dette
 * éternelle même après paiement Mobile Money / espèces. Les utilisateurs
 * compensaient en créant des "Expense de remboursement" — workaround que
 * V26 supprime en faisant le ledger correctement.
 *
 * net[user] = sum(paid by user) - sum(owed by user)
 *           + sum(settlements where fromUserId=user, status=CONFIRMED)
 *           - sum(settlements where toUserId=user, status=CONFIRMED)
 *
 * NB : on n'inclut QUE les settlements `CONFIRMED` (le créancier a confirmé
 * la réception). Les `PAID` (déclaré mais non confirmé) restent en attente
 * pour éviter les fraudes auto-déclarées.
 */
export async function computeBalances(
  groupId: string,
  actorUserId: string,
): Promise<{ currency: string; balances: UserBalance[] }> {
  const group = await getGroupForMember(groupId, actorUserId);

  // 2 requêtes en parallèle — expenses + settlements confirmés.
  // Sprint AC-2 · on inclut `payers` pour gérer le multi-payeurs.
  // Cast `prisma as any` pour le findMany car la regen du client n'est pas
  // encore faite après la migration v33 (pattern identique à V30 / V32).
  const [expenses, confirmedSettlements] = await Promise.all([
    (prisma as any).expense.findMany({
      where: { groupId },
      include: {
        paidBy: { select: { id: true, displayName: true } },
        shares: {
          include: { user: { select: { id: true, displayName: true } } },
        },
        payers: { select: { userId: true, amount: true } },
      },
    }) as Promise<any[]>,
    prisma.settlement.findMany({
      where: { groupId, status: "CONFIRMED" },
      select: { fromUserId: true, toUserId: true, amount: true },
    }),
  ]);

  const ledger = new Map<string, { displayName: string; net: Decimal }>();
  for (const m of (group.members as any[])) {
    ledger.set(m.userId, {
      displayName: m.user.displayName as string,
      net: new Decimal(0),
    });
  }

  // Ledger des Expenses : crédit au(x) payeur(s), débit aux participants.
  // Sprint AC-2 · si `payers` est rempli, on crédite chaque payer de son
  // propre montant. Sinon on tombe sur le mode legacy `paidById = total`.
  for (const e of expenses as Array<any>) {
    if (Array.isArray(e.payers) && e.payers.length > 0) {
      for (const p of e.payers as Array<{ userId: string; amount: any }>) {
        const credit = ledger.get(p.userId);
        if (credit) {
          credit.net = credit.net.plus(new Decimal(p.amount.toString()));
        }
      }
    } else {
      const paid = ledger.get(e.paidById);
      if (paid) {
        paid.net = paid.net.plus(new Decimal(e.amount.toString()));
      }
    }
    for (const s of e.shares as Array<{ userId: string; amountOwed: any }>) {
      const owed = ledger.get(s.userId);
      if (owed) {
        owed.net = owed.net.minus(new Decimal(s.amountOwed.toString()));
      }
    }
  }

  // V26-1 — Ledger des Settlements CONFIRMED :
  //  - le débiteur (`fromUserId`) voit son net augmenter (sa dette est éteinte)
  //  - le créancier (`toUserId`) voit son net diminuer (il a été remboursé)
  for (const sett of confirmedSettlements) {
    const debtor = ledger.get(sett.fromUserId);
    const creditor = ledger.get(sett.toUserId);
    const amt = new Decimal(sett.amount.toString());
    if (debtor) {
      debtor.net = debtor.net.plus(amt);
    }
    if (creditor) {
      creditor.net = creditor.net.minus(amt);
    }
  }

  return {
    currency: group.defaultCurrency,
    balances: Array.from(ledger.entries()).map(([userId, v]) => ({
      userId,
      displayName: v.displayName,
      net: v.net.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    })),
  };
}

/**
 * Greedy debt simplification (a.k.a. "minimum cash flow").
 * Pairs largest creditor with largest debtor until everyone is settled.
 * The result is OPTIMAL within a small constant factor and runs in O(n log n).
 *
 * Mathematical invariant : SUM of all proposed transactions <= SUM of all owed amounts
 * (equality only in worst case where no compensation is possible).
 */
export function simplify(
  balances: Array<{ userId: string; displayName: string; net: Decimal }>,
  currency: string,
): SuggestedSettlement[] {
  const TOL = new Decimal("0.01");

  // Split into creditors (positive) and debtors (negative)
  const creditors = balances
    .filter((b) => b.net.greaterThan(TOL))
    .map((b) => ({ ...b, remaining: b.net }))
    .sort((a, b) => b.remaining.comparedTo(a.remaining));

  const debtors = balances
    .filter((b) => b.net.lessThan(TOL.negated()))
    .map((b) => ({ ...b, remaining: b.net.negated() })) // store as positive amount owed
    .sort((a, b) => b.remaining.comparedTo(a.remaining));

  const out: SuggestedSettlement[] = [];

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const pay = Decimal.min(d.remaining, c.remaining);

    if (pay.greaterThan(TOL)) {
      out.push({
        fromUserId: d.userId,
        fromName: d.displayName,
        toUserId: c.userId,
        toName: c.displayName,
        amount: pay.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        currency,
      });
    }

    d.remaining = d.remaining.minus(pay);
    c.remaining = c.remaining.minus(pay);

    if (d.remaining.lessThanOrEqualTo(TOL)) i++;
    if (c.remaining.lessThanOrEqualTo(TOL)) j++;
  }

  return out;
}

/**
 * Compute balances + simplification suggestions in one call.
 */
export async function computeBalanceWithSuggestions(
  groupId: string,
  actorUserId: string,
) {
  const { currency, balances } = await computeBalances(groupId, actorUserId);
  const suggestions = simplify(balances, currency);
  return { currency, balances, suggestions };
}

/**
 * Solde global d'un utilisateur sur l'ensemble de ses groupes (spec §3.5 §4.4).
 *
 * Tout est ramené dans la **devise par défaut de l'utilisateur**
 * (`User.defaultCurrency`) via le service FX (taux du jour, cache 60s).
 * Si la conversion FX échoue pour une devise (taux inconnu), on garde
 * le bucket dans sa devise d'origine et on l'expose dans `byCurrency`
 * pour que l'UI puisse afficher un disclaimer.
 *
 * Retourne :
 *  - net : solde global converti dans la devise utilisateur
 *  - owedToMe / iOwe : pareil, dans la devise utilisateur
 *  - primaryCurrency : la devise utilisateur (ce qu'il voit dans son dashboard)
 *  - byCurrency : détail par devise d'origine (pour transparence)
 *  - hasConversion : true si au moins un bucket a été converti
 */
export async function computeUserGlobalBalance(userId: string) {
  const { prisma } = await import("../../lib/db.js");
  const { convert } = await import("../../lib/fx.js");

  // Récupère la devise préférée du user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultCurrency: true },
  });
  const userCurrency = (user?.defaultCurrency ?? "EUR").toUpperCase();

  // Tous les groupes dont l'user est membre
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true, group: { select: { defaultCurrency: true } } },
  });

  let owedToMe = 0;
  let iOwe = 0;
  let hasConversion = false;
  const byCurrency: Record<string, { owedToMe: number; iOwe: number; net: number }> =
    {};

  for (const m of memberships) {
    try {
      const { currency, balances } = await computeBalances(m.groupId, userId);
      const myBalance = balances.find((b) => b.userId === userId);
      if (!myBalance) continue;
      // myBalance.net est un Decimal — toString() avant parseFloat (Number()
      // direct serait OK aussi mais parseFloat reste cohérent avec le reste du code).
      const net = parseFloat(myBalance.net.toString());
      if (!Number.isFinite(net)) continue;

      // Bucket par devise d'origine (pour transparence)
      if (!byCurrency[currency]) {
        byCurrency[currency] = { owedToMe: 0, iOwe: 0, net: 0 };
      }
      byCurrency[currency].net += net;
      if (net > 0) byCurrency[currency].owedToMe += net;
      else if (net < 0) byCurrency[currency].iOwe += -net;

      // Convertit vers la devise utilisateur pour l'agrégat global
      let netInUserCurrency = net;
      if (currency !== userCurrency) {
        try {
          netInUserCurrency = await convert(net, currency, userCurrency);
          hasConversion = true;
        } catch {
          // Devise non supportée par le FX → on agrège tel quel (le bucket
          // restera lisible dans byCurrency)
          netInUserCurrency = net;
        }
      }
      if (netInUserCurrency > 0) owedToMe += netInUserCurrency;
      else if (netInUserCurrency < 0) iOwe += -netInUserCurrency;
    } catch {
      continue;
    }
  }

  return {
    net: (owedToMe - iOwe).toFixed(2),
    owedToMe: owedToMe.toFixed(2),
    iOwe: iOwe.toFixed(2),
    primaryCurrency: userCurrency,
    hasConversion,
    /** Détail par devise d'origine — utile si l'user a des groupes en devises différentes */
    byCurrency: Object.fromEntries(
      Object.entries(byCurrency).map(([cur, b]) => [
        cur,
        {
          net: b.net.toFixed(2),
          owedToMe: b.owedToMe.toFixed(2),
          iOwe: b.iOwe.toFixed(2),
        },
      ]),
    ),
    groupCount: memberships.length,
  };
}

/**
 * V26 · Solde **par contrepartie** d'un utilisateur, agrégé sur l'ensemble
 * de ses groupes (vue par personne — opposée à la vue par groupe historique).
 *
 * Pour chaque autre membre avec qui l'utilisateur partage au moins 1 groupe,
 * on calcule le **net direct dû/reçu** sur l'ensemble des Expenses ET des
 * Settlements CONFIRMED (le fix V26-1 garantit que les remboursements sont
 * correctement déduits).
 *
 * **Algorithme** (par groupe partagé G) :
 *   Pour chaque Expense de G :
 *     - Si actor a payé et X a une share → X doit `share.amountOwed` à actor
 *       (net[X] += amountOwed dans la perspective de actor)
 *     - Si X a payé et actor a une share → actor doit `share.amountOwed` à X
 *       (net[X] -= amountOwed)
 *   Pour chaque Settlement CONFIRMED de G :
 *     - Si actor=fromUserId et X=toUserId → actor a payé X = il lui doit moins
 *       (net[X] += amount, perspective actor)
 *     - Si X=fromUserId et actor=toUserId → X a payé actor = X doit moins à actor
 *       (net[X] -= amount)
 *
 * Le tout est converti dans `User.defaultCurrency` via le module FX (cache 60s).
 *
 * Retour :
 *   - `primaryCurrency` : devise utilisateur
 *   - `hasConversion` : true si au moins un montant a été converti FX
 *   - `people` : liste triée par |net| décroissant — les contreparties
 *     "à jour" (net = 0) sont incluses pour qu'on puisse afficher un badge
 *     "✓ à jour" côté UI (décision V26).
 *
 * Confidentialité : on n'expose que les groupes que `actorUserId` partage
 * avec la contrepartie — jamais d'autres groupes auxquels actor n'appartient pas.
 */
export interface PersonBalanceGroup {
  groupId: string;
  groupName: string;
  net: string; // Decimal stringifié — perspective de actor (positif = X doit à actor)
  currency: string; // devise du groupe (avant conversion vers user.currency)
  netInUserCurrency: string; // converti dans user.defaultCurrency
}

export interface PersonBalance {
  counterpartyUserId: string;
  displayName: string;
  /**
   * V112 · Photo de profil de la contrepartie. Remplie depuis l'avatar
   * du `User` Prisma. La route applique `filterPhotoByPlan` avant de
   * renvoyer pour respecter le plan du propriétaire. `null` si le user
   * n'a pas uploadé de photo OU si son plan ne permet pas la visibilité.
   */
  avatar: string | null;
  /** Net agrégé tous groupes confondus, dans la devise de l'utilisateur.
   *  Positif → cette personne doit à l'utilisateur. Négatif → l'utilisateur lui doit.
   *  Zéro → contrepartie "à jour" (badge ✓ côté UI). */
  net: string;
  currency: string;
  /** Combien de groupes partagés au total (dont les zéro). */
  sharedGroups: number;
  /** Détail par groupe — pour drill-down côté UI. */
  byGroup: PersonBalanceGroup[];
}

export async function computePersonBalances(actorUserId: string): Promise<{
  primaryCurrency: string;
  hasConversion: boolean;
  people: PersonBalance[];
}> {
  const { convert } = await import("../../lib/fx.js");

  // 1. Devise utilisateur
  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { defaultCurrency: true },
  });
  const userCurrency = (user?.defaultCurrency ?? "EUR").toUpperCase();

  // 2. Tous les groupes dont l'utilisateur est membre
  // V112 · On inclut `avatar` pour pouvoir l'attacher aux balances par
  // personne — affichage AvatarColored avec photo si plan le permet.
  const memberships = await prisma.groupMember.findMany({
    where: { userId: actorUserId },
    select: {
      groupId: true,
      group: {
        select: {
          id: true,
          name: true,
          defaultCurrency: true,
          members: {
            select: {
              userId: true,
              user: { select: { displayName: true, avatar: true } },
            },
          },
        },
      },
    },
  });

  if (memberships.length === 0) {
    return { primaryCurrency: userCurrency, hasConversion: false, people: [] };
  }

  const groupIds = memberships.map((m) => m.groupId);

  // 3. Charge expenses + settlements en parallèle pour TOUS les groupes
  //    de l'utilisateur — pour éviter N requêtes par groupe (perf).
  const [allExpenses, allSettlements] = await Promise.all([
    prisma.expense.findMany({
      where: { groupId: { in: groupIds } },
      select: {
        groupId: true,
        paidById: true,
        amount: true,
        currency: true,
        shares: {
          select: { userId: true, amountOwed: true },
        },
      },
    }),
    prisma.settlement.findMany({
      where: { groupId: { in: groupIds }, status: "CONFIRMED" },
      select: {
        groupId: true,
        fromUserId: true,
        toUserId: true,
        amount: true,
        currency: true,
      },
    }),
  ]);

  // Index : groupId → membership info (membres + nom + devise)
  // V112 · `members` stocke maintenant { displayName, avatar } pour propager
  // l'avatar au rendu côté frontend (AvatarColored avec photoUrl).
  const groupMeta = new Map<
    string,
    {
      name: string;
      currency: string;
      members: Map<string, { displayName: string; avatar: string | null }>;
    }
  >();
  // V112 · Index global userId → avatar (deduplicated) pour récupération
  // rapide au moment du push des balances.
  const userAvatars = new Map<string, string | null>();
  for (const m of memberships) {
    const memMap = new Map<
      string,
      { displayName: string; avatar: string | null }
    >();
    for (const memb of m.group.members) {
      memMap.set(memb.userId, {
        displayName: memb.user.displayName,
        avatar: memb.user.avatar ?? null,
      });
      userAvatars.set(memb.userId, memb.user.avatar ?? null);
    }
    groupMeta.set(m.groupId, {
      name: m.group.name,
      currency: m.group.defaultCurrency,
      members: memMap,
    });
  }

  // 4. Agrégation pair-à-pair, par groupe d'abord (devise d'origine)
  // Map<counterpartyUserId, Map<groupId, { net Decimal, currency, groupName }>>
  const perPersonByGroup = new Map<
    string,
    Map<string, { net: Decimal; currency: string; groupName: string }>
  >();

  /** Helper : ajoute `delta` (Decimal) à la balance pair (counterparty, group). */
  function addToLedger(
    counterpartyId: string,
    groupId: string,
    delta: Decimal,
  ) {
    if (counterpartyId === actorUserId) return; // jamais soi-même
    const meta = groupMeta.get(groupId);
    if (!meta) return;
    if (!meta.members.has(counterpartyId)) return; // jamais hors-groupe
    let byGroup = perPersonByGroup.get(counterpartyId);
    if (!byGroup) {
      byGroup = new Map();
      perPersonByGroup.set(counterpartyId, byGroup);
    }
    const entry = byGroup.get(groupId);
    if (entry) {
      entry.net = entry.net.plus(delta);
    } else {
      byGroup.set(groupId, {
        net: delta,
        currency: meta.currency,
        groupName: meta.name,
      });
    }
  }

  // Parcours des Expenses
  for (const e of allExpenses) {
    const meta = groupMeta.get(e.groupId);
    if (!meta) continue;
    const expenseAmount = new Decimal(e.amount.toString());
    const totalShares = e.shares.reduce(
      (acc, s) => acc.plus(new Decimal(s.amountOwed.toString())),
      new Decimal(0),
    );
    // Sécurité numérique : si la somme des shares ≠ amount, on garde ratio
    // exact basé sur les shares (le payeur ne crée pas de la valeur).
    void totalShares; // (informatif — on utilise les shares directement)

    if (e.paidById === actorUserId) {
      // Actor a payé → chaque autre participant LUI DOIT sa share
      for (const s of e.shares) {
        if (s.userId === actorUserId) continue;
        addToLedger(
          s.userId,
          e.groupId,
          new Decimal(s.amountOwed.toString()),
        );
      }
    } else {
      // Quelqu'un d'autre a payé → actor doit sa share à ce payeur
      // (uniquement si actor est dans la liste des participants)
      const myShare = e.shares.find((s) => s.userId === actorUserId);
      if (myShare) {
        addToLedger(
          e.paidById,
          e.groupId,
          new Decimal(myShare.amountOwed.toString()).negated(),
        );
      }
    }
    // Sécurité : on ignore le ratio expenseAmount qui n'intervient pas dans
    // l'algo pair-à-pair (les shares sont la source de vérité par participant).
    void expenseAmount;
  }

  // Parcours des Settlements CONFIRMED — efface la dette correspondante
  for (const sett of allSettlements) {
    const settAmount = new Decimal(sett.amount.toString());
    if (sett.fromUserId === actorUserId) {
      // Actor a payé X → la dette d'actor envers X diminue (X doit "moins" à actor négativement)
      // i.e. net[X] += amount dans la perspective d'actor (la dette d'actor vers X est éteinte
      // d'autant — donc X "doit moins négativement" à actor, ce qui revient à augmenter le net).
      addToLedger(sett.toUserId, sett.groupId, settAmount);
    } else if (sett.toUserId === actorUserId) {
      // X a payé actor → X doit "moins" à actor (sa dette est partiellement éteinte)
      addToLedger(sett.fromUserId, sett.groupId, settAmount.negated());
    }
    // Settlement entre deux tiers → n'affecte pas actor
  }

  // 5. Conversion FX vers la devise utilisateur + agrégation finale
  let hasConversion = false;
  const peopleResult: PersonBalance[] = [];

  for (const [counterpartyId, byGroupMap] of perPersonByGroup.entries()) {
    const meta = groupMeta.get(Array.from(byGroupMap.keys())[0]!);
    void meta; // displayName récupéré via groupMeta plus bas

    const byGroup: PersonBalanceGroup[] = [];
    let netInUserCcy = new Decimal(0);
    let counterpartyName = "—";

    for (const [groupId, entry] of byGroupMap.entries()) {
      const groupCcy = entry.currency.toUpperCase();
      let convertedFloat = parseFloat(entry.net.toString());
      if (groupCcy !== userCurrency) {
        try {
          convertedFloat = await convert(
            parseFloat(entry.net.toString()),
            groupCcy,
            userCurrency,
          );
          hasConversion = true;
        } catch {
          // Devise non gérée → on garde le montant tel quel mais on
          // l'expose tel quel dans le breakdown (le total user-currency
          // sera approximatif).
        }
      }
      const groupMetaEntry = groupMeta.get(groupId);
      if (groupMetaEntry) {
        const memberInfo = groupMetaEntry.members.get(counterpartyId);
        if (memberInfo) counterpartyName = memberInfo.displayName;
      }
      byGroup.push({
        groupId,
        groupName: entry.groupName,
        net: entry.net.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        currency: groupCcy,
        netInUserCurrency: new Decimal(convertedFloat)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toString(),
      });
      netInUserCcy = netInUserCcy.plus(new Decimal(convertedFloat));
    }

    // Tri du breakdown : groupes avec le plus gros impact en haut
    byGroup.sort(
      (a, b) =>
        Math.abs(parseFloat(b.netInUserCurrency)) -
        Math.abs(parseFloat(a.netInUserCurrency)),
    );

    peopleResult.push({
      counterpartyUserId: counterpartyId,
      displayName: counterpartyName,
      // V112 · Avatar récupéré depuis l'index global (sera filtré selon
      // le plan via filterPhotoByPlan dans la route avant de renvoyer).
      avatar: userAvatars.get(counterpartyId) ?? null,
      net: netInUserCcy.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
      currency: userCurrency,
      sharedGroups: byGroup.length,
      byGroup,
    });
  }

  // V26 — Inclure aussi les contreparties à net=0 pour le badge "à jour".
  // On ajoute les co-membres rencontrés mais sans dette directe (= jamais
  // entrés dans `perPersonByGroup` parce qu'ils n'ont pas d'Expense/Settlement
  // qui touche actor). Ces relations existent (même groupe) mais sont à jour.
  const seenCounterparties = new Set(peopleResult.map((p) => p.counterpartyUserId));
  for (const m of memberships) {
    for (const memb of m.group.members) {
      if (memb.userId === actorUserId) continue;
      if (seenCounterparties.has(memb.userId)) continue;
      // Relation détectée (même groupe) mais 0 transaction enregistrée.
      seenCounterparties.add(memb.userId);
      peopleResult.push({
        counterpartyUserId: memb.userId,
        displayName: memb.user.displayName,
        // V112 · Avatar du co-membre (sera filtré par plan dans la route).
        avatar: memb.user.avatar ?? null,
        net: "0.00",
        currency: userCurrency,
        sharedGroups: 1,
        byGroup: [
          {
            groupId: m.groupId,
            groupName: m.group.name,
            net: "0.00",
            currency: m.group.defaultCurrency,
            netInUserCurrency: "0.00",
          },
        ],
      });
    }
  }

  // Tri final : créditeurs (net > 0) en premier, puis débiteurs (net < 0),
  // puis "à jour" (net = 0) en bas. Au sein de chaque groupe : par |net| desc.
  peopleResult.sort((a, b) => {
    const an = parseFloat(a.net);
    const bn = parseFloat(b.net);
    const aBucket = an > 0 ? 0 : an < 0 ? 1 : 2;
    const bBucket = bn > 0 ? 0 : bn < 0 ? 1 : 2;
    if (aBucket !== bBucket) return aBucket - bBucket;
    return Math.abs(bn) - Math.abs(an);
  });

  return {
    primaryCurrency: userCurrency,
    hasConversion,
    people: peopleResult,
  };
}
