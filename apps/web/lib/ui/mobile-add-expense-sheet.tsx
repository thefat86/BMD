"use client";

/**
 * <MobileAddExpenseSheet> · V39.1 — BottomSheet stepper avec parité fonctionnelle.
 *
 * Cette version restore les capacités complètes du panel desktop tout en
 * gardant l'UX simple stepper mobile :
 *  - Étape 1 : MONTANT + DESCRIPTION
 *  - Étape 2 : QUI A PAYÉ (1 personne par défaut, toggle "Plusieurs" → MultiPayersEditor)
 *  - Étape 3 : COMMENT SPLITTER (4 modes : EQUAL / UNEQUAL / PERCENTAGE / ITEMIZED)
 *
 * Pour le mode ITEMIZED on réutilise `ItemizedEditor` (lib/ui/itemized-expense.tsx)
 * pour ne pas dupliquer la logique métier (validation somme articles ≈ total, etc.).
 * Pour le mode multi-payeurs on réutilise `MultiPayersEditor`.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BottomSheet } from "./bottom-sheet";
import { api } from "../api-client";
import { useToast } from "./toast";
// V124 — Dialog de confirmation avant fermeture du sheet quand des
// champs ont été saisis (évite la perte de données par fermeture
// accidentelle : tap backdrop, swipe down, bouton X).
import { useDialog } from "./dialog-provider";
import { haptic } from "../platform";
import { useT } from "../i18n/app-strings";
import {
  MultiPayersEditor,
  type PayerInput,
} from "./multi-payers-editor";
import { ItemizedEditor, type DraftItem } from "./itemized-expense";
import type { ParsedReceipt } from "./scan-receipt-modal";
// V52.B3 — Icon registry V45 (remplace 📷 🎙 🍕 ✓ ⚠︎ par SVG outline).
import { Icon } from "./icons";
import { SegmentedControl } from "./segmented-control";
// V112 — Avatar plan-aware : remplace les initiales par photo membre
// pour les utilisateurs sur forfait payant.
import { AvatarColored } from "./avatar-colored";
// V52.B9 — Numpad custom V45 (remplace l'input décimal natif qui ouvrait
// le clavier OS et cassait l'écran mobile premium). Cf. AUDIT-V45-VS-PROD.md
// écran 5 « Add Expense Numpad » + audit Vague A V52.A4.
import { NumpadKeypad } from "./numpad-keypad";
// V52.F4 — SplitDonut visuel V45 pour le mode PERCENTAGE (visualisation
// proportionnelle live drag-friendly + tap-to-exclude). Cohabite avec
// la liste inputs % textuels en dessous (donut = visu, liste = clavier).
import { SplitDonut, type SplitDonutMember } from "./split-donut";
// V83 — Selector catégorie + normalisation source-unique shared-types.
import { CategoryGridSelector } from "./category-grid-selector";
import {
  normalizeExpenseCategory,
  type ExpenseCategoryValue,
} from "@bmd/shared-types";

// V41.6 — OCR scan via Mindee / OpenAI Vision. Lazy load (Tesseract ~120 KB).
const ScanReceiptModal = dynamic(
  () =>
    import("./scan-receipt-modal").then((m) => ({
      default: m.ScanReceiptModal,
    })),
  { ssr: false },
);
// V41.6 — PremiumVoiceCapture (Whisper officiel OpenAI + GPT-4o-mini).
// Remplace l'ancien VoiceInput (Web Speech) pour avoir la même qualité
// que le FAB game-changer dans TOUS les points de création de dépense.
const PremiumVoiceCapture = dynamic(
  () =>
    import("./premium-voice-capture").then((m) => ({
      default: m.PremiumVoiceCapture,
    })),
  { ssr: false },
);

interface Member {
  id: string;
  role: string;
  user: { id: string; displayName: string; avatar?: string | null };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * V130 — Optionnel : si null/undefined, le sheet affiche un Step 0
   * « Choisir le groupe » qui charge la liste des groupes de l'user et
   * remplace ce groupId dynamiquement avant de passer au step 1. Permet
   * d'avoir un SEUL wizard de création de dépense partout (depuis la page
   * du groupe ET depuis le FAB Quick Add). Si fourni, le step 0 est
   * sauté.
   */
  groupId?: string | null;
  /**
   * V130 — Optionnel : si non fourni et `groupId` est résolu via le picker
   * interne, le sheet appelle `api.getGroup(id)` pour récupérer la liste
   * des membres + la devise par défaut. Si fourni (cas page du groupe), on
   * les utilise tels quels.
   */
  members?: Member[];
  meId?: string;
  /** Devise utilisée pour le rendu. Optionnelle quand `groupId` est null
   *  (résolue dynamiquement à la sélection). Défaut : "EUR". */
  defaultCurrency?: string;
  onCreated: () => void;
  /**
   * V130 — Valeurs initiales pour pré-hydrater le wizard (cas Quick Add
   * FAB : montant + description + items + catégorie + splitMode reçus
   * d'un scan IA, voice transcript ou saisie manuelle). Le wizard
   * reprend le contrôle après pré-fill et l'utilisateur peut tout
   * éditer normalement.
   */
  initial?: {
    amount?: string;
    description?: string;
    category?: ExpenseCategoryValue | null;
    categoryFromAI?: boolean;
    splitMode?: SplitMode;
    /** Items pré-détectés (mode ITEMIZED) — la grille s'ouvre directement. */
    items?: DraftItem[];
    /** Fichier scanné à uploader comme RECEIPT après création. */
    scannedFile?: File | null;
    /** Hash anti-doublon transmis à createExpense. */
    scannedHash?: string | null;
  };
}

type Step = 0 | 1 | 2 | 3;
type SplitMode = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";

/**
 * V130 — Forme légère renvoyée par api.listGroups (pas de members). Suffit
 * pour le picker du Step 0.
 */
interface GroupLite {
  id: string;
  name: string;
  type?: string | null;
  defaultCurrency: string;
}

/**
 * V126 — Retourne la date du jour au format YYYY-MM-DD en timezone LOCALE
 * (et non UTC). `new Date().toISOString()` retournerait la date UTC ce qui
 * pose problème pour les fuseaux +01/+02 le soir (offset une nuit). On
 * formate manuellement depuis les getters locaux pour rester aligné avec
 * la perception utilisateur.
 */
function todayLocalISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function MobileAddExpenseSheet({
  open,
  onClose,
  groupId: groupIdProp,
  members: membersProp,
  meId,
  defaultCurrency: defaultCurrencyProp,
  onCreated,
  initial,
}: Props) {
  const t = useT();
  const toast = useToast();
  const dialog = useDialog();

  // V130 — Le groupId effectif peut être :
  //  - Fourni en prop (cas page du groupe) → step 0 sauté
  //  - Résolu dynamiquement via le picker du step 0 (cas FAB Quick Add)
  // Idem pour members + currency : injectés via prop OU chargés via
  // api.getGroup quand l'user choisit dans le picker.
  const [resolvedGroupId, setResolvedGroupId] = useState<string | null>(
    groupIdProp ?? null,
  );
  const [resolvedMembers, setResolvedMembers] = useState<Member[]>(
    membersProp ?? [],
  );
  const [resolvedCurrency, setResolvedCurrency] = useState<string>(
    defaultCurrencyProp ?? "EUR",
  );
  // Picker step 0 : liste des groupes (chargée à l'ouverture quand pas de
  // groupId initial).
  const [groupsList, setGroupsList] = useState<GroupLite[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);

  // Effective values used in the rest of the wizard. Ces aliases gardent
  // la logique downstream lisible (`groupId`, `members`, `defaultCurrency`)
  // exactement comme avant V130.
  const groupId = resolvedGroupId ?? "";
  const members = resolvedMembers;
  const defaultCurrency = resolvedCurrency;

  // V130 — Step 0 affiché tant qu'aucun groupId n'est résolu. La grille
  // de groupes apparaît seulement quand l'API a retourné la liste.
  const needsGroupPicker = !groupIdProp && !resolvedGroupId;

  const [step, setStep] = useState<Step>(needsGroupPicker ? 0 : 1);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  // V83 — Catégorie de la dépense (1 des 6 valeurs canoniques shared).
  // Pré-remplie par OCR scan et voice (parseExpenseSmart → ParsedExpense.category).
  // L'utilisateur peut surcharger ou retirer en cliquant la chip active.
  const [category, setCategory] = useState<ExpenseCategoryValue | null>(null);
  // Flag : la catégorie courante a été pré-remplie par l'IA ? Affiche le
  // tag "Auto" dans CategoryGridSelector. Reset quand l'user édite.
  const [categoryFromAI, setCategoryFromAI] = useState(false);

  // === Step 2 : payeurs ===
  // Un seul payeur par défaut ; activable en multi via MultiPayersEditor.
  const [paidByUserId, setPaidByUserId] = useState<string>("");
  const [multiPayers, setMultiPayers] = useState<PayerInput[]>([]);
  // V122 — Le seuil bascule à `>= 1` pour que le toggle "Une personne /
  // Plusieurs" reflète immédiatement l'intention de l'utilisateur dès
  // le premier clic. Avant : il fallait que l'éditeur multi-payers ait
  // ajouté 2 payers pour que le toggle bascule visuellement, ce qui
  // rendait le clic "Plusieurs" sans effet apparent (cf. V57 pour le
  // pattern toggle dashboard).
  //
  // Côté backend, `computePayers` (cf. expenses.service.ts) traite déjà
  // gracieusement `payers.length === 1` comme un fallback automatique
  // vers `paidByUserId` legacy, donc cette modification est 100 % safe.
  const useMultiPayers = multiPayers.length >= 1;

  // === Step 3 : split ===
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  const [participants, setParticipants] = useState<Record<string, boolean>>({});
  // Pour UNEQUAL : montants string ; pour PERCENTAGE : % string
  const [shares, setShares] = useState<Record<string, string>>({});
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

  const [submitting, setSubmitting] = useState(false);
  // V41.1 — OCR scan modal control
  const [scanOpen, setScanOpen] = useState(false);
  // V41.6 — PremiumVoiceCapture inline overlay (Whisper + OpenAI premium)
  const [voiceOpen, setVoiceOpen] = useState(false);
  // V41.8 — File scanné conservé pour upload comme attachment kind=RECEIPT
  // après création de la dépense (preuve attachée).
  const [scannedFile, setScannedFile] = useState<File | null>(null);
  // V42 — Hash SHA-256 du fichier scanné, transmis à createExpense pour
  // que la dépense stocke ce hash et qu'on puisse détecter les doublons
  // sur les futurs scans dans le même groupe.
  const [scannedHash, setScannedHash] = useState<string | null>(null);
  // V126 — Date d'occurrence de la dépense (YYYY-MM-DD pour <input type="date">).
  // Default = aujourd'hui (timezone locale). L'utilisateur peut antidater (ex:
  // saisir une dépense d'hier). Le backend accepte `occurredAt` ISO 8601 (cf.
  // expenses.routes.ts createSchema) et l'expose dans `serialize()`.
  const [occurredAt, setOccurredAt] = useState<string>(() => todayLocalISO());

  // Init à l'ouverture. V130 — Quand `initial` est fourni (cas FAB Quick
  // Add post-scan/voice), on hydrate les champs au lieu de tout reset à
  // vide. Le step de démarrage est 0 (picker groupe) si aucun groupId
  // n'a été fourni en prop, sinon 1 (montant).
  useEffect(() => {
    if (!open) return;
    setStep(needsGroupPicker ? 0 : 1);
    setAmount(initial?.amount ?? "");
    setDescription(initial?.description ?? "");
    setSplitMode(initial?.splitMode ?? "EQUAL");
    setPaidByUserId(meId ?? members[0]?.user.id ?? "");
    setMultiPayers([]);
    const allP: Record<string, boolean> = {};
    for (const m of members) allP[m.user.id] = true;
    setParticipants(allP);
    setShares({});
    setDraftItems(initial?.items ?? []);
    setScannedFile(initial?.scannedFile ?? null);
    setScannedHash(initial?.scannedHash ?? null);
    setCategory(initial?.category ?? null);
    setCategoryFromAI(initial?.categoryFromAI ?? false);
    // V126 — Reset date à aujourd'hui à chaque ouverture du sheet.
    setOccurredAt(todayLocalISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, members, meId, needsGroupPicker]);

  // V130 — Charge la liste des groupes au step 0 (picker). Loading async,
  // l'utilisateur voit un skeleton entre temps.
  useEffect(() => {
    if (!open || !needsGroupPicker || groupsList.length > 0) return;
    setGroupsLoading(true);
    api
      .listGroups()
      .then((g) => setGroupsList(g as GroupLite[]))
      .catch(() => setGroupsList([]))
      .finally(() => setGroupsLoading(false));
  }, [open, needsGroupPicker, groupsList.length]);

  // V130 — Quand l'user choisit un groupe dans le picker, on charge le
  // détail (members + currency) puis on bascule au step 1. Sécurité :
  // pendant le fetch, le step reste 0 avec un indicateur de chargement.
  async function selectGroup(g: GroupLite) {
    setGroupMembersLoading(true);
    try {
      const detail = await api.getGroup(g.id);
      const detailMembers = ((detail?.members ?? []) as Member[]).filter(
        (m) => m && m.user && m.user.id,
      );
      setResolvedMembers(detailMembers);
      setResolvedCurrency(detail?.defaultCurrency ?? g.defaultCurrency ?? "EUR");
      setResolvedGroupId(g.id);
      // Init payeur + participants pour les membres fraîchement chargés.
      setPaidByUserId(meId ?? detailMembers[0]?.user.id ?? "");
      const allP: Record<string, boolean> = {};
      for (const m of detailMembers) allP[m.user.id] = true;
      setParticipants(allP);
      haptic("tap");
      setStep(1);
    } catch (e) {
      toast.info((e as Error).message);
    } finally {
      setGroupMembersLoading(false);
    }
  }

  const selectedMembers = useMemo(
    () => members.filter((m) => participants[m.user.id]),
    [members, participants],
  );
  const amountNumber = parseFloat(amount.replace(",", ".")) || 0;

  const canGoNext = useMemo(() => {
    if (step === 1) return amountNumber > 0 && description.trim().length > 0;
    if (step === 2) {
      // Soit un payeur unique, soit multi-payers valide (somme ≈ total ou %=100)
      if (useMultiPayers) {
        const total = amountNumber;
        const sumAmount = multiPayers.reduce(
          (acc, p) =>
            acc + (parseFloat((p.amount ?? "").replace(",", ".")) || 0),
          0,
        );
        const sumPercent = multiPayers.reduce(
          (acc, p) => acc + (p.percent ?? 0),
          0,
        );
        const isAmountMode = multiPayers.some(
          (p) => p.amount !== undefined,
        );
        if (isAmountMode) return Math.abs(sumAmount - total) < 0.02;
        return Math.abs(sumPercent - 100) < 0.5;
      }
      return !!paidByUserId;
    }
    // Step 3
    if (selectedMembers.length === 0) return false;
    if (splitMode === "ITEMIZED") {
      const sumItems = draftItems.reduce(
        (acc, it) => acc + (parseFloat(it.totalPrice || "0") || 0),
        0,
      );
      return draftItems.length > 0 && Math.abs(sumItems - amountNumber) < 0.02;
    }
    if (splitMode === "UNEQUAL") {
      const sumShares = selectedMembers.reduce(
        (acc, m) =>
          acc + (parseFloat((shares[m.user.id] ?? "").replace(",", ".")) || 0),
        0,
      );
      return Math.abs(sumShares - amountNumber) < 0.02;
    }
    if (splitMode === "PERCENTAGE") {
      const sumPct = selectedMembers.reduce(
        (acc, m) =>
          acc + (parseFloat((shares[m.user.id] ?? "").replace(",", ".")) || 0),
        0,
      );
      return Math.abs(sumPct - 100) < 0.5;
    }
    return true;
  }, [
    step,
    amountNumber,
    description,
    useMultiPayers,
    multiPayers,
    paidByUserId,
    selectedMembers,
    splitMode,
    shares,
    draftItems,
  ]);

  function next() {
    if (!canGoNext) return;
    if (step === 0) {
      // V130 — Au step 0 (picker groupe) la navigation se fait via
      // selectGroup() qui set lui-même le step à 1. Pas d'auto-next.
      return;
    }
    if (step < 3) {
      setStep((s) => (s + 1) as Step);
      haptic("tap");
    } else {
      void submit();
    }
  }
  function prev() {
    // V130 — Au step 1, si on est arrivé via le picker (cas FAB sans groupId
    // prop), retour au step 0 pour permettre de changer de groupe. Sinon
    // (cas page du groupe avec groupId en prop), le step 1 reste l'étape
    // initiale et le bouton « Précédent » n'apparaît même pas.
    if (step === 1 && !groupIdProp) {
      setResolvedGroupId(null);
      setStep(0);
      haptic("tap");
      return;
    }
    if (step > 1) {
      setStep((s) => (s - 1) as Step);
      haptic("tap");
    }
  }

  /**
   * V41.1 — Quand l'OCR retourne un résultat, on pré-remplit le formulaire
   * et on bascule vers l'étape 1 si on était sur autre chose.
   *  - amount + description + currency
   *  - si items détectés, on passe en mode ITEMIZED et on pré-remplit
   *    `draftItems` (l'utilisateur révise à l'étape 3)
   *
   * V41.8 — On reçoit AUSSI le File scanné pour pouvoir l'uploader comme
   * ExpenseAttachment (kind=RECEIPT) après création de la dépense, afin
   * de conserver la facture comme preuve attachée.
   */
  function handleOcrConfirm(receipt: ParsedReceipt, file: File | null) {
    if (receipt.amount) setAmount(receipt.amount);
    if (receipt.merchant && !description.trim()) {
      setDescription(receipt.merchant);
    } else if (!description.trim() && receipt.rawText) {
      // fallback : 1ère ligne du texte brut comme description
      setDescription(receipt.rawText.split("\n")[0]?.slice(0, 60) ?? "");
    }
    if (receipt.items && receipt.items.length > 0) {
      setSplitMode("ITEMIZED");
      setDraftItems(
        receipt.items.map((it) => ({
          description: it.description,
          quantity: it.quantity || 1,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
        })),
      );
    }
    // V41.8 — On conserve le file scanné pour l'uploader plus tard
    setScannedFile(file);
    // V42 — On conserve aussi le hash pour le transmettre à createExpense
    if ((receipt as any).receiptHash) {
      setScannedHash((receipt as any).receiptHash);
    }
    // V83 — Pré-remplit la catégorie depuis l'OCR (parser renvoie déjà
    // une valeur canonique, mais on normalise pour défense en profondeur
    // au cas où un legacy "Restaurant" titre case remonte d'un cache).
    const inferred = normalizeExpenseCategory(receipt.category);
    if (inferred) {
      setCategory(inferred);
      setCategoryFromAI(true);
    }
    setScanOpen(false);
    haptic("success");
    toast.success(
      t("expense.scanSuccess") ||
        "Scan terminé — vérifie et complète si besoin",
    );
  }

  /**
   * V41.1 — VoiceInput retourne une transcription parsée :
   * { amount?, description?, category? }. On pré-remplit ce qu'il a trouvé.
   */
  function handleVoiceResult(parsed: {
    amount?: string;
    description?: string;
    category?: string;
  }) {
    if (parsed.amount) setAmount(parsed.amount);
    if (parsed.description) setDescription(parsed.description);
    // V83 — Pré-remplit la catégorie depuis le voice-to-expense (LLM).
    const inferred = normalizeExpenseCategory(parsed.category);
    if (inferred) {
      setCategory(inferred);
      setCategoryFromAI(true);
    }
    haptic("tap");
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      let partsInput: Array<{ userId: string; share?: number }> = [];

      if (splitMode === "ITEMIZED") {
        // Pour ITEMIZED : le backend calcule les shares depuis les items.
        // On envoie tous les membres "concernés" (ceux qui apparaissent dans
        // au moins un assignedUserIds, ou tous si aucun assignment).
        const allAssigned = new Set<string>();
        for (const it of draftItems) {
          for (const u of it.assignedUserIds ?? []) allAssigned.add(u);
        }
        const userIds =
          allAssigned.size > 0
            ? Array.from(allAssigned)
            : selectedMembers.map((m) => m.user.id);
        partsInput = userIds.map((userId) => ({ userId }));
      } else if (splitMode === "EQUAL") {
        partsInput = selectedMembers.map((m) => ({ userId: m.user.id }));
      } else {
        // UNEQUAL ou PERCENTAGE
        partsInput = selectedMembers.map((m) => {
          const raw = shares[m.user.id];
          const share = raw
            ? parseFloat(raw.replace(",", ".")) || 0
            : 0;
          return { userId: m.user.id, share };
        });
      }

      // Multi-payers : seulement si activé et la somme est cohérente
      const payersField = useMultiPayers ? multiPayers : undefined;

      const body: Parameters<typeof api.createExpense>[1] = {
        description: description.trim(),
        amount: amountNumber.toFixed(2),
        splitMode,
        participants: partsInput,
      };
      if (!useMultiPayers && paidByUserId) {
        body.paidByUserId = paidByUserId;
      }
      if (payersField) {
        body.payers = payersField;
      }
      // V42 — Hash de la facture scannée pour anti-doublon
      if (scannedHash) {
        body.receiptHash = scannedHash;
      }
      // V83 — Catégorie (saisie manuelle ou pré-remplie par OCR/voice).
      // Null = pas de bucket assigné (toléré par le schéma Prisma).
      if (category) {
        body.category = category;
      }
      // V126 — Date d'occurrence : on convertit YYYY-MM-DD → ISO 8601 en
      // gardant la timezone locale (midi local pour éviter les surprises
      // de bascule en UTC qui décalent d'un jour le soir). Si l'utilisateur
      // a laissé la date par défaut (= aujourd'hui) on l'envoie quand même
      // explicitement pour que le backend ne se base pas sur l'heure
      // serveur (qui peut être dans un autre fuseau).
      if (occurredAt) {
        // Ex : "2026-05-14" → Date locale midi → ISO
        const localNoon = new Date(`${occurredAt}T12:00:00`);
        if (!isNaN(localNoon.getTime())) {
          body.occurredAt = localNoon.toISOString();
        }
      }

      const expense = await api.createExpense(groupId, body);

      // V39.1 — Pour ITEMIZED, on persiste les items après la création.
      // L'API accepte les items via PUT /expenses/:id/items.
      if (splitMode === "ITEMIZED" && draftItems.length > 0 && expense?.id) {
        await api.setExpenseItems(expense.id, draftItems).catch(() => {
          // Best-effort : la dépense est créée, on ne re-throw pas
          toast.warning(
            t("group.itemsPersistFailed") ||
              "Dépense créée mais articles non sauvegardés.",
          );
        });
      }

      // V41.8 — Si l'utilisateur a SCANNÉ une facture, on l'upload comme
      // attachment kind=RECEIPT pour la conserver comme preuve. Best-effort :
      // si l'upload échoue, la dépense reste créée (toast info, pas erreur).
      if (scannedFile && expense?.id) {
        await api
          .uploadAttachment(expense.id, scannedFile, { kind: "RECEIPT" })
          .catch((e) => {
            console.warn("[add-expense] upload facture échoué", e);
            toast.info(
              t("quickAdd.receiptUploadFailed") ||
                "Dépense créée, mais la facture n'a pas pu être attachée.",
            );
          });
      }

      haptic("success");
      toast.info(t("group.expenseCreated") || "Dépense ajoutée");
      onCreated();
    } catch (e) {
      haptic("error");
      toast.info((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <BottomSheet
      open={open}
      onClose={() => {
        if (submitting) return;
        // V124 — Confirm-before-close : si le user a commencé à saisir
        // quelque chose (montant, description, payeur custom, items
        // ITEMIZED, shares custom…), on demande confirmation avant
        // de jeter le brouillon. Évite la perte par fermeture
        // accidentelle (tap backdrop, swipe down, bouton X, ESC).
        const isDirty =
          amount.trim().length > 0 ||
          description.trim().length > 0 ||
          category !== null ||
          multiPayers.length > 0 ||
          paidByUserId !== "" ||
          draftItems.length > 0 ||
          Object.keys(shares).length > 0 ||
          // V126 — Date personnalisée (différente de aujourd'hui) = dirty.
          occurredAt !== todayLocalISO();
        if (!isDirty) {
          onClose();
          return;
        }
        void (async () => {
          const ok = await dialog.confirm(
            t("expense.discardConfirmBody") ||
              "Tu vas perdre ce que tu as déjà saisi. Veux-tu vraiment fermer ?",
            {
              title: t("expense.discardConfirmTitle") || "Fermer sans enregistrer ?",
              confirmLabel: t("expense.discardYes") || "Oui, fermer",
              cancelLabel: t("common.cancel") || "Annuler",
              variant: "danger",
            },
          );
          if (ok) onClose();
        })();
      }}
      title={t("group.addExpense") || "Nouvelle dépense"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* V130 — Step 0 « Choisir le groupe » : affiché seulement quand
            le sheet a été ouvert sans groupId initial (FAB Quick Add).
            Permet la sélection du groupe destinataire avant toute saisie.
            La sélection charge les membres et bascule au step 1. */}
        {step === 0 && (
          <StepGroupPicker
            groups={groupsList}
            loading={groupsLoading || groupMembersLoading}
            onPick={(g) => void selectGroup(g)}
            t={t}
          />
        )}

        {/* V43 — Stepper avec labels en dessous des barres. Masqué au step 0
            qui n'a pas encore initié le wizard 1/2/3. */}
        {step > 0 && <Stepper step={step} t={t} />}

        {/* V43 — Hero pédagogique : auto-explique l'étape en cours.
            Contexte adaptatif : sur l'étape 2/3 on rappelle le montant
            saisi à l'étape 1 pour que l'utilisateur garde le fil. */}
        {step > 0 && <StepHero
          step={step}
          amount={amount}
          currency={defaultCurrency}
          membersCount={members.length}
          t={t}
        />}

        {step === 1 && !voiceOpen && (
          <StepAmount
            amount={amount}
            setAmount={setAmount}
            description={description}
            setDescription={setDescription}
            currency={defaultCurrency}
            onScanReceipt={() => setScanOpen(true)}
            onOpenVoice={() => setVoiceOpen(true)}
            // V83 — Catégorie (saisie manuelle ou IA scan/voice).
            category={category}
            onCategoryChange={(next) => {
              setCategory(next);
              // Si l'user a modifié, ce n'est plus "auto" — on retire le tag IA.
              setCategoryFromAI(false);
            }}
            categoryFromAI={categoryFromAI}
            // V126 — Date d'occurrence (saisie ou défaut = aujourd'hui).
            occurredAt={occurredAt}
            onOccurredAtChange={setOccurredAt}
            t={t}
          />
        )}

        {/* V41.6 — Overlay PremiumVoiceCapture (Whisper officiel + OpenAI)
            quand l'utilisateur tape le mini-bouton "🎙 Voix premium". */}
        {step === 1 && voiceOpen && (
          <PremiumVoiceCapture
            language="fr"
            groupId={groupId}
            onResult={(r) => {
              if (r.amount) setAmount(r.amount);
              if (r.description) setDescription(r.description);
              if (r.splitMode) setSplitMode(r.splitMode);
              // V83 — Catégorie auto via parseExpenseSmart (LLM) côté API.
              const inferred = normalizeExpenseCategory(
                (r as { category?: string | null }).category,
              );
              if (inferred) {
                setCategory(inferred);
                setCategoryFromAI(true);
              }
              haptic("success");
              toast.success(
                t("voice.captured") || "Voix capturée — vérifie et continue",
              );
              setVoiceOpen(false);
            }}
            onCancel={() => setVoiceOpen(false)}
          />
        )}

        {step === 2 && (
          <StepPayers
            members={members}
            paidByUserId={paidByUserId}
            setPaidByUserId={setPaidByUserId}
            multiPayers={multiPayers}
            setMultiPayers={setMultiPayers}
            amount={amount}
            currency={defaultCurrency}
            meId={meId ?? ""}
            t={t}
          />
        )}

        {step === 3 && (
          <StepSplit
            members={members}
            participants={participants}
            setParticipants={setParticipants}
            shares={shares}
            setShares={setShares}
            splitMode={splitMode}
            setSplitMode={setSplitMode}
            amount={amountNumber}
            currency={defaultCurrency}
            draftItems={draftItems}
            setDraftItems={setDraftItems}
            t={t}
          />
        )}

        {/* V123 — Hint progressif (1 message à la fois) qui guide
            l'utilisateur vers les conditions manquantes pour activer
            le bouton "Suivant". Au step 1 :
              - Si pas de montant → "Saisis le montant"
              - Sinon si pas de description → "Ajoute une description"
              - Sinon → null (bouton actif)
            Au step 2 et 3, le hint reste à null car canGoNext est
            piloté par d'autres conditions (cf. useMemo plus haut). */}
        {(() => {
          let hint: string | null = null;
          if (step === 1) {
            if (amountNumber <= 0) {
              hint =
                t("expense.hintAmount") ||
                "Commence par saisir le montant 👇";
            } else if (description.trim().length === 0) {
              hint =
                t("expense.hintDescription") ||
                "Ajoute une description (ex : Resto, Course)";
            }
          }
          if (!hint) return null;
          return (
            <div
              role="status"
              aria-live="polite"
              style={{
                fontSize: 12,
                color: "var(--cream-soft, var(--cocoa-soft))",
                textAlign: "center",
                padding: "4px 0 0",
                opacity: 0.85,
                animation: "bmd-hint-fade 240ms ease-out",
              }}
            >
              {hint}
            </div>
          );
        })()}

        {/* V130 — Au step 0 (picker groupe), pas de barre de navigation
            Précédent/Suivant : la sélection d'une card de groupe fait
            avancer toute seule. Cf. StepGroupPicker. */}
        {step > 0 && <div
          style={{
            display: "flex",
            gap: 8,
            paddingTop: 8,
            borderTop: "1px solid rgba(244,228,193,0.06)",
            marginTop: 4,
          }}
        >
          {/* V130 — Le bouton Retour apparaît dès le step 1 quand on est
              arrivé via le picker (FAB sans groupId initial), pour
              permettre de changer de groupe. Sinon (cas page du groupe),
              il n'apparaît qu'à partir du step 2 comme avant. */}
          {(step > 1 || (step === 1 && !groupIdProp)) && (
            <button
              type="button"
              onClick={prev}
              disabled={submitting}
              style={{
                flex: 1,
                padding: "14px 20px",
                background: "transparent",
                color: "var(--cream-soft)",
                border: "1px solid rgba(244,228,193,0.18)",
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                touchAction: "manipulation",
              }}
            >
              {t("common.back") || "Retour"}
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={!canGoNext || submitting}
            style={{
              flex: 2,
              padding: "14px 20px",
              background:
                canGoNext && !submitting
                  ? "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))"
                  : "rgba(244,228,193,0.10)",
              color: canGoNext && !submitting ? "#16111E" : "var(--muted)",
              border: "none",
              borderRadius: 14,
              fontSize: 14,
              fontWeight: 700,
              cursor: canGoNext && !submitting ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              touchAction: "manipulation",
              boxShadow:
                canGoNext && !submitting
                  ? "0 8px 22px rgba(232,163,61,0.30)"
                  : "none",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting
              ? t("common.sending") || "Envoi…"
              : step === 3
                ? t("group.validateExpense") || "Valider la dépense"
                : t("common.next") || "Suivant"}
          </button>
        </div>}
      </div>
    </BottomSheet>

    {/* V41.1 — OCR scan modal en dehors de la BottomSheet pour qu'il puisse
        passer en plein écran (caméra). Le scan reçoit le File, appelle
        api.scanReceipt qui retourne un ParsedReceipt qu'on pré-remplit. */}
    <ScanReceiptModal
      open={scanOpen}
      onClose={() => setScanOpen(false)}
      onConfirm={handleOcrConfirm}
      scanFn={async (file, hash) => {
        // V42 — On propage le hash SHA-256 (calculé côté client post-optim)
        // pour permettre au backend de détecter les doublons.
        const r = await api.scanReceipt(file, groupId, hash);
        return r as ParsedReceipt;
      }}
    />
    </>
  );
}

function shortcutBtnStyle(): React.CSSProperties {
  return {
    flex: 1,
    padding: "10px 12px",
    background:
      "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(91,108,255,0.05))",
    border: "1px solid rgba(232,163,61,0.25)",
    color: "var(--cream)",
    borderRadius: 12,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    minHeight: 44,
  };
}

// ============ STEPPER ============

function Stepper({
  step,
  t,
}: {
  step: Step;
  t: ReturnType<typeof useT>;
}) {
  // V43 — Labels courts visibles sous chaque barre. Met l'étape active en
  // évidence (couleur saffron + bold), les autres en gris.
  const labels = [
    t("expense.stepperMontant") || "Montant",
    t("expense.stepperPayeur") || "Payeur",
    t("expense.stepperPartage") || "Partage",
  ];
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={3}
      aria-valuenow={step}
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 999,
              background:
                s <= step
                  ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
                  : "rgba(244,228,193,0.10)",
              transition: "background 0.2s ease",
            }}
            aria-hidden
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {labels.map((label, i) => {
          const s = (i + 1) as Step;
          const active = s === step;
          const done = s < step;
          return (
            <span
              key={label}
              style={{
                flex: 1,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                textAlign: "center",
                color: active
                  ? "var(--saffron, #E8A33D)"
                  : done
                    ? "var(--cream-soft, #d4c4a8)"
                    : "var(--muted, #8A7B6B)",
                opacity: active ? 1 : 0.7,
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ============ STEP HERO (V43) ============

/**
 * V43 — Header pédagogique de chaque étape : explique en clair ce que
 * l'utilisateur est en train de faire. Affiche aussi un récap discret du
 * montant déjà saisi (étapes 2 et 3) pour qu'on garde le fil sans avoir
 * besoin de revenir en arrière.
 */
function StepHero({
  step,
  amount,
  currency,
  membersCount,
  t,
}: {
  step: Step;
  amount: string;
  currency: string;
  membersCount: number;
  t: ReturnType<typeof useT>;
}) {
  // V130 — Le step 0 (picker groupe) a son propre rendu (StepGroupPicker)
  // qui n'utilise pas StepHero ; on rajoute quand même une entrée 0 pour
  // que l'indexation `titles[step]` soit type-safe sans cast.
  const titles = {
    0: t("expense.heroPickGroupTitle") || "Pour quel groupe ?",
    1:
      t("expense.heroAmountTitle") ||
      "Combien tu as payé ?",
    2:
      t("expense.heroPayerTitle") ||
      "Qui a sorti l'argent ?",
    3:
      t("expense.heroSplitTitle") ||
      "Pour qui et comment on partage ?",
  } as const;
  const subtitles = {
    0:
      t("expense.heroPickGroupSub") ||
      "Choisis le groupe où ajouter cette dépense.",
    1:
      t("expense.heroAmountSub") ||
      "Le montant total de la facture. On partagera juste après.",
    2:
      t("expense.heroPayerSub") ||
      "Une seule personne, ou plusieurs qui se sont cotisées ?",
    3:
      t("expense.heroSplitSub") ||
      "Choisis qui participe et comment on coupe le gâteau.",
  } as const;

  const amountNum = parseFloat(amount.replace(",", ".")) || 0;
  const showRecap = step !== 1 && amountNum > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "2px 0",
      }}
    >
      <h3
        style={{
          fontFamily: "Cormorant Garamond, Georgia, serif",
          fontSize: 20,
          fontWeight: 700,
          color: "var(--cream)",
          margin: 0,
          lineHeight: 1.15,
        }}
      >
        {titles[step]}
      </h3>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--cream-soft, #d4c4a8)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {subtitles[step]}
      </p>
      {showRecap && (
        <div
          style={{
            marginTop: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            background:
              "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(91,108,255,0.05))",
            border: "1px solid rgba(232,163,61,0.20)",
            borderRadius: 10,
            fontSize: 11,
            color: "var(--cream-soft, #d4c4a8)",
            alignSelf: "flex-start",
          }}
        >
          <span
            style={{
              fontWeight: 700,
              color: "var(--saffron, #E8A33D)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {amountNum.toFixed(2)} {currency}
          </span>
          <span aria-hidden style={{ opacity: 0.5 }}>·</span>
          <span>
            {membersCount}{" "}
            {membersCount > 1
              ? t("expense.heroMembers") || "personnes au total"
              : t("expense.heroMember") || "personne au total"}
          </span>
        </div>
      )}
    </div>
  );
}

// ============ STEP 1 : MONTANT + DESCRIPTION ============

/**
 * V130 — Step 0 « Choisir le groupe ». Affiché uniquement quand le sheet a
 * été ouvert sans `groupId` initial (cas FAB Quick Add). Liste les groupes
 * de l'utilisateur sous forme de cards cliquables. Le tap sur une card
 * charge les membres + devise et bascule au step 1.
 */
function StepGroupPicker({
  groups,
  loading,
  onPick,
  t,
}: {
  groups: GroupLite[];
  loading: boolean;
  onPick: (g: GroupLite) => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          textAlign: "center",
          padding: "8px 4px 4px",
        }}
      >
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--cream, var(--cocoa))",
            lineHeight: 1.2,
          }}
        >
          {t("expense.pickGroupTitle") || "Pour quel groupe ?"}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--cream-soft, var(--cocoa-soft))",
            marginTop: 4,
          }}
        >
          {t("expense.pickGroupSubtitle") ||
            "Choisis le groupe où ajouter cette dépense."}
        </div>
      </div>
      {loading && groups.length === 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: "20px 14px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--cream-soft, var(--cocoa-soft))",
            fontStyle: "italic",
          }}
        >
          {t("common.loading") || "Chargement…"}
        </div>
      )}
      {!loading && groups.length === 0 && (
        <div
          style={{
            padding: "20px 14px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--cream-soft, var(--cocoa-soft))",
            background: "var(--paper, rgba(244,228,193,0.04))",
            border: "1px dashed var(--v45-line, rgba(43,31,21,0.12))",
            borderRadius: 12,
          }}
        >
          {t("expense.noGroupYet") ||
            "Tu n'as encore aucun groupe. Crée-en un depuis l'onglet Groupes pour pouvoir y ajouter une dépense."}
        </div>
      )}
      {groups.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onPick(g)}
                disabled={loading}
                className="bmd-tap"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "var(--paper, #FFFFFF)",
                  border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
                  borderRadius: 14,
                  cursor: loading ? "not-allowed" : "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  color: "var(--cocoa, var(--cream))",
                  opacity: loading ? 0.6 : 1,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: "var(--v45-saffron-pale, #F6E8C5)",
                    color: "var(--v45-saffron, #C58A2E)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name="users" size={18} strokeWidth={1.7} />
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--cocoa, var(--cream))",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {g.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--cocoa-soft, var(--cream-soft))",
                    }}
                  >
                    {g.defaultCurrency}
                  </span>
                </span>
                <Icon
                  name="chevron-right"
                  size={16}
                  color="var(--cocoa-mute, #A99580)"
                  strokeWidth={1.8}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepAmount({
  amount,
  setAmount,
  description,
  setDescription,
  currency,
  onScanReceipt,
  onOpenVoice,
  category,
  onCategoryChange,
  categoryFromAI,
  occurredAt,
  onOccurredAtChange,
  t,
}: {
  amount: string;
  setAmount: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  currency: string;
  onScanReceipt: () => void;
  onOpenVoice: () => void;
  // V83 — Catégorie de la dépense
  category: ExpenseCategoryValue | null;
  onCategoryChange: (next: ExpenseCategoryValue | null) => void;
  categoryFromAI: boolean;
  // V126 — Date d'occurrence (YYYY-MM-DD).
  occurredAt: string;
  onOccurredAtChange: (next: string) => void;
  t: ReturnType<typeof useT>;
}) {
  // V123 — Layout compact : tout tient sur 1 viewport mobile (~700-820 px).
  // gap général 18 → 10, display montant 44 → 34 px, numpad `compact`,
  // shortcuts plus discrets. La catégorie reste accessible mais sans
  // grille déployée par défaut — l'auto-fill OCR/voice continue de
  // marcher (categoryFromAI), et le user peut toujours la changer si
  // affichée.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* V123 — Shortcuts IA en haut, format compact (padding réduit). */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={onScanReceipt}
          style={shortcutBtnStyle()}
          aria-label={t("expense.scanReceiptAria") || "Scanner un reçu"}
        >
          <Icon
            name="camera"
            size={16}
            color="var(--saffron, #e8a33d)"
            strokeWidth={1.6}
          />
          <span>{t("expense.scanReceipt") || "Scanner un reçu"}</span>
        </button>
        <button
          type="button"
          onClick={onOpenVoice}
          style={shortcutBtnStyle()}
          aria-label={t("expense.voicePremium") || "Saisie vocale IA"}
        >
          <Icon
            name="mic"
            size={16}
            color="var(--saffron, #e8a33d)"
            strokeWidth={1.6}
          />
          <span>{t("expense.voicePremium") || "Voix premium"}</span>
        </button>
      </div>

      {/* V123 — Display montant compact (sans label séparé, devise inline). */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 8,
          padding: "10px 12px",
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(232,163,61,0.25)",
          borderRadius: 14,
        }}
      >
        <span
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 34,
            fontWeight: 700,
            color: "var(--cream)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            minWidth: 0,
          }}
          aria-live="polite"
          aria-label={`${t("group.amount") || "Montant"}: ${amount || "0"}`}
        >
          {amount || "0"}
        </span>
        <span
          style={{
            fontSize: 14,
            color: "var(--saffron)",
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {currency}
        </span>
      </div>

      {/* V123.B — NumpadKeypad mode "ultra" : padding 6, fontSize 20,
          gap 5 → ~150 px (au lieu de ~265 px par défaut). Gagne 115 px
          de vertical screen, ce qui libère exactement la place du
          CategoryGridSelector (sélection du type de dépense) qui doit
          rester visible permanente — c'est un signal utile pour
          comprendre la dépense, pas un meta facultatif. */}
      <NumpadKeypad
        value={(amount ?? "").replace(".", ",")}
        onChange={setAmount}
        decimalSeparator=","
        maxDecimals={2}
        maxIntegerDigits={10}
        compact="ultra"
      />

      {/* V123 — Champ description compact (padding 12 au lieu de 14).
          Pas de label dédié — le placeholder fait le travail. */}
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={
          t("group.descriptionPlaceholder") || "Description (ex: Courses, taxi)"
        }
        aria-label={t("group.description") || "Description"}
        style={{
          width: "100%",
          padding: "12px 14px",
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
          borderRadius: 12,
          color: "var(--cream)",
          fontSize: 14,
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {/* V126 — Date d'occurrence : permet d'antidater une dépense passée.
          Layout en ligne compacte (label inline + input à droite) pour
          ne pas augmenter la hauteur du wizard. <input type="date">
          ouvre le datepicker natif iOS/Android (UX premium). */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 14px",
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
          borderRadius: 12,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--cream-soft, var(--cocoa-soft))",
            fontWeight: 600,
          }}
        >
          <Icon
            name="calendar"
            size={16}
            color="var(--saffron, #e8a33d)"
            strokeWidth={1.6}
          />
          {t("expense.date") || "Date"}
        </span>
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => onOccurredAtChange(e.target.value)}
          max={todayLocalISO()}
          aria-label={t("expense.date") || "Date de la dépense"}
          className="bmd-num"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--cream)",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            minWidth: 130,
            padding: 0,
          }}
        />
      </label>

      {/* V123.B — CategoryGridSelector toujours visible : la sélection
          du type de dépense fait partie intégrante du step 1, c'est
          un metadata utile à la lecture rapide depuis la timeline.
          La place est récupérée en compactant le numpad en mode
          "ultra" (cf. ci-dessus). */}
      <CategoryGridSelector
        value={category}
        onChange={onCategoryChange}
        fromAI={categoryFromAI}
      />
    </div>
  );
}

// ============ STEP 2 : QUI A PAYÉ (single ou multi) ============

function StepPayers({
  members,
  paidByUserId,
  setPaidByUserId,
  multiPayers,
  setMultiPayers,
  amount,
  currency,
  meId,
  t,
}: {
  members: Member[];
  paidByUserId: string;
  setPaidByUserId: (id: string) => void;
  multiPayers: PayerInput[];
  setMultiPayers: (next: PayerInput[]) => void;
  amount: string;
  currency: string;
  meId: string;
  t: ReturnType<typeof useT>;
}) {
  // V122 — Seuil aligné sur le parent (`useMultiPayers`). Avant : `>= 2`
  // ce qui empêchait le toggle de basculer visuellement après le clic
  // "Plusieurs" — l'utilisateur ne voyait rien se passer car le 1er
  // payer initialisé ligne 1046 ne dépassait pas le seuil.
  const isMulti = multiPayers.length >= 1;
  // Liste membres formattée pour MultiPayersEditor
  // V112 — Inclure l'avatar pour permettre l'affichage photo (plans payants)
  // dans les sous-composants (ItemizedEditor, MultiPayersEditor, etc.).
  const flatMembers = useMemo(
    () =>
      members.map((m) => ({
        id: m.user.id,
        displayName: m.user.displayName,
        avatar: m.user.avatar ?? null,
      })),
    [members],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* V61 — SegmentedControl V45 (pill saffron solide, invariant XOR :
          impossible d'avoir les 2 désélectionnés). */}
      <SegmentedControl<"single" | "multi">
        value={isMulti ? "multi" : "single"}
        onChange={(v) => {
          // V122 — Pattern toggle identique au dashboard byGroup/byPerson
          // (V57) : XOR strict, jamais désélectionné, init du contenu au
          // basculement. Le seuil aligné `>= 1` (cf. `isMulti`) garantit
          // que `multi` reflète l'intention dès le 1er clic.
          if (v === "single") {
            setMultiPayers([]);
          } else if (multiPayers.length < 1) {
            setMultiPayers([
              { userId: meId || flatMembers[0]?.id || "", amount: amount },
            ]);
          }
        }}
        ariaLabel="Type de payeur"
        segments={[
          { value: "single", label: t("group.payerSingle") || "Une personne" },
          { value: "multi", label: t("group.payerMulti") || "Plusieurs" },
        ]}
      />

      {!isMulti ? (
        <SinglePayerList
          members={members}
          paidByUserId={paidByUserId}
          setPaidByUserId={setPaidByUserId}
          meId={meId}
          t={t}
        />
      ) : (
        <MultiPayersEditor
          members={flatMembers}
          meId={meId}
          totalAmount={amount}
          currency={currency}
          value={multiPayers}
          onChange={setMultiPayers}
          compact
        />
      )}
    </div>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "9px 10px",
    background: active
      ? "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))"
      : "transparent",
    color: active ? "var(--night-2, #16111E)" : "var(--cream-soft)",
    fontSize: 12.5,
    fontWeight: 700,
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "inherit",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  };
}

function SinglePayerList({
  members,
  paidByUserId,
  setPaidByUserId,
  meId,
  t,
}: {
  members: Member[];
  paidByUserId: string;
  setPaidByUserId: (id: string) => void;
  meId: string;
  t: ReturnType<typeof useT>;
}) {
  // V43 — Search activée automatiquement dès 8 membres (groupes tontines
  // ou colocations à 10+ personnes). Filtre case-insensitive sur le
  // displayName.
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      m.user.displayName.toLowerCase().includes(q),
    );
  }, [members, filter]);
  const showSearch = members.length >= 8;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {showSearch && (
        <input
          type="search"
          placeholder={
            t("expense.searchMembers") || "Chercher une personne…"
          }
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(232,163,61,0.20)",
            borderRadius: 10,
            color: "var(--cream)",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      )}
      {filtered.length === 0 && (
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            textAlign: "center",
            padding: "12px 0",
          }}
        >
          {t("expense.noMembersMatch") || "Aucun membre trouvé."}
        </p>
      )}
      {/* V52.D6 — Grille 4-col d'avatars V45 (aspect-ratio 1/1.25).
          Card sélectionnée = gradient saffron-pale + shadow saffron.
          Tag "TOI" absolute top-right. Scalable jusqu'à 100+ membres. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
      >
        {filtered.map((m) => {
          const isSelected = m.user.id === paidByUserId;
          const isMe = m.user.id === meId;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setPaidByUserId(m.user.id)}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                aspectRatio: "1 / 1.25",
                padding: "8px 4px",
                background: isSelected
                  ? "linear-gradient(135deg, var(--v45-saffron-pale, rgba(232,163,61,0.18)), rgba(232,163,61,0.06))"
                  : "rgba(244,228,193,0.04)",
                border: isSelected
                  ? "1.5px solid var(--v45-saffron, #C58A2E)"
                  : "1px solid rgba(244,228,193,0.08)",
                borderRadius: 12,
                color: "var(--cream)",
                fontFamily: "inherit",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                boxShadow: isSelected
                  ? "0 4px 14px rgba(197,138,46,0.20)"
                  : "none",
                transition:
                  "transform 0.08s ease, background 0.15s ease, border 0.15s ease",
              }}
            >
              {/* V112 — Photo membre si forfait payant ; sinon initiales colorées.
                  AvatarColored gère le fallback automatiquement (photoUrl null → initiales). */}
              <div
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  boxShadow: isSelected
                    ? "0 0 0 2px var(--v45-saffron, #C58A2E)"
                    : "none",
                  flexShrink: 0,
                }}
              >
                <AvatarColored
                  userId={m.user.id}
                  initials={m.user.displayName}
                  photoUrl={m.user.avatar ?? null}
                  size={38}
                  paletteOverride={isMe ? "emerald" : undefined}
                />
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isSelected ? 700 : 500,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textAlign: "center",
                  padding: "0 2px",
                }}
              >
                {m.user.displayName.split(" ")[0]}
              </span>
              {isMe && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    fontSize: 8,
                    color: "var(--v45-saffron, #C58A2E)",
                    background: "var(--paper, rgba(255,255,255,0.95))",
                    border: "1px solid var(--v45-saffron-soft, rgba(232,200,136,0.6))",
                    borderRadius: 999,
                    padding: "2px 5px",
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  {t("common.you") || "Toi"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============ STEP 3 : SPLIT (4 modes) ============

function StepSplit({
  members,
  participants,
  setParticipants,
  shares,
  setShares,
  splitMode,
  setSplitMode,
  amount,
  currency,
  draftItems,
  setDraftItems,
  t,
}: {
  members: Member[];
  participants: Record<string, boolean>;
  setParticipants: (p: Record<string, boolean>) => void;
  shares: Record<string, string>;
  setShares: (s: Record<string, string>) => void;
  splitMode: SplitMode;
  setSplitMode: (m: SplitMode) => void;
  amount: number;
  currency: string;
  draftItems: DraftItem[];
  setDraftItems: (items: DraftItem[]) => void;
  t: ReturnType<typeof useT>;
}) {
  const selectedCount = Object.values(participants).filter(Boolean).length;
  const equalShare = selectedCount > 0 ? amount / selectedCount : 0;

  const totalUnequal = useMemo(() => {
    return members
      .filter((m) => participants[m.user.id])
      .reduce(
        (acc, m) =>
          acc +
          (parseFloat((shares[m.user.id] ?? "").replace(",", ".")) || 0),
        0,
      );
  }, [members, participants, shares]);

  const totalPercent = useMemo(() => {
    return members
      .filter((m) => participants[m.user.id])
      .reduce(
        (acc, m) =>
          acc +
          (parseFloat((shares[m.user.id] ?? "").replace(",", ".")) || 0),
        0,
      );
  }, [members, participants, shares]);

  // V112 — Avatar passé pour affichage photo plan-aware.
  const flatMembers = useMemo(
    () =>
      members.map((m) => ({
        id: m.user.id,
        displayName: m.user.displayName,
        avatar: m.user.avatar ?? null,
      })),
    [members],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* V61 — SegmentedControl V45 4 modes (pill saffron solide qui
          glisse entre les 4 segments, invariant XOR garanti).
          Les icônes sont préservées dans le label pour la cohérence visuelle. */}
      <SegmentedControl<"EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED">
        value={splitMode}
        onChange={setSplitMode}
        ariaLabel="Mode de répartition"
        size="sm"
        segments={[
          {
            value: "EQUAL",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, opacity: 0.85 }}>=</span>
                <span>{t("group.splitEqual") || "Égal"}</span>
              </span>
            ),
          },
          {
            value: "UNEQUAL",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, opacity: 0.85 }}>€</span>
                <span>{t("group.splitMoney") || "Montant"}</span>
              </span>
            ),
          },
          {
            value: "PERCENTAGE",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, opacity: 0.85 }}>%</span>
                <span>{t("group.splitPercent") || "%"}</span>
              </span>
            ),
          },
          {
            value: "ITEMIZED",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, opacity: 0.85 }}>▦</span>
                <span>{t("group.splitItemized") || "Articles"}</span>
              </span>
            ),
          },
        ]}
      />

      {splitMode === "ITEMIZED" ? (
        <div>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--cream-soft)",
              margin: "0 0 10px",
              lineHeight: 1.5,
            }}
          >
            {t("group.itemizedHint") ||
              "Liste les articles. Tu peux assigner chacun à un ou plusieurs membres — chacun ne paiera que ce qu'il a consommé."}
          </p>
          <ItemizedEditor
            items={draftItems}
            onChange={setDraftItems}
            totalAmount={amount.toString()}
            currency={currency}
            members={flatMembers}
          />
        </div>
      ) : (
        <>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--cream-soft)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {splitMode === "EQUAL"
              ? t("group.splitEqualHint") ||
                "Choisis qui partage la note. Le montant sera réparti à parts égales."
              : splitMode === "UNEQUAL"
                ? t("group.splitUnequalHint") ||
                  "Renseigne le montant que chaque personne doit assumer."
                : t("group.splitPercentageHint") ||
                  "Renseigne le pourcentage que chaque personne doit assumer (somme = 100 %)."}
          </p>

          {/* V52.F4 — SplitDonut V45 : visualisation pourcentage interactive
              affichée UNIQUEMENT en mode PERCENTAGE quand au moins 2 personnes
              sont participantes et un montant > 0 est saisi. Le user peut :
                - drag les poignées entre arcs pour redistribuer
                - tap un nom dans la légende pour exclure/réintégrer
              La liste % textuelle en dessous reste éditable au clavier
              (les 2 UI sont synchronisées via shares + participants). */}
          {splitMode === "PERCENTAGE" &&
            amount > 0 &&
            Object.values(participants).filter(Boolean).length >= 2 && (
              <SplitDonut
                members={members.map<SplitDonutMember>((m) => ({
                  id: m.user.id,
                  name: m.user.displayName,
                  isActive: !!participants[m.user.id],
                }))}
                total={amount}
                shares={Object.fromEntries(
                  members.map((m) => [
                    m.user.id,
                    parseFloat((shares[m.user.id] ?? "0").replace(",", ".")) ||
                      0,
                  ]),
                )}
                onChange={(next) => {
                  // Conversion number → string format ",": cohérent avec le
                  // reste du flow (l'input texte attend "," comme décimal).
                  const nextStr: Record<string, string> = {};
                  for (const [id, val] of Object.entries(next)) {
                    nextStr[id] = val.toFixed(1).replace(".", ",");
                  }
                  setShares(nextStr);
                }}
                onToggleExclude={(id) => {
                  setParticipants({
                    ...participants,
                    [id]: !participants[id],
                  });
                }}
              />
            )}

          {/* V43 — Toolbar : tout / aucun + search dès 8 membres.
              Critique pour groupes 10-20+ où scroller chaque case est pénible. */}
          <SplitToolbar
            members={members}
            participants={participants}
            setParticipants={setParticipants}
            t={t}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {members.map((m) => {
              const userId = m.user.id;
              const isChecked = !!participants[userId];
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: isChecked
                      ? "rgba(232,163,61,0.06)"
                      : "rgba(244,228,193,0.03)",
                    border: isChecked
                      ? "1px solid rgba(232,163,61,0.25)"
                      : "1px solid rgba(244,228,193,0.08)",
                    borderRadius: 11,
                    opacity: isChecked ? 1 : 0.55,
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) =>
                      setParticipants({
                        ...participants,
                        [userId]: e.target.checked,
                      })
                    }
                    aria-label={m.user.displayName}
                    style={{
                      width: 18,
                      height: 18,
                      accentColor: "var(--saffron, #e8a33d)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13.5,
                      fontWeight: isChecked ? 600 : 500,
                      color: "var(--cream)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.user.displayName}
                  </span>
                  {isChecked && splitMode === "EQUAL" && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--cream-soft)",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 700,
                      }}
                    >
                      {equalShare.toLocaleString("fr-FR", {
                        minimumFractionDigits: ["XAF", "XOF"].includes(currency)
                          ? 0
                          : 2,
                        maximumFractionDigits: ["XAF", "XOF"].includes(currency)
                          ? 0
                          : 2,
                      })}{" "}
                      {currency}
                    </span>
                  )}
                  {isChecked &&
                    (splitMode === "UNEQUAL" || splitMode === "PERCENTAGE") && (
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          value={shares[userId] ?? ""}
                          onChange={(e) =>
                            setShares({
                              ...shares,
                              [userId]: e.target.value.replace(/[^\d.,]/g, ""),
                            })
                          }
                          placeholder="0"
                          style={{
                            width: 78,
                            padding: "6px 10px",
                            fontSize: 13,
                            background: "rgba(22,17,30,0.4)",
                            border: "1px solid rgba(232,163,61,0.30)",
                            borderRadius: 8,
                            color: "var(--cream)",
                            fontFamily: "inherit",
                            fontVariantNumeric: "tabular-nums",
                            outline: "none",
                            textAlign: "right",
                            boxSizing: "border-box",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            minWidth: 18,
                          }}
                        >
                          {splitMode === "UNEQUAL" ? currency : "%"}
                        </span>
                      </div>
                    )}
                </div>
              );
            })}
          </div>

          {/* Validation footer */}
          {splitMode === "UNEQUAL" && amount > 0 && (
            <Hint
              ok={Math.abs(amount - totalUnequal) < 0.01}
              labelOk={t("group.amountMatches") || "Réparti à 100 %"}
              labelKo={
                (t("group.remainder") || "Reste") +
                " : " +
                (amount - totalUnequal).toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) +
                " " +
                currency
              }
            />
          )}
          {splitMode === "PERCENTAGE" && (
            <Hint
              ok={Math.abs(totalPercent - 100) < 0.5}
              labelOk={t("group.percentOk") || "Somme = 100 %"}
              labelKo={
                (t("group.percentRemainder") || "Manque") +
                " : " +
                (100 - totalPercent).toFixed(1) +
                " %"
              }
            />
          )}
        </>
      )}
    </div>
  );
}

// ============ V43 · SplitToolbar — actions rapides + count ============

/**
 * V43 — Toolbar au-dessus de la liste de participants à l'étape 3 :
 *   - Compteur "N / M sélectionnés"
 *   - Bouton "Tout sélectionner" (tap massif pour groupes 10-20+)
 *   - Bouton "Aucun"
 *   - Bouton "Inverser" pour gain de temps quand on veut exclure 1-2 personnes
 *
 * Sans cette toolbar, sélectionner 20 personnes case par case est pénible
 * et casse l'UX mobile sur les grands groupes.
 */
function SplitToolbar({
  members,
  participants,
  setParticipants,
  t,
}: {
  members: Member[];
  participants: Record<string, boolean>;
  setParticipants: (p: Record<string, boolean>) => void;
  t: ReturnType<typeof useT>;
}) {
  const total = members.length;
  const selectedCount = useMemo(
    () => members.filter((m) => participants[m.user.id]).length,
    [members, participants],
  );
  function selectAll() {
    const next: Record<string, boolean> = {};
    for (const m of members) next[m.user.id] = true;
    setParticipants(next);
  }
  function selectNone() {
    const next: Record<string, boolean> = {};
    for (const m of members) next[m.user.id] = false;
    setParticipants(next);
  }
  function invert() {
    const next: Record<string, boolean> = {};
    for (const m of members) next[m.user.id] = !participants[m.user.id];
    setParticipants(next);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 12px",
        background: "rgba(43,31,21,0.04)",
        border: "1px solid rgba(43,31,21,0.08)",
        borderRadius: 12,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          color: "var(--cocoa-soft, #6B5A47)",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          marginRight: "auto",
        }}
      >
        <strong
          style={{
            color: "#C58A2E",
            fontSize: 13.5,
            fontWeight: 800,
          }}
        >
          {selectedCount}
        </strong>{" "}
        / {total}
      </span>
      <ToolbarBtn
        label={t("expense.selectAll") || "Tous"}
        onClick={selectAll}
        active={selectedCount === total}
      />
      <ToolbarBtn
        label={t("expense.selectNone") || "Aucun"}
        onClick={selectNone}
        active={selectedCount === 0}
      />
      <ToolbarBtn
        label={t("expense.invertSelection") || "Inverser"}
        onClick={invert}
      />
    </div>
  );
}

function ToolbarBtn({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  // V125 — Flash visuel court pour confirmer l'action, même sur le bouton
  // "Inverser" qui n'a pas d'état `active` persistant. Sans ce flash, le
  // tap se fait dans le vide (pas de feedback) et l'utilisateur a
  // l'impression que rien ne s'est passé.
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        haptic("tap");
        setPressed(true);
        // Reset du flash après 220 ms (assez pour être perçu, assez bref
        // pour ne pas freezer le tap-tap rapide).
        setTimeout(() => setPressed(false), 220);
        onClick();
      }}
      // V125 — Retire `bmd-no-scale` : on VEUT le feedback iOS authentique
      // (scale 0.96 + brightness 0.95) au press. C'était la cause perçue
      // du « bouton qui ne marche pas » — le state changeait mais aucun
      // signal visuel ne le confirmait à l'utilisateur.
      className="bmd-tap"
      style={{
        padding: "8px 12px",
        fontSize: 11.5,
        fontWeight: active ? 800 : 600,
        // V63 — Style cohérent V45 pill saffron solide quand actif
        // (même langage visuel que les SegmentedControl).
        // V125 — Flash saffron pâle 220 ms après tap (cf. `pressed`)
        // pour confirmer visuellement l'action sur tous les boutons.
        background: active
          ? "linear-gradient(135deg, #E8A33D 0%, #C58A2E 100%)"
          : pressed
            ? "rgba(232,163,61,0.22)"
            : "rgba(43,31,21,0.06)",
        color: active ? "#2B1F15" : "#6B5A47",
        border: active
          ? "1px solid rgba(197,138,46,0.55)"
          : pressed
            ? "1px solid rgba(197,138,46,0.40)"
            : "1px solid rgba(43,31,21,0.10)",
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: "inherit",
        minHeight: 36,
        letterSpacing: 0.2,
        boxShadow: active
          ? "0 2px 8px rgba(197,138,46,0.30), inset 0 1px 0 rgba(255,255,255,0.20)"
          : "none",
        textShadow: active ? "0 1px 0 rgba(255,255,255,0.18)" : "none",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function SplitModePill({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: "8px 4px",
        background: active
          ? "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))"
          : "transparent",
        color: active ? "var(--night-2, #16111E)" : "var(--cream-soft)",
        fontSize: 11,
        fontWeight: 700,
        border: "none",
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 800 }}>{icon}</span>
      <span style={{ letterSpacing: 0.2 }}>{label}</span>
    </button>
  );
}

function Hint({
  ok,
  labelOk,
  labelKo,
}: {
  ok: boolean;
  labelOk: string;
  labelKo: string;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: ok
          ? "rgba(125,197,158,0.08)"
          : "rgba(217,113,74,0.08)",
        border: ok
          ? "1px solid rgba(125,197,158,0.30)"
          : "1px solid rgba(217,113,74,0.30)",
        borderRadius: 10,
        fontSize: 12,
        color: "var(--cream)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span style={{ fontWeight: 600 }}>{ok ? labelOk : labelKo}</span>
      {/* V52.B3 — SVG check / alert-triangle remplacent ✓ / ⚠︎ unicode */}
      <Icon
        name={ok ? "check" : "alert-triangle"}
        size={16}
        color={ok ? "#7DC59E" : "#FFB89A"}
        strokeWidth={2}
      />
    </div>
  );
}
