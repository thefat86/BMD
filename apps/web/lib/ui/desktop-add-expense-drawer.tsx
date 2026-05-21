"use client";

/**
 * V211.I — Drawer slide-over « Ajouter une dépense » desktop.
 * V215.B1 — Toutes les options avancées (mode de split, multi-payeurs,
 *           sélection des participants, devise) sont désormais INLINE dans
 *           ce drawer. Le bouton « Plus d'options » a disparu — plus aucune
 *           redirection vers une vieille page. Tout se passe dans le même
 *           overlay → 1 seul écran, moins de clics, zéro perte de contexte.
 * V215.B2 — Sélecteur de devise indépendant pour cette dépense (utile pour
 *           les groupes diaspora : un membre peut saisir en USD même si le
 *           groupe est en EUR, les autres voient la conversion).
 *
 * Structure UX :
 *  - Bloc principal (toujours visible) : description + montant + payeur +
 *    catégorie + date.
 *  - Bouton « + Options avancées » qui replie/déplie une section dense :
 *      • Mode de répartition (Égal / Montants / Parts / %)
 *      • Devise de la dépense
 *      • Multi-payeurs (toggle + éditeur si activé)
 *      • Participants au partage (cocher/décocher membres)
 *  - Aperçu live des parts à droite.
 *  - CTA Enregistrer en footer (sticky).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { useToast } from "./toast";
import { SegmentedControl } from "./segmented-control";
import { CurrencySelector } from "./currency-selector";
import { MultiPayersEditor } from "./multi-payers-editor";
import { AiProgressTimeline } from "./ai-progress-timeline";
import { GuideButton } from "./guide-button";
// V238.A — Helper centralisé pour parser n'importe quelle erreur en
// `{ title, body }` localisé. Tous les catch du drawer passent par ce
// helper pour ne plus jamais afficher des messages bruts type
// "Failed to fetch" ou "HTTP 500".
import { parseApiError, formatParsedError } from "../api-errors";
// V238.B — Pre-process le fichier scanné (compression + SHA-256) AVANT
// d'envoyer au backend. Le hash sert au check anti-doublon V42.
import { preprocessReceiptFile } from "./image-preprocessor";
// V225.C/E — Éditeur d'items inline pour le mode ITEMIZED (visible quand
// splitMode === "ITEMIZED"). Permet ajout manuel + pré-remplissage par le
// scan IA (parsed.items). Le sous-composant ItemCard gère qty / prix /
// participants par ligne.
import { ItemizedEditor, type DraftItem } from "./itemized-expense";

type Group = {
  id: string;
  name: string;
  defaultCurrency: string;
  members: Array<{
    id: string;
    userId?: string;
    user?: { id: string; displayName: string };
  }>;
};

const CATEGORIES = [
  { key: "FOOD", label: "🍽 Restauration" },
  { key: "TRANSPORT", label: "🚗 Transport" },
  { key: "ACCOMMODATION", label: "🏨 Hébergement" },
  { key: "ENTERTAINMENT", label: "🎟 Loisirs" },
  { key: "SHOPPING", label: "🛒 Courses" },
  { key: "OTHER", label: "📦 Autre" },
];

// V216.C — Le 4e mode "ITEMIZED" (partage par lignes de facture) est
// désormais exposé dans le SegmentedControl. L'éditeur d'items détaillé
// reste optionnel et peut être étendu en V216.H quand on rebranche les
// outils IA (le scan pré-remplit automatiquement les lignes).
type SplitMode = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";

interface ParticipantShare {
  userId: string;
  /** Pour UNEQUAL : montant en devise. Pour PERCENTAGE : pourcentage 0-100. */
  value: number;
}

export function DesktopAddExpenseDrawer({
  group,
  me,
  onClose,
  onCreated,
  editingExpense,
}: {
  group: Group;
  me?: { id: string; displayName: string };
  onClose: () => void;
  onCreated: () => void;
  /**
   * V216.E — Si fourni, le drawer s'ouvre en mode édition : tous les champs
   * sont pré-remplis, le titre devient "Modifier la dépense", et le submit
   * appelle `updateExpense(id, body)` au lieu de `createExpense`. La forme
   * attendue est la sérialisation backend (description, amount string,
   * currency, category, splitMode, occurredAt ISO, location, paidBy.id,
   * shares[], payers[]).
   */
  editingExpense?: {
    id: string;
    description: string;
    amount: string;
    currency: string;
    category?: string | null;
    splitMode: string;
    occurredAt: string;
    location?: string | null;
    paidBy?: { id: string };
    shares?: Array<{ userId: string; amountOwed: string }>;
    payers?: Array<{ userId: string; amount: string | null; percent: number | null }>;
  };
}) {
  const t = useT();
  const { formatAmount } = useCurrency();
  const toast = useToast();

  // V216.E — Mode édition activé quand editingExpense est fourni. On lit les
  // valeurs initiales depuis l'objet expense sérialisé (montant string, devise,
  // splitMode, occurredAt ISO, payers, etc.). isEditing reste stable pendant
  // toute la durée de vie du drawer pour ne pas perdre le contexte au prefill.
  const isEditing = Boolean(editingExpense);

  // ───────────────────────── États principaux ─────────────────────────
  const [description, setDescription] = useState(
    () => editingExpense?.description ?? "",
  );
  const [amount, setAmount] = useState(
    () => editingExpense?.amount ?? "",
  );
  const [paidByUserId, setPaidByUserId] = useState<string>(
    () => editingExpense?.paidBy?.id ?? me?.id ?? "",
  );
  const [category, setCategory] = useState<string>(
    () => editingExpense?.category ?? "OTHER",
  );
  const [date, setDate] = useState<string>(() =>
    editingExpense?.occurredAt
      ? new Date(editingExpense.occurredAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  );
  // V216.C — Lieu de la dépense (string libre, optionnel). Affiché dans la
  // timeline + détail. Permet aussi le matching futur lors d'un scan.
  const [location, setLocation] = useState(
    () => editingExpense?.location ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState<string>(
    () => editingExpense?.currency ?? group.defaultCurrency ?? "EUR",
  );
  // V218.A2 + V238.A — Erreur backend persistante (au lieu de toast volatile).
  // Reste affichée tant que l'utilisateur n'a rien changé OU n'a pas re-cliqué
  // Enregistrer. Depuis V238 le format est `{ title, body }` parlant, produit
  // par `parseApiError()`. On supporte aussi `string` (legacy V237) pour les
  // cas simples comme « Impossible d'enregistrer… vérifie chaque champ. ».
  const [submitError, setSubmitError] = useState<
    string | { title: string; body?: string } | null
  >(null);
  // V238.B — Banner saffron dédié quand le scan détecte un doublon de
  // facture (hash strict ou fuzzy match). Différent de submitError (qui
  // est terracotta pour les erreurs) — ici c'est un warning soft avec
  // CTA "Voir la dépense" + "Créer quand même" pour forcer l'override.
  const [duplicateWarning, setDuplicateWarning] = useState<{
    existingExpenseId: string;
    description: string;
    amount: string;
    date: string;
    /** Le file scanné qu'on garde de côté pour le forcer si l'user accepte. */
    pendingFile?: File;
  } | null>(null);
  // V238.B — Si l'user a explicitement validé le doublon ("Créer quand même"),
  // on bypass le check anti-doublon lors du submit. Reset à chaque nouveau scan.
  const [forceCreateDuplicate, setForceCreateDuplicate] = useState(false);
  // V238.B — Hash du fichier scanné, à envoyer à createExpense pour stockage
  // côté backend (anti-doublon ex post sur les futures factures du même groupe).
  const [scannedReceiptHash, setScannedReceiptHash] = useState<string | null>(null);

  // ────────────────── Section avancée (repliable inline) ──────────────
  // V216.E — En édition, on ouvre direct la section avancée si la dépense
  // n'est pas un simple EQUAL (l'utilisateur s'attend à voir les params).
  const [advancedOpen, setAdvancedOpen] = useState(
    () =>
      isEditing &&
      Boolean(
        editingExpense &&
          (editingExpense.splitMode !== "EQUAL" ||
            (editingExpense.payers && editingExpense.payers.length > 0)),
      ),
  );
  // V224.B + V225.C/E — Items du mode ITEMIZED. Trois entrées possibles :
  //  1. Pré-remplis automatiquement par le scan OCR (parsed.items).
  //  2. Ajoutés manuellement par l'utilisateur via le bouton "+ Ajouter".
  //  3. Édités ligne par ligne dans <ItemizedEditor /> (qty, prix, qui).
  // Persistés au submit via api.setExpenseItems() après création de la dépense.
  // assignedUserIds permet de cibler qui consomme chaque article.
  const [scannedItems, setScannedItems] = useState<DraftItem[]>([]);
  // V226 — Fichier scanné gardé en mémoire pour être uploadé comme attachment
  // RECEIPT après création de la dépense (sinon la facture est jetée et le
  // user ne la voit pas dans la galerie de preuves). Cause root du bug
  // remonté par Fabrice en test prod. Le pipeline desktop dupliquait ce que
  // mobile-add-expense-sheet faisait déjà correctement.
  const [scannedFile, setScannedFile] = useState<File | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>(
    () => (editingExpense?.splitMode as SplitMode) ?? "EQUAL",
  );
  const [multiPayer, setMultiPayer] = useState(
    () => Boolean(editingExpense?.payers && editingExpense.payers.length > 0),
  );
  const [payerShares, setPayerShares] = useState<
    Array<{ userId: string; amount: number }>
  >(() => {
    if (!editingExpense?.payers || editingExpense.payers.length === 0) return [];
    const total = parseFloat(editingExpense.amount) || 0;
    return editingExpense.payers.map((p) => ({
      userId: p.userId,
      amount: p.amount
        ? parseFloat(p.amount)
        : p.percent !== null && p.percent !== undefined
          ? (total * Number(p.percent)) / 100
          : 0,
    }));
  });
  // Participants au partage : tous cochés par défaut
  const memberIds = useMemo(
    () => group.members.map((m) => m.user?.id || m.userId || m.id),
    [group.members],
  );
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    () => {
      // V216.E — En édition, on initialise avec les shares existantes.
      if (editingExpense?.shares && editingExpense.shares.length > 0) {
        return new Set(editingExpense.shares.map((s) => s.userId));
      }
      return new Set(memberIds);
    },
  );
  // Valeurs custom pour UNEQUAL/PERCENTAGE
  const [customShares, setCustomShares] = useState<Map<string, number>>(
    () => {
      // V216.E — En édition pour UNEQUAL/ITEMIZED on remplit avec amountOwed.
      // Pour PERCENTAGE on convertit en % (amountOwed/total * 100).
      if (!editingExpense?.shares || editingExpense.shares.length === 0) {
        return new Map();
      }
      const total = parseFloat(editingExpense.amount) || 0;
      const m = new Map<string, number>();
      for (const s of editingExpense.shares) {
        const v = parseFloat(s.amountOwed) || 0;
        if (editingExpense.splitMode === "PERCENTAGE" && total > 0) {
          m.set(s.userId, (v / total) * 100);
        } else {
          m.set(s.userId, v);
        }
      }
      return m;
    },
  );

  // ESC pour fermer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Si membres changent, recalcule l'initial selectedParticipants
  // V216.E — En édition, on ne réinitialise pas : on conserve la sélection
  // qui correspond aux shares existantes de la dépense.
  useEffect(() => {
    if (isEditing) return;
    setSelectedParticipants(new Set(memberIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIds]);

  // V245.A — Multi-payers est désormais autorisé quel que soit le splitMode.
  // Le "qui a payé" (multiPayer + payerShares) et le "comment on partage"
  // (splitMode + shares) sont 2 dimensions orthogonales. Avant V245 le
  // toggle se reset au passage à UNEQUAL/PERCENTAGE/ITEMIZED — restriction
  // levée. Si le user repasse en EQUAL, on garde la sélection multi-payeurs
  // car elle reste cohérente.

  // V239.B — En mode édition d'une dépense ITEMIZED, on fetch les items
  // existants pour pré-remplir scannedItems. Sans ça l'aperçu du partage
  // restait vide (scannedItems=[] → itemizedShares vide → sharesPreview=[])
  // et l'utilisateur croyait que les items étaient perdus.
  // assignedUserIds est reconstruit depuis les claims (user qui a réclamé
  // l'item = consommateur), share=1/N implicite par claim.
  useEffect(() => {
    if (!isEditing || !editingExpense?.id) return;
    if (editingExpense.splitMode !== "ITEMIZED") return;
    let cancelled = false;
    void api
      .listExpenseItems(editingExpense.id)
      .then((items) => {
        if (cancelled) return;
        const drafts: DraftItem[] = items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unitPrice: String(it.unitPrice),
          totalPrice: String(it.totalPrice),
          assignedUserIds: (it.claims ?? []).map((c) => c.userId),
        }));
        if (drafts.length > 0) setScannedItems(drafts);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[desktop-drawer] listExpenseItems edit prefill failed", err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, editingExpense?.id]);

  const totalAmount = parseFloat(amount.replace(",", ".")) || 0;

  // V237 — Mode ITEMIZED : on calcule l'union des assignedUserIds de tous les
  // items pour produire la liste des participants ET leurs parts respectives.
  // Si un item n'a pas d'assignedUserIds, il est partagé entre TOUS les
  // selectedParticipants par défaut (équivalent au mode "claim ouvert" V43).
  // Cette fonction est utilisée à la fois pour sharesPreview et pour la
  // construction du payload createExpense (participants).
  // V237 — Helper robuste pour extraire le total d'un item. Si `totalPrice`
  // est vide/0 (ce qui arrive quand l'IA renvoie unitPrice + qty séparés sans
  // recalculer le total), on fallback sur `unitPrice × quantity`. Avant ce
  // fix, l'aperçu affichait tous les membres à 0 € quand le scan IA ne
  // remplissait pas `totalPrice`, et le bouton submit restait bloqué.
  function itemTotalOf(it: DraftItem): number {
    const raw = parseFloat(it.totalPrice || "0");
    if (Number.isFinite(raw) && raw > 0) return raw;
    const u = parseFloat(it.unitPrice || "0");
    const q = Number(it.quantity) || 0;
    const fallback = u * q;
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  const itemizedShares = useMemo(() => {
    if (splitMode !== "ITEMIZED") return null;
    const fallbackIds = Array.from(selectedParticipants);
    const userTotals = new Map<string, number>();
    for (const it of scannedItems) {
      const itemTotal = itemTotalOf(it);
      if (itemTotal <= 0) continue;
      const assignees =
        it.assignedUserIds && it.assignedUserIds.length > 0
          ? it.assignedUserIds
          : fallbackIds;
      if (assignees.length === 0) continue;
      const per = itemTotal / assignees.length;
      for (const uid of assignees) {
        userTotals.set(uid, (userTotals.get(uid) ?? 0) + per);
      }
    }
    return userTotals;
  }, [splitMode, scannedItems, selectedParticipants]);

  // V237 — Somme des items (pour vérifier qu'elle correspond au montant total).
  // Utilise le même helper itemTotalOf que itemizedShares pour cohérence.
  const itemsSum = useMemo(() => {
    if (splitMode !== "ITEMIZED") return 0;
    return scannedItems.reduce((s, it) => s + itemTotalOf(it), 0);
  }, [splitMode, scannedItems]);

  // V237 — Au moins un item doit avoir un assignedUserIds non vide OU on
  // tombe sur le fallback "tous les participants sélectionnés". On considère
  // OK tant qu'on a au moins 1 destinataire au final dans itemizedShares.
  const hasItemizedAssignees =
    splitMode === "ITEMIZED" && (itemizedShares?.size ?? 0) > 0;

  // ───────────────────────── Calcul des parts live ────────────────────
  const sharesPreview: ParticipantShare[] = useMemo(() => {
    if (!totalAmount) return [];

    if (splitMode === "ITEMIZED") {
      // V237 — En ITEMIZED, les parts viennent des items et de leurs
      // assignedUserIds. On affiche la répartition réelle dans le preview.
      if (!itemizedShares || itemizedShares.size === 0) return [];
      // V237 — Si la somme des items ne correspond pas exactement au montant
      // total de la dépense (arrondis, items mal renseignés, etc.), on
      // proportionne automatiquement les shares pour que leur somme = total.
      // Évite que l'utilisateur reste bloqué parce que 0,01 € manquent.
      const sum = Array.from(itemizedShares.values()).reduce((s, v) => s + v, 0);
      const scale = sum > 0 && Math.abs(sum - totalAmount) >= 0.01 ? totalAmount / sum : 1;
      return Array.from(itemizedShares.entries()).map(([userId, value]) => ({
        userId,
        value: value * scale,
      }));
    }

    if (selectedParticipants.size === 0) return [];
    const ids = Array.from(selectedParticipants);

    if (splitMode === "EQUAL") {
      const per = totalAmount / ids.length;
      return ids.map((id, idx) => ({
        userId: id,
        // Dernier prend l'arrondi pour somme exacte
        value:
          idx === ids.length - 1
            ? totalAmount - per * (ids.length - 1)
            : per,
      }));
    }

    if (splitMode === "UNEQUAL") {
      // Les valeurs custom sont en devise. Manquantes = 0.
      return ids.map((id) => ({
        userId: id,
        value: customShares.get(id) ?? 0,
      }));
    }

    // PERCENTAGE : custom = % (0-100), convertit en montant
    return ids.map((id) => {
      const pct = customShares.get(id) ?? 0;
      return { userId: id, value: (totalAmount * pct) / 100 };
    });
  }, [totalAmount, selectedParticipants, splitMode, customShares, itemizedShares]);

  // Somme des parts (vérif cohérence UNEQUAL/PERCENTAGE)
  const sumShares = sharesPreview.reduce((s, x) => s + x.value, 0);
  const sharesValid =
    splitMode === "EQUAL" ||
    (splitMode === "UNEQUAL" && Math.abs(sumShares - totalAmount) < 0.01) ||
    (splitMode === "PERCENTAGE" &&
      Math.abs(
        Array.from(selectedParticipants).reduce(
          (s, id) => s + (customShares.get(id) ?? 0),
          0,
        ) - 100,
      ) < 0.01) ||
    // V237 — ITEMIZED : valide tant qu'on a ≥ 1 item ET ≥ 1 destinataire au
    // final (via assignedUserIds OU fallback selectedParticipants). Avant ce
    // fix, on exigeait `itemsSum === totalAmount` strict → blocage silencieux
    // dès qu'un item avait totalPrice vide ou différent. Maintenant on
    // proportionne (cf. sharesPreview) et on accepte tant que la structure
    // est cohérente. L'utilisateur peut toujours ajuster manuellement.
    (splitMode === "ITEMIZED" &&
      scannedItems.length > 0 &&
      hasItemizedAssignees);

  const totalPayerShares = payerShares.reduce((s, p) => s + (p.amount || 0), 0);
  const payersValid = !multiPayer || Math.abs(totalPayerShares - totalAmount) < 0.01;

  const canSubmit =
    description.trim().length > 0 &&
    totalAmount > 0 &&
    // V237 — En ITEMIZED, on n'exige pas selectedParticipants.size > 0 car
    // les destinataires viennent des items via assignedUserIds (avec fallback
    // sur selectedParticipants). Le test sharesValid couvre la cohérence.
    (splitMode === "ITEMIZED" || selectedParticipants.size > 0) &&
    sharesValid &&
    payersValid &&
    (!multiPayer ? paidByUserId.length > 0 : payerShares.length > 0);

  // V218.B — Guide utilisateur : retourne la liste des actions manquantes
  // pour que le bouton "Enregistrer" devienne cliquable. La première du tableau
  // est affichée en banner inline. Liste complète permet d'afficher le compteur
  // "Plus que X étapes" même si on n'affiche qu'un message à la fois.
  const missingActions = useMemo<string[]>(() => {
    const list: string[] = [];
    if (description.trim().length === 0) {
      list.push(
        t("expense.missingDescription") || "Renseigne une description (ex. Restaurant).",
      );
    }
    if (totalAmount <= 0) {
      list.push(
        t("expense.missingAmount") || "Indique un montant supérieur à 0.",
      );
    }
    if (selectedParticipants.size === 0) {
      list.push(
        t("expense.missingParticipants") ||
          "Coche au moins un participant au partage.",
      );
    }
    if (!multiPayer && paidByUserId.length === 0) {
      list.push(
        t("expense.missingPayer") || "Choisis qui a payé cette dépense.",
      );
    }
    if (multiPayer && payerShares.length === 0) {
      list.push(
        t("expense.missingPayerShares") ||
          "Renseigne au moins un payeur dans la section multi-payeurs.",
      );
    }
    if (splitMode === "UNEQUAL" && !sharesValid && totalAmount > 0) {
      const sum = Array.from(selectedParticipants).reduce(
        (s, id) => s + (customShares.get(id) ?? 0),
        0,
      );
      const diff = totalAmount - sum;
      list.push(
        diff > 0
          ? (t("expense.missingAmountRemaining") ||
              "Il reste {amount} à répartir.").replace(
              "{amount}",
              formatAmount(diff, currency),
            )
          : (t("expense.missingAmountOver") ||
              "Tu as réparti {amount} de trop, baisse une part.").replace(
              "{amount}",
              formatAmount(Math.abs(diff), currency),
            ),
      );
    }
    // V237 — Cas ITEMIZED : guide simplifié. On n'exige plus que itemsSum
    // matche totalAmount au centime près (le sharesPreview proportionne
    // automatiquement). Seuls 2 cas restent bloquants : aucun item, ou
    // aucun destinataire assignable (tous les participants décochés ET aucun
    // assignedUserIds sur les items).
    if (splitMode === "ITEMIZED" && totalAmount > 0) {
      if (scannedItems.length === 0) {
        list.push(
          t("expense.missingItems") ||
            "Ajoute au moins un article (ou scanne une facture).",
        );
      } else if (!hasItemizedAssignees) {
        list.push(
          t("expense.missingItemsAssignees") ||
            "Assigne chaque article à au moins une personne (ou coche au moins un participant).",
        );
      }
    }
    if (splitMode === "PERCENTAGE" && !sharesValid && totalAmount > 0) {
      const sum = Array.from(selectedParticipants).reduce(
        (s, id) => s + (customShares.get(id) ?? 0),
        0,
      );
      const diff = 100 - sum;
      list.push(
        diff > 0
          ? (t("expense.missingPercentRemaining") ||
              "Il reste {pct} % à répartir.").replace("{pct}", diff.toFixed(0))
          : (t("expense.missingPercentOver") ||
              "Tu as réparti {pct} % de trop, baisse une part.").replace(
              "{pct}",
              Math.abs(diff).toFixed(0),
            ),
      );
    }
    if (multiPayer && !payersValid && totalAmount > 0) {
      const diff = totalAmount - totalPayerShares;
      list.push(
        diff > 0
          ? (t("expense.missingPayerAmountRemaining") ||
              "Il reste {amount} à attribuer aux payeurs.").replace(
              "{amount}",
              formatAmount(diff, currency),
            )
          : (t("expense.missingPayerAmountOver") ||
              "Les payeurs cumulent {amount} de trop.").replace(
              "{amount}",
              formatAmount(Math.abs(diff), currency),
            ),
      );
    }
    return list;
  }, [
    description,
    totalAmount,
    selectedParticipants,
    multiPayer,
    paidByUserId,
    payerShares,
    splitMode,
    sharesValid,
    payersValid,
    customShares,
    totalPayerShares,
    currency,
    formatAmount,
    t,
    // V237 — dépendances ITEMIZED pour recalculer les messages d'aide
    scannedItems,
    itemsSum,
    hasItemizedAssignees,
  ]);

  function getMemberName(userId: string): string {
    const m = group.members.find(
      (mm) => (mm.user?.id || mm.userId || mm.id) === userId,
    );
    return m?.user?.displayName || "—";
  }

  function toggleParticipant(userId: string) {
    setSelectedParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function setCustomShare(userId: string, value: number) {
    // V218.C — Sliders interconnectés : à chaque modification, on rééquilibre
    // les AUTRES participants pour que la somme reste = total (UNEQUAL) ou
    // 100 % (PERCENTAGE). Le slider modifié garde sa nouvelle valeur, les
    // autres se répartissent proportionnellement le reste.
    setCustomShares((prev) => {
      const next = new Map(prev);
      const target = splitMode === "PERCENTAGE" ? 100 : totalAmount;
      // Si pas de target valide (montant = 0, mode EQUAL/ITEMIZED), on
      // garde l'ancien comportement (set simple, sans rebalance).
      if (splitMode !== "UNEQUAL" && splitMode !== "PERCENTAGE") {
        next.set(userId, value);
        return next;
      }
      if (target <= 0) {
        next.set(userId, value);
        return next;
      }
      // Clamp la valeur entre 0 et target.
      const clamped = Math.max(0, Math.min(target, value));
      next.set(userId, clamped);

      const ids = Array.from(selectedParticipants);
      const otherIds = ids.filter((id) => id !== userId);
      if (otherIds.length === 0) return next;

      const remaining = target - clamped;
      // Somme actuelle des autres pour calculer leurs ratios respectifs.
      const otherSum = otherIds.reduce(
        (s, id) => s + (prev.get(id) ?? 0),
        0,
      );
      if (otherSum === 0) {
        // Aucun autre slider n'a de valeur → distribution égale du remaining.
        const per = remaining / otherIds.length;
        otherIds.forEach((id) =>
          next.set(id, splitMode === "PERCENTAGE" ? Math.round(per) : per),
        );
      } else {
        // Distribution proportionnelle au ratio actuel de chaque autre.
        otherIds.forEach((id) => {
          const cur = prev.get(id) ?? 0;
          const ratio = cur / otherSum;
          const v = remaining * ratio;
          next.set(id, splitMode === "PERCENTAGE" ? Math.round(v) : v);
        });
      }
      return next;
    });
  }

  // ───────────────────────── Submit ──────────────────────────────────
  async function handleSubmit() {
    // V237 — Si !canSubmit, ne pas return silencieusement : on log + on
    // affiche un fallback dans submitError pour que l'utilisateur voie
    // pourquoi rien ne se passe (le banner GuideButton couvre normalement
    // les cas standards via missingActions, mais ce fallback protège
    // contre les bugs futurs).
    if (!canSubmit) {
      // eslint-disable-next-line no-console
      console.warn("[desktop-drawer] handleSubmit blocked", {
        description: description.trim(),
        totalAmount,
        selectedParticipants: selectedParticipants.size,
        splitMode,
        sharesValid,
        payersValid,
        scannedItems: scannedItems.length,
        itemsSum,
        hasItemizedAssignees,
      });
      if (missingActions.length === 0) {
        setSubmitError(
          t("expense.submitBlockedUnknown") ||
            "Impossible d'enregistrer la dépense — vérifie chaque champ.",
        );
      }
      return;
    }
    setSaving(true);
    // V218.A2 — Reset l'erreur précédente avant de retenter.
    setSubmitError(null);
    try {
      // V237 — En ITEMIZED, le backend traite la dépense comme EQUAL temporaire
      // (cf. expenses.service.ts computeShares case ITEMIZED). Les vraies parts
      // sont recalculées via /expenses/:id/itemized-shares après que les items
      // soient claimed. On envoie donc participants = union(assignedUserIds)
      // (ou fallback = selectedParticipants si rien d'assigné), SANS share —
      // le backend fait l'équipartition initiale, puis on persiste les claims
      // post-création pour figer la répartition réelle item-par-item.
      const itemizedParticipants =
        splitMode === "ITEMIZED" && itemizedShares && itemizedShares.size > 0
          ? Array.from(itemizedShares.keys()).map((userId) => ({ userId }))
          : [];

      const body: Record<string, unknown> = {
        description: description.trim(),
        amount: totalAmount.toFixed(2),
        currency,
        splitMode,
        category,
        // V216.C — Lieu de la dépense (optionnel)
        ...(location.trim() ? { location: location.trim() } : {}),
        // V238.B — Hash de la facture scannée pour anti-doublon.
        // Le backend stocke ce hash et refuse en 409 RECEIPT_DUPLICATE si
        // une autre dépense du même groupe a déjà ce hash exact (sauf en
        // mode édition ou si l'user a forcé via "Créer quand même").
        ...(!isEditing && scannedReceiptHash && !forceCreateDuplicate
          ? { receiptHash: scannedReceiptHash }
          : {}),
        occurredAt: new Date(date).toISOString(),
        participants:
          splitMode === "ITEMIZED"
            ? itemizedParticipants
            : sharesPreview.map((s) => {
                if (splitMode === "EQUAL") return { userId: s.userId };
                if (splitMode === "PERCENTAGE") {
                  return {
                    userId: s.userId,
                    share: customShares.get(s.userId) ?? 0,
                  };
                }
                // UNEQUAL — backend attend `share` (number), pas `amount` (string).
                // V237 — Avant ce fix on envoyait `amount: "x.xx"` qui était
                // strippé par Zod, ce qui faisait passer toutes les parts à 0
                // côté backend (validé par EQUAL fallback malgré tout, mais
                // incohérent avec ce que l'utilisateur voyait).
                return {
                  userId: s.userId,
                  share: customShares.get(s.userId) ?? 0,
                };
              }),
      };
      if (multiPayer) {
        body.payers = payerShares.map((p) => ({
          userId: p.userId,
          amount: p.amount.toFixed(2),
        }));
      } else {
        body.paidByUserId = paidByUserId;
      }
      let resultExpenseId: string | null = null;
      if (isEditing && editingExpense) {
        // V216.E — Édition : on PATCH avec les champs modifiables. Le backend
        // supporte le PATCH partiel ; ici on envoie tous les champs pour
        // simplifier (et garantir la cohérence des shares après mutation).
        const patchBody: any = {
          description: body.description,
          amount: body.amount,
          splitMode: body.splitMode,
          category: body.category,
          location: location.trim() || null,
          occurredAt: body.occurredAt,
          participants: body.participants,
        };
        if (multiPayer) {
          patchBody.payers = body.payers;
        } else {
          patchBody.paidByUserId = body.paidByUserId;
          // En sortant du mode multi-payeurs, on passe payers=[] pour effacer.
          patchBody.payers = [];
        }
        await api.updateExpense(editingExpense.id, patchBody);
        resultExpenseId = editingExpense.id;
        toast.success(t("expense.updated") || "Dépense modifiée");
      } else {
        const created = (await api.createExpense(group.id, body as any)) as
          | { id?: string }
          | undefined;
        resultExpenseId = created?.id ?? null;
        toast.success(t("expense.created") || "Dépense ajoutée");
      }

      // V224.B + V238.A — Si on est en mode ITEMIZED et qu'on a des items
      // détectés par scan, on les persiste via setExpenseItems. La dépense
      // est créée même si cette étape échoue — on toast un warning parlant
      // pour que l'utilisateur sache exactement ce qui s'est passé.
      let itemsPersistFailed = false;
      if (
        splitMode === "ITEMIZED" &&
        scannedItems.length > 0 &&
        resultExpenseId
      ) {
        try {
          // V239.A — On envoie aussi assignedUserIds pour que le backend crée
          // les ExpenseItemClaim correspondants ET recalcule les ExpenseShare
          // en mode ITEMIZED. Sans ça, le détail dépense affichait tous les
          // participants à parts égales (EQUAL temporaire posé à la création)
          // au lieu de la vraie répartition par articles.
          await api.setExpenseItems(
            resultExpenseId,
            scannedItems.map((it) => ({
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
              assignedUserIds:
                it.assignedUserIds && it.assignedUserIds.length > 0
                  ? it.assignedUserIds
                  : Array.from(selectedParticipants),
            })),
          );
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[desktop-drawer] setExpenseItems failed", err);
          itemsPersistFailed = true;
          toast.warning(
            t("expense.itemsPersistFailed") ||
              "Dépense créée, mais les articles n'ont pas pu être persistés. Tu peux les ajouter depuis le détail.",
          );
        }
      }

      // V226 + V238.A — Persiste le fichier scanné comme attachment RECEIPT.
      // Avant V226 le scan extrayait les données mais le File n'était jamais
      // sauvegardé, donc l'utilisateur ne retrouvait pas la facture dans la
      // galerie de preuves. Best-effort : si l'upload rate on remonte un
      // toast warning explicite (parseApiError pour le message).
      if (scannedFile && resultExpenseId) {
        try {
          await api.uploadAttachment(resultExpenseId, scannedFile, {
            kind: "RECEIPT",
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[desktop-drawer] uploadAttachment failed", err);
          const parsed = parseApiError(err, t);
          toast.warning(
            t("expense.receiptUploadFailed") ||
              `Dépense créée, mais la facture n'a pas pu être attachée. (${parsed.title})`,
          );
        }
      }

      // V238.A — Reset l'override doublon après succès pour éviter qu'un
      // futur scan profite d'un consentement périmé.
      setForceCreateDuplicate(false);
      setDuplicateWarning(null);
      setScannedReceiptHash(null);
      onCreated();
      onClose();
    } catch (e) {
      // V218.A2 + V238.A — Erreur backend gardée inline dans le drawer (au
      // lieu de toast volatile). On parse l'erreur pour produire un
      // `{ title, body }` parlant, et on push aussi un toast pour la
      // visibilité immédiate (le banner persistant + le toast 4s = double
      // canal sans redondance gênante).
      //
      // Cas particulier V238.B : si l'erreur est un 409 RECEIPT_DUPLICATE,
      // on bascule vers le banner saffron dédié (avec CTA "Voir la dépense"
      // + "Créer quand même") plutôt que le banner terracotta générique.
      const parsed = parseApiError(e, t);
      if (
        parsed.code === "RECEIPT_DUPLICATE" &&
        parsed.details &&
        (parsed.details as any).existingExpense
      ) {
        const ex = (parsed.details as any).existingExpense;
        setDuplicateWarning({
          existingExpenseId: ex.id || ex.expenseId,
          description: ex.description ?? "",
          amount: ex.amount ?? "",
          date: ex.occurredAt
            ? new Date(ex.occurredAt).toISOString().slice(0, 10)
            : ex.date ?? "",
          pendingFile: scannedFile ?? undefined,
        });
        // On nettoie aussi tout submitError résiduel pour ne pas cumuler 2
        // banners. Le saffron du doublon prime sur le terracotta erreur.
        setSubmitError(null);
      } else {
        setSubmitError({ title: parsed.title, body: parsed.body });
        toast.error(formatParsedError(parsed));
      }
    } finally {
      setSaving(false);
    }
  }

  // ═══════════════ V216.H — Options IA (scan/PDF/voix) ═══════════════
  // En mode édition on cache les boutons IA — pas de sens de re-scanner par-dessus.
  const [aiBusy, setAiBusy] = useState<null | "scan" | "voice">(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<{
    rec: MediaRecorder;
    chunks: Blob[];
    stop: () => Promise<Blob>;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  // V222.A — Ref de "génération" pour ignorer le résultat IA si l'utilisateur
  // a annulé entre temps (l'API ne supporte pas encore AbortController, donc
  // on laisse la promise se terminer en arrière-plan et on jette le résultat).
  const aiCancelTokenRef = useRef(0);

  /**
   * V224.A — Applique le résultat IA en écrasant TOUS les champs précédents.
   *
   * Règle métier validée avec Fabrice : « tant que la dépense n'est pas
   * enregistrée, le dernier enregistrement vient effacer les autres ». Donc
   * scan / voice / manuel ne se mélangent jamais — chaque nouvelle analyse
   * IA repart d'un état propre + applique le payload reçu.
   *
   * Les champs non fournis par l'IA reviennent au défaut (et pas à l'ancienne
   * valeur saisie manuellement). Le mode édition (`editingExpense`) n'est
   * pas concerné — les boutons IA y sont déjà cachés.
   *
   * V224.B — Si le scan a détecté des items (line_items), on bascule auto
   * en mode ITEMIZED et on pré-remplit `scannedItems` + `customShares` (les
   * items sont distribués égalitairement entre les participants ou alignés
   * sur le total).
   */
  function applyAiResult(
    parsed: {
      description?: string | null;
      merchant?: string | null;
      amount?: string | number | null;
      currency?: string | null;
      date?: string | null;
      category?: string | null;
      items?: Array<{
        description: string;
        quantity: number;
        unitPrice: string;
        totalPrice: string;
      }> | null;
    },
    source: "scan" | "voice" = "scan",
  ) {
    // ─── 1. Reset complet de TOUS les champs aux valeurs par défaut ─────
    // (sauf le mode édition qui n'utilise pas ces boutons — guard plus haut.)
    setDescription("");
    setAmount("");
    setPaidByUserId(me?.id ?? "");
    setCategory("OTHER");
    setDate(new Date().toISOString().slice(0, 10));
    setLocation("");
    setCurrency(group.defaultCurrency ?? "EUR");
    setSplitMode("EQUAL");
    setMultiPayer(false);
    setPayerShares([]);
    setSelectedParticipants(new Set(memberIds));
    setCustomShares(new Map());
    setScannedItems([]);
    // V226 — Reset scannedFile aussi : le scan suivant va le remplacer.
    setScannedFile(null);
    setSubmitError(null);
    // V238.B — Reset banner doublon + état d'override + hash : tout repart
    // de zéro à chaque nouvelle source IA (sinon un ancien doublon "fantôme"
    // resterait visible alors que le user a relancé un scan différent).
    setDuplicateWarning(null);
    setForceCreateDuplicate(false);
    setScannedReceiptHash(null);

    // ─── 2. Apply ce que l'IA a détecté par-dessus ─────────────────────
    if (parsed.description || parsed.merchant) {
      setDescription(String(parsed.description || parsed.merchant || ""));
    }
    if (parsed.amount != null) {
      const v =
        typeof parsed.amount === "number"
          ? parsed.amount.toString()
          : parsed.amount;
      setAmount(v);
    }
    if (parsed.currency) {
      setCurrency(parsed.currency);
    }
    if (parsed.date) {
      try {
        const d = new Date(parsed.date);
        if (!isNaN(d.getTime())) setDate(d.toISOString().slice(0, 10));
      } catch {
        /* ignore */
      }
    }
    if (parsed.category) {
      setCategory(parsed.category);
    }

    // ─── 3. V224.B — Items ITEMIZED ─────────────────────────────────────
    if (parsed.items && parsed.items.length > 0) {
      setScannedItems(parsed.items);
      setSplitMode("ITEMIZED");
      // Toast info : on a basculé en mode ITEMIZED.
      // V225 — utilise le t() BMD avec interpolation native {count} single-brace
      toast.info(
        t("expense.itemizedDetected", {
          count: String(parsed.items.length),
        }) ||
          `Mode partage par articles activé (${parsed.items.length} lignes détectées).`,
      );
    }

    // ─── 4. Toast info sur l'écrasement ────────────────────────────────
    const sourceLabel =
      source === "scan"
        ? t("expense.aiSourceScan") || "scan"
        : t("expense.aiSourceVoice") || "dictée";
    toast.info(
      t("expense.aiApplied", { source: sourceLabel }) ||
        `✓ Données appliquées par ${sourceLabel}`,
    );
  }

  async function handleScanFile(file: File) {
    // V222.A — Génère un token unique pour cette exécution. Si l'utilisateur
    // annule (incrémente le token), on jette le résultat à l'arrivée.
    aiCancelTokenRef.current += 1;
    const myToken = aiCancelTokenRef.current;
    setAiBusy("scan");
    try {
      // V238.B — Preprocess CLIENT (compression + SHA-256 hash) avant
      // l'envoi backend. Le hash sert au check anti-doublon V42 (cf.
      // scan-receipt-modal.tsx ligne 194). Avant V238 le drawer desktop
      // envoyait le file brut sans hash, donc le backend ne pouvait pas
      // détecter qu'on rescannait la même facture.
      let optimizedFile = file;
      let receiptHash: string | undefined = undefined;
      try {
        const opt = await preprocessReceiptFile(file);
        optimizedFile = opt.file;
        receiptHash = opt.hash || undefined;
      } catch (preErr) {
        // Si la compression plante (rare, navigateur exotique), on tente
        // d'envoyer l'original sans hash. Le scan marche quand même mais
        // l'anti-doublon ne sera pas vérifié.
        // eslint-disable-next-line no-console
        console.warn("[desktop-drawer] preprocess scan échoué, fallback:", preErr);
      }
      const r = await api.scanReceipt(optimizedFile, group.id, receiptHash);
      if (aiCancelTokenRef.current !== myToken) {
        // L'utilisateur a annulé pendant l'appel — on ignore le résultat.
        return;
      }
      applyAiResult(
        {
          description: r.merchant,
          amount: r.amount ?? undefined,
          currency: r.currency,
          date: r.date,
          category: r.category,
          // V224.B — Les line_items détectés par Mindee/OpenAI (si présents).
          items: r.items && r.items.length > 0 ? r.items : null,
        },
        "scan",
      );
      // V226 — On garde le File pour l'uploader comme attachment RECEIPT
      // après création/édition. applyAiResult a remis scannedFile à null
      // juste avant, donc on le re-set ici (l'ordre est important).
      setScannedFile(file);
      // V238.B — Persist le hash pour l'envoyer à createExpense (anti-doublon
      // ex post stocké côté backend) + détecter ce hash si le user rescan.
      const hashToPersist = receiptHash ?? r.receiptHash;
      if (hashToPersist) setScannedReceiptHash(hashToPersist);

      // V238.B — Si le backend a détecté un doublon potentiel (hash strict
      // OU fuzzy match merchant+amount+date), affiche le banner saffron
      // dédié. L'utilisateur peut soit voir la dépense existante, soit
      // forcer la création quand même.
      if (r.potentialDuplicateOf) {
        setDuplicateWarning({
          existingExpenseId: r.potentialDuplicateOf.expenseId,
          description: r.potentialDuplicateOf.description,
          amount: r.potentialDuplicateOf.amount,
          date: r.potentialDuplicateOf.date,
          pendingFile: file,
        });
        toast.info(t("scan.duplicate.toastWarn") || "Doublon possible détecté");
      } else {
        toast.success(t("expense.aiScanSuccess") || "Reçu analysé ✓");
      }
    } catch (e) {
      if (aiCancelTokenRef.current !== myToken) return;
      // V238.A — parseApiError pour messages parlants (réseau / quota /
      // format invalide / serveur). On push sur submitError + toast.
      const parsed = parseApiError(e, t);
      setSubmitError({ title: parsed.title, body: parsed.body });
      toast.error(formatParsedError(parsed));
    } finally {
      if (aiCancelTokenRef.current === myToken) {
        setAiBusy(null);
      }
    }
  }

  /** V222.A — Annule l'analyse IA en cours (scan ou voice). Le call API
   *  continue en arrière-plan mais on jette son résultat à l'arrivée. */
  function cancelAi() {
    aiCancelTokenRef.current += 1;
    setAiBusy(null);
  }

  async function startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const stop = (): Promise<Blob> =>
        new Promise((resolve) => {
          rec.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
          };
          rec.stop();
        });
      rec.start();
      recorderRef.current = { rec, chunks, stop };
      setRecording(true);
    } catch (e) {
      // V238.A — getUserMedia échoue typiquement avec NotAllowedError /
      // NotFoundError. On garde un message clair (i18n) + on remonte aussi
      // dans submitError pour persistance (au cas où l'utilisateur a raté
      // le toast).
      const errMsg =
        t("expense.aiMicError") ||
        "Impossible d'accéder au micro (autorise-le dans le navigateur)";
      toast.error(errMsg);
      setSubmitError({ title: errMsg });
    }
  }

  async function stopVoiceRecording() {
    const r = recorderRef.current;
    if (!r) return;
    setRecording(false);
    // V222.A — Token d'annulation comme pour scan.
    aiCancelTokenRef.current += 1;
    const myToken = aiCancelTokenRef.current;
    setAiBusy("voice");
    try {
      const blob = await r.stop();
      if (aiCancelTokenRef.current !== myToken) return;
      const result = await api.voiceToExpense(blob, { groupId: group.id });
      if (aiCancelTokenRef.current !== myToken) return;
      applyAiResult(
        {
          description: result.parsed.description,
          amount: result.parsed.amount ?? undefined,
          currency: result.parsed.currency ?? undefined,
          category: result.parsed.category,
          // Voice ne retourne pas d'items (transcription pure) — items reste null.
          items: null,
        },
        "voice",
      );
      toast.success(t("expense.aiVoiceSuccess") || "Voix transcrite ✓");
    } catch (e) {
      if (aiCancelTokenRef.current !== myToken) return;
      // V238.A — parseApiError pour messages parlants (quota voicePerMonth,
      // réseau, Whisper down, etc.).
      const parsed = parseApiError(e, t);
      setSubmitError({ title: parsed.title, body: parsed.body });
      toast.error(formatParsedError(parsed));
    } finally {
      recorderRef.current = null;
      if (aiCancelTokenRef.current === myToken) {
        setAiBusy(null);
      }
    }
  }

  // ───────────────────────── Rendu ───────────────────────────────────
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex" }}
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop flouté */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(43,31,21,0.45)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Panneau droit
          V218.D — Layout condensé : padding réduit (12px 18px) pour gagner
          de la place verticale. Le contenu interne utilise gaps 10-12px au
          lieu de 14-18px, ce qui permet aux options avancées ouvertes de
          tenir sans scroll global. */}
      <aside
        style={{
          position: "relative",
          marginLeft: "auto",
          width: "min(820px, 70vw)",
          height: "100vh",
          background: "#FAF6EE",
          color: "#2B1F15",
          borderLeft: "0.5px solid #D9C8A6",
          overflowY: "auto",
          boxShadow: "-4px 0 24px rgba(43,31,21,0.10)",
          padding: "12px 18px 16px",
          animation: "slideInRight 0.18s ease-out",
        }}
      >
        <style>{`@keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

        {/* Header drawer — V218.D : margin réduite (16 → 10) */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: "#2B1F15" }}>
            {isEditing
              ? t("expense.editExpense") || "Modifier la dépense"
              : t("expense.newExpense") || "Nouvelle dépense"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "transparent",
              border: "none",
              color: "#8B6F47",
              fontSize: 18,
              cursor: "pointer",
              padding: "2px 8px",
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </header>

        {/* V216.H — Toolbar IA : Scan reçu (image/PDF) + Voix. Pré-remplit
            description/montant/devise/date/catégorie via OCR ou Whisper.
            Cachée en mode édition (pas de sens d'écraser une dépense existante). */}
        {!isEditing && (
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "10px 12px",
              background: "rgba(197,138,46,0.06)",
              border: "0.5px solid rgba(197,138,46,0.25)",
              borderRadius: 9,
              marginBottom: 14,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "#8B6F47",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginRight: 4,
              }}
            >
              {t("expense.aiHint") || "✨ Auto-remplir"}
            </span>
            <input
              ref={scanInputRef}
              type="file"
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleScanFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => scanInputRef.current?.click()}
              disabled={aiBusy !== null}
              style={{
                padding: "6px 12px",
                background: aiBusy === "scan" ? "#D9C8A6" : "#FFFFFF",
                color: "#2B1F15",
                border: "0.5px solid #D9C8A6",
                borderRadius: 7,
                fontSize: 11,
                cursor: aiBusy ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {aiBusy === "scan"
                ? t("expense.aiScanning") || "Analyse…"
                : t("expense.aiScanCta") || "📷 Scanner un reçu"}
            </button>
            <button
              type="button"
              onClick={recording ? stopVoiceRecording : startVoiceRecording}
              disabled={aiBusy === "scan"}
              style={{
                padding: "6px 12px",
                background: recording
                  ? "#9F4628"
                  : aiBusy === "voice"
                    ? "#D9C8A6"
                    : "#FFFFFF",
                color: recording ? "#FFFFFF" : "#2B1F15",
                border: "0.5px solid #D9C8A6",
                borderRadius: 7,
                fontSize: 11,
                cursor: aiBusy === "scan" ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {recording
                ? t("expense.aiVoiceStop") || "⏹ Arrêter"
                : aiBusy === "voice"
                  ? t("expense.aiVoiceProcessing") || "Transcription…"
                  : t("expense.aiVoiceCta") || "🎙 Dicter"}
            </button>
            <span style={{ fontSize: 10, color: "#8B6F47", marginLeft: "auto" }}>
              {t("expense.aiHelp") ||
                "Le scan accepte aussi les PDF de facture."}
            </span>
          </div>
        )}

        {/* V238.B — Banner doublon scan facture (saffron, pas terracotta).
            Apparaît quand le backend a détecté un doublon (hash strict ou
            fuzzy match merchant+amount+date). Inclut CTA "Voir la dépense"
            (lien direct vers /expenses/:id) + "Créer quand même" (force
            override : le hash n'est plus envoyé au prochain submit). */}
        {!isEditing && duplicateWarning && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px 14px",
              background: "#FAEFD3",
              border: "0.5px solid rgba(197,138,46,0.45)",
              borderLeft: "3px solid #C58A2E",
              borderRadius: 11,
              marginBottom: 12,
              fontSize: 12,
              color: "#2B1F15",
            }}
            role="alert"
          >
            <span style={{ fontSize: 16, color: "#C58A2E", lineHeight: 1.2 }}>
              ⚠
            </span>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <strong style={{ fontWeight: 600 }}>
                {t("scan.duplicate.title") ||
                  "Cette facture a déjà été scannée"}
              </strong>
              <span style={{ color: "#5A4632", fontSize: 11 }}>
                {t("scan.duplicate.body", {
                  date: duplicateWarning.date || "—",
                  description: duplicateWarning.description || "—",
                }) ||
                  `Tu l'avais ajoutée le ${duplicateWarning.date || "—"} dans la dépense « ${duplicateWarning.description || "—"} ».`}
              </span>
              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <a
                  href={`/dashboard/groups/${group.id}/expenses?expense=${duplicateWarning.existingExpenseId}`}
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    background: "#FFFFFF",
                    color: "#2B1F15",
                    border: "0.5px solid #D9C8A6",
                    borderRadius: 7,
                    textDecoration: "none",
                    fontFamily: "inherit",
                    fontWeight: 500,
                  }}
                >
                  {t("scan.duplicate.viewCta") || "Voir la dépense"}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    // V238.B — Force override via dialog.confirm explicite.
                    // Le user doit confirmer qu'il veut bien créer un doublon.
                    const ok = window.confirm(
                      (t("scan.duplicate.forceConfirmTitle") ||
                        "Forcer la création ?") +
                        "\n\n" +
                        (t("scan.duplicate.forceConfirmBody") ||
                          "Une dépense identique existe déjà. Tu vas créer un doublon."),
                    );
                    if (ok) {
                      setForceCreateDuplicate(true);
                      setDuplicateWarning(null);
                    }
                  }}
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    background: "#C58A2E",
                    color: "#FAF6EE",
                    border: "none",
                    borderRadius: 7,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontWeight: 500,
                  }}
                >
                  {t("scan.duplicate.forceCta") || "Créer quand même"}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              aria-label={t("common.close") || "Fermer"}
              style={{
                background: "transparent",
                border: "none",
                color: "#8B6F47",
                cursor: "pointer",
                padding: "0 4px",
                fontFamily: "inherit",
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* V226 — Aperçu de la facture scannée gardée en mémoire. Donne à
            l'utilisateur la confirmation visuelle qu'elle sera bien attachée
            à la dépense (sinon c'était silencieux, et il ne savait pas si
            ça allait être sauvegardé). Bouton "X" pour la retirer si jamais. */}
        {!isEditing && scannedFile && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              background: "rgba(58,124,79,0.08)",
              border: "0.5px solid rgba(58,124,79,0.35)",
              borderRadius: 9,
              marginBottom: 12,
              fontSize: 11,
              color: "#3A7C4F",
            }}
          >
            <span style={{ fontSize: 14 }}>📎</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, color: "#2B1F15" }}>
                {t("expense.receiptAttached") ||
                  "Facture jointe à la dépense"}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#8B6F47",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {scannedFile.name} ·{" "}
                {Math.round(scannedFile.size / 1024)} Ko
              </div>
            </div>
            <button
              type="button"
              onClick={() => setScannedFile(null)}
              aria-label={t("common.remove") || "Retirer"}
              style={{
                background: "transparent",
                border: "none",
                color: "#8B6F47",
                fontSize: 14,
                cursor: "pointer",
                padding: "2px 6px",
                fontFamily: "inherit",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* V222.A — Panneau de progression IA captivant pendant scan/voice.
            Remplace l'ancien feedback minimal (juste un libellé "Analyse…"
            dans le bouton). Affiche 4 étapes visuelles + ligne lumineuse +
            astuce tournante + bouton Annuler. */}
        {aiBusy === "scan" && (
          <AiProgressTimeline mode="scan" onCancel={cancelAi} />
        )}
        {aiBusy === "voice" && (
          <AiProgressTimeline mode="voice" onCancel={cancelAi} />
        )}

        {/* V218.D — Grid plus serré : gap 18 → 12 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* === COL GAUCHE : champs principaux ============================ */}
          <div>
            <FieldLabel>{t("expense.description") || "Description"}</FieldLabel>
            <input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ex. Restaurant Da Luigi"
              style={inputUnderlineStyle}
            />

            <FieldLabel mt={14}>{t("expense.amount") || "Montant"}</FieldLabel>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                style={{
                  ...inputUnderlineStyle,
                  width: 140,
                  fontSize: 26,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.5px",
                }}
              />
              <CurrencySelector
                value={currency}
                onChange={setCurrency}
                ariaLabel={t("expense.currency") || "Devise"}
                style={{ minWidth: 110 }}
              />
            </div>
            {currency !== group.defaultCurrency && (
              <div style={{ fontSize: 10, color: "#8B6F47", marginTop: 4 }}>
                {t("expense.currencyHint") ||
                  `Devise différente de celle du groupe (${group.defaultCurrency}) — les autres verront la conversion.`}
              </div>
            )}

            {/* Payeur (caché si multi-payeurs ON) */}
            {!multiPayer && (
              <>
                <FieldLabel mt={14}>{t("expense.paidBy") || "Payé par"}</FieldLabel>
                <select
                  value={paidByUserId}
                  onChange={(e) => setPaidByUserId(e.target.value)}
                  style={selectStyle}
                >
                  {group.members.map((m) => {
                    const id = m.user?.id || m.userId || m.id;
                    const label =
                      m.user?.id === me?.id
                        ? `Toi (${m.user?.displayName})`
                        : m.user?.displayName || "—";
                    return (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </>
            )}

            <FieldLabel mt={14}>{t("expense.category") || "Catégorie"}</FieldLabel>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={selectStyle}
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>

            <FieldLabel mt={14}>{t("expense.date") || "Date"}</FieldLabel>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={selectStyle}
            />

            {/* V216.C — Champ Lieu optionnel (texte libre, transmis au backend
                seulement si renseigné). Permet à l'utilisateur de noter le lieu
                exact d'une dépense ("Boulanger rue Lafayette"). */}
            <FieldLabel mt={14}>{t("expense.location") || "Lieu (optionnel)"}</FieldLabel>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("expense.locationPlaceholder") || "ex. Boulanger rue Lafayette"}
              maxLength={120}
              style={selectStyle}
            />
          </div>

          {/* === COL DROITE : aperçu parts ====================== */}
          <div style={{ background: "#F4ECD9", borderRadius: 11, padding: 14 }}>
            <div
              style={{
                fontSize: 10,
                color: "#8B6F47",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              {t("expense.sharePreview") || "aperçu du partage"}
            </div>
            {sharesPreview.length === 0 ? (
              <div
                style={{
                  fontSize: 11,
                  color: "#8B6F47",
                  padding: "20px 0",
                  textAlign: "center",
                }}
              >
                {t("expense.previewEmpty") ||
                  "Renseigne un montant pour voir le partage"}
              </div>
            ) : (
              sharesPreview.map((s, i) => (
                <div
                  key={s.userId + i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "5px 0",
                    fontSize: 11,
                    borderBottom:
                      i === sharesPreview.length - 1
                        ? "none"
                        : "0.5px dashed rgba(139,111,71,0.25)",
                  }}
                >
                  <span>
                    {s.userId === me?.id ? "Toi" : getMemberName(s.userId)}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatAmount(s.value, currency)}
                    {splitMode === "PERCENTAGE" && (
                      <span style={{ color: "#8B6F47", marginLeft: 4 }}>
                        ({(customShares.get(s.userId) ?? 0).toFixed(0)}%)
                      </span>
                    )}
                  </span>
                </div>
              ))
            )}
            {!sharesValid && sharesPreview.length > 0 && (
              <div
                style={{
                  fontSize: 10,
                  color: "#9F4628",
                  background: "rgba(159,70,40,0.08)",
                  borderRadius: 6,
                  padding: 6,
                  marginTop: 8,
                }}
              >
                {splitMode === "PERCENTAGE"
                  ? t("expense.percentageNot100") ||
                    "La somme des pourcentages doit être 100 %"
                  : t("expense.amountsMismatch") ||
                    "La somme des montants doit égaler le total"}
              </div>
            )}
            <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
              <ModePill active={splitMode === "EQUAL"}>Égal</ModePill>
              <ModePill active={splitMode === "UNEQUAL"}>Montants</ModePill>
              <ModePill active={splitMode === "PERCENTAGE"}>Pourcentages</ModePill>
              {/* V237 — ModePill "Par articles" ajouté. Sans ça, en mode
                  ITEMIZED, l'aperçu n'indiquait visuellement aucun mode actif
                  → Fabrice croyait être resté en EQUAL avec tous les membres
                  à 0 €. Maintenant un highlight saffron actif rend le mode
                  ITEMIZED clairement identifiable dans l'aperçu. */}
              <ModePill active={splitMode === "ITEMIZED"}>Par articles</ModePill>
              {multiPayer && (
                <ModePill active>👥 Multi-payeurs</ModePill>
              )}
            </div>
          </div>
        </div>

        {/* ─────────────── Toggle "Options avancées" inline ───────────────
             V218.D — Margin-top réduit (22 → 12). */}
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: advancedOpen ? "#F4ECD9" : "transparent",
              color: "#2B1F15",
              border: "0.5px solid #D9C8A6",
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              width: "100%",
              justifyContent: "space-between",
            }}
          >
            <span>
              {advancedOpen ? "▾" : "▸"}{" "}
              {t("expense.advancedOptions") || "Options avancées"}
            </span>
            <span style={{ fontSize: 10, color: "#8B6F47", fontWeight: 400 }}>
              {t("expense.advancedHint") ||
                "Mode de partage · Multi-payeurs · Participants"}
            </span>
          </button>

          {advancedOpen && (
            <div
              style={{
                marginTop: 8,
                padding: 12,
                background: "#FFFFFF",
                border: "0.5px solid #D9C8A6",
                borderRadius: 11,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* Mode de répartition */}
              <section>
                <FieldLabel>
                  {t("expense.splitMode") || "Mode de répartition"}
                </FieldLabel>
                <div style={{ marginTop: 6 }}>
                  <SegmentedControl<SplitMode>
                    value={splitMode}
                    onChange={setSplitMode}
                    segments={[
                      { value: "EQUAL", label: t("expense.splitEqual") || "Égal" },
                      {
                        value: "UNEQUAL",
                        label: t("expense.splitUnequal") || "Montants",
                      },
                      {
                        value: "PERCENTAGE",
                        label: t("expense.splitPercentage") || "Pourcentages",
                      },
                      {
                        value: "ITEMIZED",
                        label: t("expense.splitItemized") || "Articles",
                      },
                    ]}
                    size="sm"
                  />
                </div>
                {(splitMode === "UNEQUAL" || splitMode === "PERCENTAGE") &&
                  selectedParticipants.size > 0 && (() => {
                    // V216.D — Sliders + champ numérique synchronisés. Le slider
                    // donne un feedback visuel immédiat, le champ permet une
                    // saisie précise. Sum control en haut indique si la somme
                    // est cohérente (vert) ou pas (terracotta).
                    const max = splitMode === "PERCENTAGE" ? 100 : Math.max(totalAmount, 1);
                    const step = splitMode === "PERCENTAGE" ? 1 : Math.max(totalAmount / 100, 0.01);
                    const target = splitMode === "PERCENTAGE" ? 100 : totalAmount;
                    const currentSum = Array.from(selectedParticipants).reduce(
                      (s, id) => s + (customShares.get(id) ?? 0),
                      0,
                    );
                    const diff = target - currentSum;
                    const isSumOk = Math.abs(diff) < 0.01;
                    return (
                      <div
                        style={{
                          marginTop: 10,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {/* Sum control header */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 10px",
                            background: isSumOk
                              ? "rgba(58,124,79,0.10)"
                              : "rgba(159,70,40,0.10)",
                            borderRadius: 7,
                            border: `0.5px solid ${
                              isSumOk
                                ? "rgba(58,124,79,0.4)"
                                : "rgba(159,70,40,0.4)"
                            }`,
                            fontSize: 11,
                            color: isSumOk ? "#3A7C4F" : "#9F4628",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <span>
                            {t("expense.sumProgress") || "Somme actuelle"}
                          </span>
                          <span style={{ fontWeight: 500 }}>
                            {splitMode === "PERCENTAGE"
                              ? `${currentSum.toFixed(0)} / 100 %`
                              : `${formatAmount(currentSum, currency)} / ${formatAmount(target, currency)}`}
                            {!isSumOk && (
                              <span style={{ marginLeft: 6, fontWeight: 400 }}>
                                ({diff > 0 ? "+" : ""}
                                {splitMode === "PERCENTAGE"
                                  ? `${diff.toFixed(0)} %`
                                  : formatAmount(Math.abs(diff), currency)}
                                {diff > 0
                                  ? ` ${t("expense.sumRemaining") || "restant"}`
                                  : ` ${t("expense.sumOver") || "en trop"}`}
                                )
                              </span>
                            )}
                          </span>
                        </div>
                        {/* Quick repartition button */}
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => {
                              const ids = Array.from(selectedParticipants);
                              const per = target / ids.length;
                              const m = new Map<string, number>();
                              ids.forEach((id, idx) => {
                                m.set(
                                  id,
                                  idx === ids.length - 1
                                    ? target - per * (ids.length - 1)
                                    : per,
                                );
                              });
                              setCustomShares(m);
                            }}
                            style={miniLinkStyle}
                          >
                            {t("expense.splitEvenly") || "Répartir équitablement"}
                          </button>
                        </div>
                        {Array.from(selectedParticipants).map((id) => {
                          const v = customShares.get(id) ?? 0;
                          const pct = max > 0 ? Math.min((v / max) * 100, 100) : 0;
                          return (
                            <div
                              key={id}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "110px 1fr 90px",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#2B1F15",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                                title={id === me?.id ? "Toi" : getMemberName(id)}
                              >
                                {id === me?.id ? "Toi" : getMemberName(id)}
                              </span>
                              <input
                                type="range"
                                min={0}
                                max={max}
                                step={step}
                                value={v}
                                onChange={(e) =>
                                  setCustomShare(id, parseFloat(e.target.value) || 0)
                                }
                                aria-label={`${getMemberName(id)} share`}
                                style={{
                                  width: "100%",
                                  accentColor: "#C58A2E",
                                  cursor: "pointer",
                                  // Hint visuel : barre de progression sous le slider
                                  background: `linear-gradient(to right, rgba(197,138,46,0.20) 0%, rgba(197,138,46,0.20) ${pct}%, rgba(217,200,166,0.20) ${pct}%, rgba(217,200,166,0.20) 100%)`,
                                  borderRadius: 4,
                                }}
                              />
                              <input
                                type="number"
                                inputMode="decimal"
                                value={customShares.get(id) ?? ""}
                                onChange={(e) =>
                                  setCustomShare(
                                    id,
                                    parseFloat(e.target.value || "0") || 0,
                                  )
                                }
                                placeholder={splitMode === "PERCENTAGE" ? "%" : currency}
                                style={{
                                  ...selectStyle,
                                  marginTop: 0,
                                  padding: "4px 8px",
                                  fontVariantNumeric: "tabular-nums",
                                  fontSize: 11,
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                {/* V225.C/E — Éditeur d'articles inline pour le mode ITEMIZED.
                    Visible UNIQUEMENT quand splitMode === "ITEMIZED". Pré-rempli
                    automatiquement par le scan IA (parsed.items via applyAiResult),
                    et l'utilisateur peut ajouter / supprimer / éditer chaque
                    ligne manuellement. Le bandeau en haut indique si la somme
                    des items matche le montant total de la dépense. */}
                {splitMode === "ITEMIZED" && (
                  <div style={{ marginTop: 12 }}>
                    <ItemizedEditor
                      items={scannedItems}
                      onChange={setScannedItems}
                      totalAmount={amount || "0"}
                      currency={currency}
                      members={group.members.map((m) => ({
                        id: m.user?.id || m.userId || m.id,
                        displayName: m.user?.displayName || "—",
                      }))}
                    />
                  </div>
                )}
              </section>

              {/* Multi-payeurs — V245.A : disponible quel que soit le splitMode
                  (la dimension "qui a payé" est orthogonale à "comment on
                  partage"). En édition, on cache la checkbox sauf si la
                  dépense a déjà des payers (workflow à risque sinon — cf.
                  V239.C). */}
              {(!isEditing ||
                  (editingExpense?.payers && editingExpense.payers.length > 0)) && (
              <section>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#2B1F15",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={multiPayer}
                    onChange={(e) => {
                      setMultiPayer(e.target.checked);
                      if (e.target.checked && payerShares.length === 0) {
                        // Initialise avec le payeur unique courant
                        setPayerShares([
                          { userId: paidByUserId, amount: totalAmount },
                        ]);
                      }
                    }}
                  />
                  {t("expense.multiPayers") || "Plusieurs payeurs"}
                </label>
                {multiPayer && (
                  <div style={{ marginTop: 10 }}>
                    <MultiPayersEditor
                      // V239.C — Le composant attend `{ id, displayName }` et
                      // une prop `meId`. Avant V239 on passait `{ userId, displayName }`
                      // → member.find() ne matchait jamais → liste vide
                      // (et `meId` undefined provoquait des crashs au clic
                      // sur la checkbox interne de MultiPayersEditor).
                      members={group.members.map((m) => ({
                        id: m.user?.id || m.userId || m.id,
                        displayName: m.user?.displayName || "—",
                      }))}
                      meId={me?.id ?? ""}
                      totalAmount={totalAmount.toString()}
                      currency={currency}
                      // Convertit notre payerShares (amount: number) vers le
                      // format attendu par MultiPayersEditor (amount: string).
                      value={payerShares.map((p) => ({
                        userId: p.userId,
                        amount: String(p.amount ?? 0),
                      }))}
                      onChange={(next) =>
                        setPayerShares(
                          next.map((p) => ({
                            userId: p.userId,
                            amount: parseFloat(p.amount ?? "0") || 0,
                          })),
                        )
                      }
                    />
                    {!payersValid && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "#9F4628",
                          background: "rgba(159,70,40,0.08)",
                          borderRadius: 6,
                          padding: 6,
                          marginTop: 6,
                        }}
                      >
                        {t("expense.payersMismatch") ||
                          "La somme des paiements doit égaler le total"}
                      </div>
                    )}
                  </div>
                )}
              </section>
              )}

              {/* Participants */}
              <section>
                <FieldLabel>
                  {t("expense.participants") || "Participants au partage"}{" "}
                  {/* V216.B — Compteur live X/Y. memberIds = total group members,
                      selectedParticipants = ceux cochés. Sans ça l'utilisateur
                      ne savait pas combien il avait sélectionné. */}
                  <span
                    style={{
                      fontSize: 10,
                      color: "#8B6F47",
                      fontWeight: 400,
                      marginLeft: 4,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    ({selectedParticipants.size}/{memberIds.length})
                  </span>
                </FieldLabel>
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {group.members.map((m) => {
                    const id = m.user?.id || m.userId || m.id;
                    const active = selectedParticipants.has(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleParticipant(id)}
                        style={{
                          padding: "5px 11px",
                          background: active ? "#C58A2E" : "transparent",
                          color: active ? "#2B1F15" : "#8B6F47",
                          border: `0.5px solid ${active ? "#C58A2E" : "#D9C8A6"}`,
                          borderRadius: 18,
                          fontSize: 11,
                          fontWeight: active ? 500 : 400,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {active ? "✓ " : ""}
                        {id === me?.id ? "Toi" : m.user?.displayName || "—"}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedParticipants(new Set(memberIds))}
                    style={miniLinkStyle}
                  >
                    {t("expense.selectAll") || "Tous"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedParticipants(new Set())}
                    style={miniLinkStyle}
                  >
                    {t("expense.selectNone") || "Aucun"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedParticipants((prev) => {
                        const next = new Set<string>();
                        memberIds.forEach((id) => {
                          if (!prev.has(id)) next.add(id);
                        });
                        return next;
                      });
                    }}
                    style={miniLinkStyle}
                  >
                    {t("expense.selectInvert") || "Inverser"}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer drawer (sticky bas) — V223.G : factorisé via <GuideButton>.
            Le composant gère les 3 états (erreur backend / actions manquantes
            / OK) avec le même pattern visuel qu'avant, mais réutilisable. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 16,
            position: "sticky",
            bottom: 0,
            paddingTop: 12,
            paddingBottom: 4,
            background:
              "linear-gradient(to top, #FAF6EE 70%, rgba(250,246,238,0))",
          }}
        >
          <GuideButton
            missingActions={missingActions}
            label={
              isEditing
                ? t("expense.saveChanges") || "Enregistrer les modifications"
                : t("expense.save") || "Enregistrer la dépense"
            }
            errorMessage={submitError}
            onErrorDismiss={() => setSubmitError(null)}
            onSubmit={handleSubmit}
            submitting={saving}
            secondaryLabel={t("common.cancel") || "Annuler"}
            onSecondary={onClose}
            compact
          />
        </div>
      </aside>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Helpers visuels locaux
// ───────────────────────────────────────────────────────────────────────

function FieldLabel({
  children,
  mt = 0,
}: {
  children: React.ReactNode;
  mt?: number;
}) {
  return (
    <label
      style={{
        fontSize: 10,
        color: "#8B6F47",
        textTransform: "lowercase",
        letterSpacing: "0.04em",
        display: "block",
        marginTop: mt,
      }}
    >
      {children}
    </label>
  );
}

function ModePill({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        fontSize: 9,
        padding: "3px 7px",
        background: active ? "#C58A2E" : "#FFFFFF",
        color: active ? "#FAF6EE" : "#8B6F47",
        border: active ? "none" : "0.5px solid #D9C8A6",
        borderRadius: 5,
        fontWeight: active ? 500 : 400,
      }}
    >
      {children}
    </span>
  );
}

const inputUnderlineStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderBottom: "0.5px solid #D9C8A6",
  padding: "6px 0",
  fontSize: 13,
  background: "transparent",
  color: "#2B1F15",
  fontFamily: "inherit",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 9px",
  background: "#FFFFFF",
  border: "0.5px solid #D9C8A6",
  borderRadius: 7,
  fontSize: 12,
  color: "#2B1F15",
  fontFamily: "inherit",
  marginTop: 2,
  cursor: "pointer",
};

const miniLinkStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "3px 8px",
  background: "transparent",
  color: "#8B6F47",
  border: "0.5px solid #D9C8A6",
  borderRadius: 5,
  cursor: "pointer",
  fontFamily: "inherit",
};
