"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../../../lib/api-client";
import { useToast } from "../../../../lib/ui/toast";
import { NotificationBell } from "../../../../lib/ui/notification-bell";
// Lazy load : ExpenseAttachments (UI uploads) — chargé uniquement quand
// l'utilisateur ouvre les pièces jointes d'une dépense. Économise ~15 KB.
const ExpenseAttachments = dynamic(
  () =>
    import("../../../../lib/ui/expense-attachments").then((m) => ({
      default: m.ExpenseAttachments,
    })),
  { ssr: false },
);
// Lazy load : DebtTransferPanel (500 lignes) — visible seulement quand on
// a une dette éligible au transfert. Économise ~30 KB sur first paint.
const DebtTransferPanel = dynamic(
  () =>
    import("../../../../lib/ui/debt-transfer-panel").then((m) => ({
      default: m.DebtTransferPanel,
    })),
  { ssr: false },
);
import {
  ItemizedClaimsView,
  ItemizedEditor,
} from "../../../../lib/ui/itemized-expense";
import { OcrCounter } from "../../../../lib/ui/ocr-counter";
import { BottomNav } from "../../../../lib/ui/bottom-nav";
// Lazy load : modal lourd (camera + Tesseract OCR), chargé seulement
// quand l'utilisateur clique sur "Scanner". Économise ~120 KB sur le
// bundle initial du group detail.
const ScanReceiptModal = dynamic(
  () =>
    import("../../../../lib/ui/scan-receipt-modal").then((m) => ({
      default: m.ScanReceiptModal,
    })),
  { ssr: false },
);
// Lazy load : VoiceInput (Web Speech API + parser) — chargé seulement quand
// l'utilisateur ouvre le panel "+ Dépense". Économise ~15 KB initial.
const VoiceInput = dynamic(
  () =>
    import("../../../../lib/ui/voice-input").then((m) => ({
      default: m.VoiceInput,
    })),
  { ssr: false },
);
import { SplitSuggestionBanner } from "../../../../lib/ui/split-suggestion-banner";
import { ExpenseAnomaliesBadge } from "../../../../lib/ui/expense-anomalies-badge";
// Lazy load : modal d'import CSV (parsing PapaParse), chargé à la demande.
const CsvImportModal = dynamic(
  () =>
    import("../../../../lib/ui/csv-import-modal").then((m) => ({
      default: m.CsvImportModal,
    })),
  { ssr: false },
);
import { ExportButton } from "../../../../lib/ui/export-button";
// Lazy load : Charts (BarChart + DonutChart) — visibles seulement quand
// le user scroll en bas du groupe. Économise ~12 KB initial.
const BarChart = dynamic(
  () => import("../../../../lib/ui/charts").then((m) => ({ default: m.BarChart })),
  { ssr: false },
);
const DonutChart = dynamic(
  () => import("../../../../lib/ui/charts").then((m) => ({ default: m.DonutChart })),
  { ssr: false },
);
import { validateContact } from "../../../../lib/validators";
import { useDialog } from "../../../../lib/ui/dialog-provider";
import { ResponsiveShell } from "../../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../../lib/use-breakpoint";
import { usePlanGate } from "../../../../lib/ui/plan-gate-provider";
import { useApiErrorHandler } from "../../../../lib/use-api-error";
import { useGroupEvents } from "../../../../lib/use-realtime";
import { usePullToRefresh } from "../../../../lib/use-pull-to-refresh";
import { PullIndicator } from "../../../../lib/ui/pull-indicator";
import { useT } from "../../../../lib/i18n/app-strings";
import {
  MultiPayersEditor,
  type PayerInput,
} from "../../../../lib/ui/multi-payers-editor";
import { MeetingsPanel } from "../../../../lib/ui/meetings-panel";
import { useCurrency } from "../../../../lib/currency-provider";

type SplitMode = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";

interface Member {
  id: string;
  role: string;
  joinedAt?: string;
  user: { id: string; displayName: string; avatar?: string | null };
}

const GROUP_TYPE_ICONS: Record<string, string> = {
  TONTINE: "🪙",
  COLOC: "🏠",
  TRAVEL: "✈️",
  EVENT: "💍",
  CLUB: "⚽",
  PARISH: "⛪",
  GENERIC: "📁",
};

function activityIcon(kind: string): string {
  switch (kind) {
    case "GROUP_CREATED":
    case "GROUP_UPDATED":
      return "📁";
    case "MEMBER_JOINED":
    case "MEMBER_INVITED":
      return "👋";
    case "MEMBER_REMOVED":
      return "👋";
    case "MEMBER_ROLE_CHANGED":
      return "🛡";
    case "EXPENSE_ADDED":
      return "💸";
    case "EXPENSE_UPDATED":
      return "✏️";
    case "EXPENSE_DELETED":
      return "🗑";
    case "SETTLEMENT_CREATED":
      return "💳";
    case "TONTINE_CREATED":
    case "TONTINE_ACTIVATED":
      return "🪙";
    case "SWAP_PROPOSED":
    case "SWAP_ACCEPTED":
      return "🔄";
    case "INVITE_TOKEN_CREATED":
      return "🔗";
    default:
      return "•";
  }
}

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;
  const toast = useToast();
  const dialog = useDialog();
  const { isMobile } = useBreakpoint();
  const planGate = usePlanGate();
  const t = useT();
  const { formatAmount } = useCurrency();
  // Z1 — Helper unifié pour catcher les erreurs API : ouvre le dialog
  // upgrade pour 402, redirect login pour 401, toast pour le reste.
  const handleApiError = useApiErrorHandler();

  const [group, setGroup] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSwap, setActiveSwap] = useState<any>(null);

  // Activity feed (M11-like)
  const [activities, setActivities] = useState<any[]>([]);
  const [showActivity, setShowActivity] = useState(false);

  // Search / filter sur la liste de dépenses.
  // useDeferredValue : React 18 ne re-filtre pas la liste à chaque frappe
  // si le user tape vite. Le filtre se déclenche en arrière-plan, l'input
  // reste réactif. Gain perceptible sur > 50 dépenses.
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Confirmation modal pour suppression
  const [confirmDelete, setConfirmDelete] = useState<{
    expenseId: string;
    description: string;
  } | null>(null);

  // Mode édition : si non-null, le panel "expense" est en mode update
  // au lieu de create. Pré-rempli avec les valeurs existantes.
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(
    null,
  );

  // Dépense actuellement expandée pour montrer les pièces jointes
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(
    null,
  );

  // Un seul panel ouvert à la fois (mobile-friendly)
  const [openPanel, setOpenPanel] = useState<"none" | "invite" | "expense">(
    "none",
  );

  // Invite
  const [contactType, setContactType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [contactValue, setContactValue] = useState("+33");

  // Expense form
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState<string>("");
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  const [participants, setParticipants] = useState<Record<string, boolean>>({});
  const [shares, setShares] = useState<Record<string, string>>({});
  // Sprint AC-2 — Multi-payeurs (plusieurs personnes ont avancé)
  const [multiPayers, setMultiPayers] = useState<PayerInput[]>([]);

  // Import CSV — modal saisie en lot (spec §8.4)
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  // OCR — ouverture du modal de scan IA (style maquette)
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{
    merchant: string | null;
    confidence: number;
    itemsFound?: number;
  } | null>(null);
  // Conservé pour le loader inline du bouton (au cas où on scanne hors modal)
  const [scanning, setScanning] = useState(false);

  // Items draft (mode ITEMIZED) — pré-rempli par OCR ou saisi manuel
  const [draftItems, setDraftItems] = useState<
    Array<{
      description: string;
      quantity: number;
      unitPrice: string;
      totalPrice: string;
      /** UserIds des membres pré-assignés à cet article (claim auto à la création) */
      assignedUserIds?: string[];
    }>
  >([]);

  // Split presets (M10)
  const [presets, setPresets] = useState<any[]>([]);

  async function refresh(silent = false) {
    try {
      const [m, g, e, b, swaps, ps, acts] = await Promise.all([
        api.me(),
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.getBalance(groupId),
        api.listSwaps(groupId, false),
        api.listPresets(groupId),
        api.listActivity(groupId).catch(() => []),
      ]);
      setMe(m.user);
      setGroup(g);
      setExpenses(e);
      setBalance(b);
      setActiveSwap(swaps[0] ?? null);
      setPresets(ps);
      setActivities(acts);
    } catch (er) {
      if (isUnauthorized(er)) {
        clearToken();
        router.replace("/login");
        return;
      }
      // En polling silencieux on log juste, on n'affiche pas une erreur visuelle
      if (silent) {
        console.warn("[refresh] silent error", er);
      } else {
        setError((er as Error).message);
      }
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  /**
   * TEMPS RÉEL — remplace le polling 30s par du SSE. Quand un membre du
   * groupe ajoute/modifie une dépense, accepte un swap, ou que la balance
   * change, on reçoit l'event INSTANTANÉMENT et on relance refresh().
   *
   * Throttle simple : si plusieurs events arrivent en rafale (ex: bulk
   * import CSV de 50 dépenses), on debounce le refresh à 500ms pour
   * éviter de spammer l'API.
   *
   * Fallback : si SSE casse (proxy mal configuré, firewall…), on a un
   * polling de secours toutes les 60s.
   */
  const refreshTimerRef = useRef<number | null>(null);
  const debouncedRefresh = () => {
    if (refreshTimerRef.current != null) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      void refresh(true);
    }, 500);
  };

  useGroupEvents(groupId, (event) => {
    // Filtrage : on ne ré-fetch que pour les events qui changent les data
    // qu'on affiche. Les notifications perso passent par useMyEvents
    // ailleurs (notification bell).
    const refreshTriggers = [
      "expense.created",
      "expense.updated",
      "expense.deleted",
      "settlement.created",
      "settlement.confirmed",
      "member.joined",
      "member.left",
      "member.removed",
      "tontine.contribution.paid",
      "tontine.distributed",
      "swap.proposed",
      "swap.accepted",
      "debt-transfer.proposed",
      "debt-transfer.accepted",
      "balance.changed",
    ];
    if (refreshTriggers.includes(event.kind)) {
      debouncedRefresh();
    }
  });

  // Polling de secours (60s) — uniquement si SSE n'est pas dispo (network
  // restreint, proxy qui kill les connexions longues, etc.). En conditions
  // normales SSE prend le relais et ce timer ne déclenche jamais d'update
  // utile (refresh idempotent).
  const fallbackPollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!groupId) return;
    function start() {
      if (fallbackPollRef.current != null) return;
      fallbackPollRef.current = window.setInterval(
        () => void refresh(true),
        60_000,
      );
    }
    function stop() {
      if (fallbackPollRef.current != null) {
        clearInterval(fallbackPollRef.current);
        fallbackPollRef.current = null;
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") start();
      else stop();
    }
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      if (refreshTimerRef.current != null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Pull-to-refresh natif (mobile uniquement — désactivé desktop par
  // détection touch). UX banking app : tirer vers le bas → refresh.
  const { state: pullState, bindToScrollContainer } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([
        new Promise((r) => setTimeout(r, 600)),
        new Promise<void>((resolve) => {
          void refresh().then(() => resolve());
        }),
      ]);
    },
  });
  useEffect(() => {
    bindToScrollContainer(document.body);
  }, [bindToScrollContainer]);

  // Init form expense (mode create OU edit) — ne tourne QUE quand le panneau
  // s'ouvre ou que la dépense en cours d'édition change.
  // ⚠️ NE PAS dépendre de `expenses` : sinon, à chaque refresh SSE, le formulaire
  // se réinitialise et écrase ce que l'utilisateur est en train de saisir
  // (en particulier les items en mode ITEMIZED).
  useEffect(() => {
    if (!group || !me) return;
    if (openPanel === "expense") {
      if (editingExpenseId) {
        // === MODE EDITION : pré-remplir avec les valeurs existantes ===
        const exp = expenses.find((e: any) => e.id === editingExpenseId);
        if (!exp) {
          // Dépense disparue, on annule l'édition
          setEditingExpenseId(null);
          return;
        }
        setDescription(exp.description ?? "");
        setAmount(String(exp.amount ?? ""));
        setPaidByUserId(exp.paidBy?.id ?? me.id);
        setSplitMode(exp.splitMode ?? "EQUAL");
        // Reconstruit participants/shares à partir des shares existantes
        const sel: Record<string, boolean> = {};
        const sh: Record<string, string> = {};
        group.members.forEach((m: Member) => (sel[m.user.id] = false));
        for (const s of exp.shares ?? []) {
          sel[s.user?.id ?? s.userId] = true;
          if (exp.splitMode === "PERCENTAGE") {
            // Reconstruit le % à partir du montant divisé
            const pct =
              (parseFloat(s.amountOwed) / parseFloat(exp.amount)) * 100;
            sh[s.user?.id ?? s.userId] = pct.toFixed(2);
          } else if (exp.splitMode === "UNEQUAL") {
            sh[s.user?.id ?? s.userId] = parseFloat(s.amountOwed).toFixed(2);
          }
        }
        setParticipants(sel);
        setShares(sh);
        // Sprint AC-3 · charge les payers existants si la dépense est en
        // mode multi-payeurs. On reconstruit le tableau PayerInput attendu
        // par MultiPayersEditor (string pour amount, number pour percent).
        if (Array.isArray((exp as any).payers) && (exp as any).payers.length >= 2) {
          setMultiPayers(
            (exp as any).payers.map((p: any) => ({
              userId: p.userId,
              ...(p.amount !== null && p.amount !== undefined
                ? { amount: String(p.amount) }
                : {}),
              ...(p.percent !== null && p.percent !== undefined
                ? { percent: Number(p.percent) }
                : {}),
            })),
          );
        } else {
          setMultiPayers([]);
        }
        // Si la dépense est ITEMIZED, charger les items existants
        if (exp.splitMode === "ITEMIZED") {
          api
            .listExpenseItems(exp.id)
            .then((items) => {
              setDraftItems(
                items.map((it: any) => ({
                  description: it.description,
                  quantity: parseFloat(it.quantity),
                  unitPrice: parseFloat(it.unitPrice).toFixed(2),
                  totalPrice: parseFloat(it.totalPrice).toFixed(2),
                })),
              );
            })
            .catch(() => setDraftItems([]));
        } else {
          setDraftItems([]);
        }
      } else {
        // === MODE CREATION : tout le monde sélectionné par défaut ===
        const all: Record<string, boolean> = {};
        group.members.forEach((m: Member) => (all[m.user.id] = true));
        setParticipants(all);
        setShares({});
        setDraftItems([]);
        setDescription("");
        setAmount("");
        const meIsMember = group.members.some(
          (m: Member) => m.user.id === me.id,
        );
        setPaidByUserId(meIsMember ? me.id : group.members[0]?.user.id ?? "");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPanel, editingExpenseId, group?.id, me?.id]);

  function toggleParticipant(userId: string) {
    setParticipants((p) => ({ ...p, [userId]: !p[userId] }));
  }
  function setShare(userId: string, value: string) {
    setShares((s) => ({ ...s, [userId]: value }));
  }
  const selectedIds = useMemo(
    () => Object.keys(participants).filter((id) => participants[id]),
    [participants],
  );

  const validation = useMemo(() => {
    const amt = parseFloat(amount);
    if (!description.trim()) return { ok: false, msg: t("form.descriptionRequired") };
    if (!amt || amt <= 0) return { ok: false, msg: t("form.amountPositiveRequired") };
    if (selectedIds.length === 0)
      return { ok: false, msg: t("form.minParticipant") };
    if (!paidByUserId) return { ok: false, msg: t("form.choosePayer") };

    if (splitMode === "EQUAL") {
      const each = (amt / selectedIds.length).toFixed(2);
      return {
        ok: true,
        msg: `${each} ${group?.defaultCurrency ?? "€"} × ${selectedIds.length}`,
      };
    }
    if (splitMode === "ITEMIZED") {
      // Pour ITEMIZED on accepte sans items (ils peuvent être ajoutés après)
      // mais on warne si la somme des items ne correspond pas au total
      if (draftItems.length === 0) {
        return {
          ok: true,
          msg: t("form.noItemsNote"),
        };
      }
      const sum = draftItems.reduce(
        (s, it) => s + parseFloat(it.totalPrice || "0"),
        0,
      );
      if (Math.abs(sum - amt) > 0.02) {
        return {
          ok: false,
          msg: t("form.itemMismatch", { sum: sum.toFixed(2), total: amt.toFixed(2) }),
        };
      }
      return {
        ok: true,
        msg: `${draftItems.length} article${draftItems.length > 1 ? "s" : ""} ✓ ${sum.toFixed(2)}`,
      };
    }
    if (splitMode === "UNEQUAL") {
      const total = selectedIds.reduce(
        (acc, id) => acc + (parseFloat(shares[id] || "0") || 0),
        0,
      );
      const diff = Math.abs(total - amt);
      if (diff > 0.01) {
        return {
          ok: false,
          msg: `Somme ${total.toFixed(2)} ≠ ${amt.toFixed(2)}`,
        };
      }
      return { ok: true, msg: `Somme ${total.toFixed(2)} ✓` };
    }
    const totalPct = selectedIds.reduce(
      (acc, id) => acc + (parseFloat(shares[id] || "0") || 0),
      0,
    );
    if (Math.abs(totalPct - 100) > 0.01) {
      return { ok: false, msg: `${totalPct.toFixed(1)} % ≠ 100 %` };
    }
    return { ok: true, msg: `100 % ✓` };
  }, [
    description,
    amount,
    selectedIds,
    paidByUserId,
    splitMode,
    shares,
    group,
    // BUG-FIX · `draftItems` était manquant ici. Quand l'utilisateur supprimait
    // un article (ou en éditait le prix), le memo ne recalculait pas et le bouton
    // de bas-de-page restait sur "✓ 4 articles ✓ 4000.00" alors que l'éditeur
    // affichait "écart -500". Le user pouvait alors valider → l'API rejetait
    // (Invalid request body) → "Dépense créée mais articles non sauvegardés".
    draftItems,
    t,
  ]);

  // ============ FILTRE / EXPORT CSV / DELETE ============

  /** Filtre simple sur description et montant (insensible à la casse).
   *  Utilise `deferredSearchTerm` (React 18) — quand le user tape vite,
   *  l'input reste fluide même avec >100 dépenses. */
  const filteredExpenses = useMemo(() => {
    const q = deferredSearchTerm.trim().toLowerCase();
    if (!q) return expenses;
    return expenses.filter((e: any) => {
      const desc = (e.description ?? "").toLowerCase();
      const payer = (e.paidBy?.displayName ?? "").toLowerCase();
      const amt = String(e.amount ?? "");
      return desc.includes(q) || payer.includes(q) || amt.includes(q);
    });
  }, [expenses, deferredSearchTerm]);

  /**
   * Export CSV : description, montant, devise, payeur, date, mode, parts.
   * Utilise un Blob + ObjectURL pour le download, fonctionne offline.
   */
  function exportExpensesCsv() {
    if (!group || expenses.length === 0) {
      toast.warning(t("expense.nothingToExport"));
      return;
    }
    const headers = [
      "Date",
      "Description",
      "Montant",
      "Devise",
      "Payé par",
      "Mode",
      "Participants",
    ];
    const rows = filteredExpenses.map((e: any) => [
      new Date(e.occurredAt).toISOString().slice(0, 10),
      `"${(e.description ?? "").replace(/"/g, '""')}"`,
      String(parseFloat(e.amount).toFixed(2)),
      e.currency ?? group.defaultCurrency ?? "",
      `"${(e.paidBy?.displayName ?? "").replace(/"/g, '""')}"`,
      e.splitMode ?? "",
      String(e.shares?.length ?? 0),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    // BOM UTF-8 pour qu'Excel ouvre correctement les accents
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bmd-${group.name.replace(/[^a-z0-9]/gi, "-")}-depenses.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t("expense.exportedSuccess", { count: String(rows.length) }));
  }

  async function performDeleteExpense(expenseId: string) {
    try {
      await api.deleteExpense(expenseId);
      toast.success(t("expense.deleted"));
      setConfirmDelete(null);
      await refresh();
    } catch (er) {
      toast.error(er);
    }
  }

  // ============ INVITATIONS (Contact Picker + RGPD) ============

  // File de contacts à inviter en batch
  const [pendingInvites, setPendingInvites] = useState<
    Array<{
      contactType: "PHONE" | "EMAIL";
      contactValue: string;
      displayName?: string;
      source: "manual" | "picker";
    }>
  >([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchResult, setBatchResult] = useState<{
    added: number;
    failed: { contactValue: string; reason: string }[];
  } | null>(null);

  // Détection support Contact Picker (Chrome Android uniquement)
  const contactPickerSupported =
    typeof window !== "undefined" &&
    "contacts" in navigator &&
    "ContactsManager" in window;

  function addToQueue(
    contactType: "PHONE" | "EMAIL",
    contactValue: string,
    displayName?: string,
    source: "manual" | "picker" = "manual",
  ) {
    const value = contactValue.trim();
    if (!value) return;
    // Anti-doublon dans la file
    if (pendingInvites.some((i) => i.contactValue === value)) return;
    setPendingInvites((q) => [
      ...q,
      { contactType, contactValue: value, displayName, source },
    ]);
  }

  function removeFromQueue(idx: number) {
    setPendingInvites((q) => q.filter((_, i) => i !== idx));
  }

  function addManualToQueue() {
    if (!contactValue.trim()) return;
    // Validation E.164/RFC 5322 avant d'ajouter à la file
    const r = validateContact(contactType, contactValue);
    if (!r.ok) {
      toast.error(r.message ?? "Contact invalide");
      return;
    }
    addToQueue(contactType, r.value!, undefined, "manual");
    setContactValue(contactType === "PHONE" ? "+33" : "");
  }

  // Validation en temps réel pour l'indicateur visuel sous l'input
  const liveContactValidation = useMemo(() => {
    if (!contactValue.trim() || contactValue === "+33") return null;
    return validateContact(contactType, contactValue);
  }, [contactType, contactValue]);

  /**
   * Ouvre le Contact Picker système (Chrome Android uniquement).
   * RGPD : l'utilisateur consent EXPLICITEMENT en touchant le bouton, et
   * choisit MANUELLEMENT chaque contact dans le picker système. On ne lit
   * jamais le carnet en bulk.
   */
  async function pickContactsFromDevice() {
    setError(null);
    if (!contactPickerSupported) {
      setError(
        "Sélection depuis les contacts non supportée sur ce navigateur. Saisis manuellement.",
      );
      return;
    }
    try {
      // Cast en any car les types DOM ne couvrent pas encore Contacts API
      const contacts = await (navigator as any).contacts.select(
        ["name", "tel", "email"],
        { multiple: true },
      );
      let addedCount = 0;
      for (const c of contacts) {
        const name: string | undefined = c.name?.[0];
        // On préfère le téléphone, sinon l'email
        const phone: string | undefined = c.tel?.[0];
        const email: string | undefined = c.email?.[0];
        if (phone) {
          // Normaliser : garder + et chiffres uniquement
          const cleaned = phone.replace(/[^\d+]/g, "");
          if (cleaned.length >= 6) {
            addToQueue("PHONE", cleaned, name, "picker");
            addedCount++;
          }
        } else if (email) {
          addToQueue("EMAIL", email, name, "picker");
          addedCount++;
        }
      }
      if (addedCount === 0) {
        setError(
          "Aucun contact valide sélectionné (besoin d'un numéro ou email).",
        );
      }
    } catch (e) {
      // L'utilisateur a annulé : pas une vraie erreur
      const msg = (e as Error).message ?? "";
      if (!msg.toLowerCase().includes("cancel")) {
        setError(`Picker : ${msg}`);
      }
    }
  }

  async function submitBatch() {
    if (pendingInvites.length === 0) return;
    setError(null);
    setBatchResult(null);
    setBatchSubmitting(true);
    try {
      const result = await api.batchInviteMembers(
        groupId,
        pendingInvites.map((i) => ({
          contactType: i.contactType,
          contactValue: i.contactValue,
          displayName: i.displayName,
        })),
      );
      setBatchResult({
        added: result.added.length,
        failed: result.failed,
      });
      setPendingInvites([]);
      await refresh();
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    } finally {
      setBatchSubmitting(false);
    }
  }

  function loadPreset(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    // Applique le mode + les participants + les parts du preset
    setSplitMode(preset.splitMode);
    const sel: Record<string, boolean> = {};
    const sh: Record<string, string> = {};
    for (const p of preset.config.participants) {
      sel[p.userId] = true;
      if (p.share !== undefined) sh[p.userId] = String(p.share);
    }
    setParticipants(sel);
    setShares(sh);
    if (preset.config.paidByUserId) {
      setPaidByUserId(preset.config.paidByUserId);
    }
  }

  async function savePreset() {
    if (selectedIds.length === 0) {
      // Z1 — Erreur de validation client → toast warning visible immédiatement
      // (avant : texte plat en bas de page que l'utilisateur ne voyait pas).
      handleApiError(t("form.selectParticipantsFirst"), {
        kind: "validation",
      });
      return;
    }
    const name = await dialog.prompt(
      t("group.presetNamePrompt"),
      {
        title: t("group.newPreset"),
        placeholder: t("group.presetExample"),
      },
    );
    if (!name?.trim()) return;
    setError(null);
    try {
      const config = {
        paidByUserId,
        participants:
          splitMode === "EQUAL"
            ? selectedIds.map((id) => ({ userId: id }))
            : selectedIds.map((id) => ({
                userId: id,
                share: parseFloat(shares[id] || "0"),
              })),
      };
      await api.createPreset(groupId, {
        name: name.trim(),
        splitMode,
        config,
      });
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deletePreset(presetId: string) {
    if (
      !(await dialog.confirm(t("group.deletePresetConfirm"), {
        variant: "danger",
        title: "Suppression",
        confirmLabel: "Supprimer",
      }))
    )
      return;
    try {
      await api.deletePreset(presetId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addExpense() {
    setError(null);
    if (!validation.ok) {
      setError(validation.msg);
      return;
    }
    const payload: any = {
      description,
      amount,
      paidByUserId,
      splitMode,
      participants:
        splitMode === "EQUAL"
          ? selectedIds.map((id) => ({ userId: id }))
          : selectedIds.map((id) => ({
              userId: id,
              share: parseFloat(shares[id] || "0"),
            })),
    };
    // Sprint AC-2 — Multi-payeurs : on n'envoie le tableau que s'il contient
    // au moins 2 entrées (sinon un seul payeur via paidByUserId est suffisant).
    // Sprint AC-3 — En mode édition, on envoie aussi un tableau VIDE pour
    // signaler explicitement "repasser en single-payeur" (sinon le backend
    // pense qu'on ne touche pas et garde l'ancien multi-payeurs).
    if (multiPayers.length >= 2) {
      payload.payers = multiPayers
        .filter((p) => p.userId)
        .map((p) =>
          p.percent !== undefined
            ? { userId: p.userId, percent: p.percent }
            : { userId: p.userId, amount: p.amount ?? "0" },
        );
    } else if (editingExpenseId) {
      // Mode édition + 0 ou 1 payeur dans l'éditeur → reset explicite
      payload.payers = [];
    }

    // === OPTIMISTIC UI ===
    // En mode création, on injecte une dépense "_optimistic" dans la liste
    // et on ferme le panel IMMÉDIATEMENT pour donner un feedback instantané.
    // Si l'API échoue, on rollback (retire la dépense + ré-ouvre le panel).
    // Le toast et le refresh remplaceront ensuite la version optimiste.
    const optimisticId =
      !editingExpenseId
        ? `_optimistic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        : null;

    if (optimisticId) {
      const paidByMember = group?.members?.find(
        (m: any) => m.user.id === paidByUserId,
      );
      const optimisticExpense = {
        id: optimisticId,
        description,
        amount,
        currency: group?.defaultCurrency ?? "EUR",
        occurredAt: new Date().toISOString(),
        category: null,
        paidBy: paidByMember
          ? {
              id: paidByMember.user.id,
              displayName: paidByMember.user.displayName,
            }
          : { id: paidByUserId, displayName: "…" },
        shares: selectedIds.map((id) => ({ userId: id })),
        splitMode,
        _optimistic: true,
      };
      setExpenses((prev) => [optimisticExpense, ...prev]);
      // Ferme le panel et reset les champs immédiatement
      setOpenPanel("none");
      const savedDescription = description;
      setDescription("");
      setAmount("");
      setShares({});
      setScanResult(null);
      setDraftItems([]);
      setMultiPayers([]);
      // Toast de "saving" éphémère
      toast.success(t("expense.addedOptimistic", { description: savedDescription }));
    }

    try {
      let expenseId: string;
      if (editingExpenseId) {
        // === MODE EDITION === (pas d'optimistic, on attend la confirm)
        await api.updateExpense(editingExpenseId, payload);
        expenseId = editingExpenseId;
        toast.success(t("expense.updated", { description: payload.description }));
      } else {
        const created = await api.createExpense(groupId, payload);
        expenseId = created.id;
        // Toast déjà émis en mode optimistic — pas la peine de le doubler.
      }
      // Si on est en mode ITEMIZED, on attache les items à la dépense.
      // Ils sont stockés séparément des shares (qui restent en mode equal
      // initial) et serviront à calculer la vraie répartition via les claims.
      if (splitMode === "ITEMIZED" && draftItems.length > 0) {
        try {
          const validItems = draftItems.filter(
            (it) =>
              it.description.trim() &&
              parseFloat(it.totalPrice || "0") > 0,
          );
          // 1. Crée les items côté serveur — la réponse contient les IDs
          //    persistés qu'on utilise ensuite pour les claims auto.
          const createdItems = await api.setExpenseItems(
            expenseId,
            validItems,
          );
          // 2. Pour chaque item, applique automatiquement les claims des
          //    membres pré-assignés au moment de la saisie. Ainsi l'utilisateur
          //    n'a pas besoin d'aller dans une 2e étape "qui a consommé quoi".
          //    Autorisation : le payeur (ou admin) peut claim au nom des autres.
          await Promise.all(
            validItems.map(async (draft, idx) => {
              const itemId = (createdItems as any[])[idx]?.id;
              if (!itemId || !draft.assignedUserIds?.length) return;
              for (const userId of draft.assignedUserIds) {
                try {
                  // share=undefined → équirépartition auto entre tous les claims
                  // de l'item, comme attendu quand plusieurs membres consomment
                  // le même article ensemble.
                  await api.claimItem(itemId, undefined, userId);
                } catch {
                  /* claim échoué : on ignore — l'utilisateur pourra retenter */
                }
              }
            }),
          );
        } catch (itErr) {
          // On a déjà créé la dépense ; on signale juste l'échec items
          toast.error(
            t("expense.itemsSaveError", { message: (itErr as Error).message }),
          );
        }
      }
      // En édition seulement : on a attendu la confirm, on peut nettoyer ici.
      // En création optimiste : déjà nettoyé plus haut. void refresh() reload
      // depuis l'API pour remplacer la version optimistic par la vraie.
      if (editingExpenseId) {
        setOpenPanel("none");
        setEditingExpenseId(null);
        setDescription("");
        setAmount("");
        setShares({});
        setScanResult(null);
        setDraftItems([]);
      }
      void refresh();
    } catch (e) {
      // === ROLLBACK OPTIMISTIC ===
      // Si on avait pré-injecté une dépense, on la retire maintenant.
      if (optimisticId) {
        setExpenses((prev) =>
          prev.filter((x: any) => x.id !== optimisticId),
        );
      }
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      // Si l'API renvoie 402 (limite plan) → on ouvre le PlanGateDialog
      if (planGate.handleApiError(e)) {
        setOpenPanel("none");
        return;
      }
      toast.error(e);
      // On ré-ouvre le panel pour que l'utilisateur puisse retenter
      if (optimisticId) {
        setDescription(payload.description);
        setAmount(payload.amount);
        setOpenPanel("expense");
      }
      setError((e as Error).message);
    }
  }

  /** Ouvre le panel en mode édition pour une dépense existante */
  function openEditPanel(expenseId: string) {
    setEditingExpenseId(expenseId);
    setOpenPanel("expense");
  }

  /** Ferme/réinitialise le panel proprement */
  function closeExpensePanel() {
    setOpenPanel("none");
    setEditingExpenseId(null);
  }

  function autoFillShares() {
    if (selectedIds.length === 0) return;
    const next: Record<string, string> = {};
    if (splitMode === "UNEQUAL") {
      const amt = parseFloat(amount) || 0;
      const each = (amt / selectedIds.length).toFixed(2);
      selectedIds.forEach((id) => (next[id] = each));
    } else if (splitMode === "PERCENTAGE") {
      const each = (100 / selectedIds.length).toFixed(2);
      selectedIds.forEach((id) => (next[id] = each));
    }
    setShares(next);
  }

  async function scanTicket(file: File) {
    setError(null);
    setScanning(true);
    setScanResult(null);
    try {
      // Sprint AB · on passe le groupId pour permettre au backend de
      // fallback sur le plan de l'admin du groupe quand le quota perso
      // est épuisé (admin payeur couvre les scans dans son workspace).
      const result = await api.scanReceipt(file, groupId);
      if (result.amount) setAmount(result.amount);
      if (result.merchant) setDescription(result.merchant);
      else if (result.category) setDescription(result.category);
      // Si l'OCR a détecté des items, on bascule auto en mode ITEMIZED
      // et on pré-remplit l'éditeur. L'utilisateur peut toujours retirer
      // ou rajouter des lignes avant de valider.
      if (result.items && result.items.length > 0) {
        setDraftItems(
          result.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          })),
        );
        setSplitMode("ITEMIZED");
      }
      setScanResult({
        merchant: result.merchant,
        confidence: result.confidence,
        itemsFound: result.items?.length ?? 0,
      });
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError(`Échec du scan : ${(e as Error).message}`);
    } finally {
      setScanning(false);
    }
  }

  async function proposeSwap() {
    setError(null);
    try {
      await api.proposeSwap(groupId);
      void refresh();
    } catch (e) {
      // Z1 — Le hook unifié gère 402 (→ dialog upgrade), 401 (→ login),
      // et les autres erreurs (→ toast). Plus jamais de texte plat en bas.
      handleApiError(e);
    }
  }
  async function acceptSwap() {
    setError(null);
    try {
      await api.acceptSwap(activeSwap.id);
      void refresh();
    } catch (e) {
      handleApiError(e);
    }
  }
  async function rejectSwap() {
    setError(null);
    try {
      await api.rejectSwap(activeSwap.id);
      void refresh();
    } catch (e) {
      handleApiError(e);
    }
  }
  async function cancelSwap() {
    if (
      !(await dialog.confirm("Annuler la proposition de swap ?", {
        variant: "warning",
        title: "Annuler la proposition",
        confirmLabel: "Annuler le swap",
        cancelLabel: "Garder",
      }))
    )
      return;
    try {
      await api.cancelSwap(activeSwap.id);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!group) {
    // Skeleton pendant le chargement initial — wrappé dans ResponsiveShell
    // pour que le shell (sidebar desktop / header mobile) s'affiche pendant
    // le fetch (sinon flash de container nu).
    return (
      <ResponsiveShell
        breadcrumb={t("group.title")}
        desktopTitle={t("common.loading")}
        mobileTitle={t("common.loading")}
        back={{ href: "/dashboard" }}
        hideFab
      >
        <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 12, padding: isMobile ? 16 : 0 }}>
          <SkelLine width="60%" height={28} />
          <SkelLine width="40%" height={14} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 8 }}>
            {[0, 1, 2].map((i) => (
              <SkelBox key={i} height={64} />
            ))}
          </div>
          <SkelBox height={120} />
          <SkelBox height={180} />
        </div>
      </ResponsiveShell>
    );
  }

  const groupIcon = GROUP_TYPE_ICONS[group.type] ?? "📁";
  const groupTypeLabel =
    group.type === "TONTINE"
      ? "Tontine"
      : group.type === "COLOC"
        ? "Coloc"
        : group.type === "TRAVEL"
          ? "Voyage"
          : group.type === "EVENT"
            ? "Événement"
            : group.type === "CLUB"
              ? "Club"
              : group.type === "PARISH"
                ? "Paroisse"
                : "Groupe";

  // Action primaire (header desktop + headerRight mobile) : lien Paramètres
  const headerSettingsLink = (
    <Link
      href={`/dashboard/groups/${groupId}/settings`}
      aria-label={t("group.settings")}
      title={t("group.settings")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: isMobile ? 0 : "10px 14px",
        width: isMobile ? 40 : undefined,
        height: isMobile ? 40 : undefined,
        borderRadius: 10,
        background: isMobile
          ? "rgba(244,228,193,0.06)"
          : "transparent",
        border: "1px solid rgba(244,228,193,0.18)",
        color: "var(--cream-soft)",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      ⚙️ {!isMobile && t("group.settings")}
    </Link>
  );

  return (
    <ResponsiveShell
      breadcrumb={`Groupes › ${groupTypeLabel}`}
      desktopTitle={`${groupIcon} ${group.name}`}
      subtitle={`${group.members.length} membre${group.members.length > 1 ? "s" : ""} · ${group.defaultCurrency}`}
      primaryAction={headerSettingsLink}
      mobileTitle={group.name}
      back={{ href: "/dashboard" }}
      mobileHeaderRight={headerSettingsLink}
      onFabClick={() => {
        setEditingExpenseId(null);
        setOpenPanel("expense");
      }}
    >
      <div className={`group-detail-page ${isMobile ? "is-mobile" : "is-desktop"}`}>
      {/* Pull-to-refresh indicator (mobile only — silencieux sur desktop) */}
      {isMobile && <PullIndicator {...pullState} />}

      {/* Page header — masqué sur desktop (le DesktopShell affiche déjà titre/sous-titre/action) */}
      {isMobile && (
      <div className="page-header">
        <div className="titles" style={{ flex: 1 }}>
          <h1>
            <span style={{ marginRight: 8 }}>{groupIcon}</span>
            {group.name}
          </h1>
          <div className="sub">
            {group.members.length} membre{group.members.length > 1 ? "s" : ""}{" "}
            · {group.defaultCurrency} · {group.type.toLowerCase()}
          </div>
        </div>
        <Link
          href={`/dashboard/groups/${groupId}/settings`}
          aria-label={t("group.settingsTitle")}
          title={t("group.settingsTitle")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: 10,
            border: "1px solid var(--border, rgba(255,255,255,0.1))",
            color: "inherit",
            textDecoration: "none",
            fontSize: 20,
          }}
        >
          ⚙️
        </Link>
      </div>
      )}

      {error && <div className="error">{error}</div>}

      {/* Hero "Mon solde dans ce groupe" — affiché en TÊTE de page,
          immédiatement visible à l'ouverture (UX banque mobile : la
          première chose qu'on voit, c'est combien on doit / on me doit). */}
      <GroupHeroBalance group={group} balance={balance} meId={me?.id} />

      {/* Navigation par sections (chip bar) — sticky sur mobile.
          Sur mobile, donne un accès direct à chaque section sans
          scroller. Sur desktop, masquée (le multi-col rend la nav inutile). */}
      <SectionNav
        sections={[
          { id: "section-balance", label: t("group.balance"), icon: "⚖" },
          { id: "section-expenses", label: t("group.expenses"), icon: "🧾" },
          { id: "section-members", label: t("group.members"), icon: "👥" },
          { id: "section-activity", label: t("group.activity"), icon: "📰" },
          { id: "section-actions", label: t("group.actions"), icon: "⚡" },
        ]}
      />

      <div id="section-actions" />

      {/* Quick actions */}
      <div className="quick-row">
        <Link
          href={`/dashboard/groups/${groupId}/tontine`}
          className="quick-card"
        >
          <span className="ico">🪙</span>
          <span className="lbl">Tontine</span>
        </Link>
        <button
          type="button"
          className="quick-card"
          onClick={() => {
            if (openPanel === "expense") {
              closeExpensePanel();
            } else {
              setEditingExpenseId(null); // s'assurer d'être en mode create
              setOpenPanel("expense");
            }
          }}
          style={{
            cursor: "pointer",
            ...(openPanel === "expense" && {
              borderColor: "var(--saffron)",
              background: "rgba(232,163,61,0.18)",
            }),
          }}
        >
          <span className="ico">＋</span>
          <span className="lbl">Dépense</span>
        </button>
        <button
          type="button"
          className="quick-card"
          onClick={() =>
            setOpenPanel(openPanel === "invite" ? "none" : "invite")
          }
          style={{
            cursor: "pointer",
            ...(openPanel === "invite" && {
              borderColor: "var(--saffron)",
              background: "rgba(232,163,61,0.18)",
            }),
          }}
        >
          <span className="ico">👤</span>
          <span className="lbl">Inviter</span>
        </button>
      </div>

      {/* === PANEL : Inviter === */}
      {openPanel === "invite" && (
        <div className="card">
          <div className="card-head">
            <h2>{t("group.inviteTitle")}</h2>
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                setOpenPanel("none");
                setPendingInvites([]);
                setBatchResult(null);
              }}
            >
              ✕
            </button>
          </div>

          {/* === Disclaimer RGPD === */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 11,
              marginBottom: 12,
              background: "rgba(232,163,61,0.06)",
              border: "1px solid var(--line-soft)",
              color: "var(--cream-soft)",
              lineHeight: 1.5,
            }}
          >
            {t("group.invitePrivacy")}{" "}
            <Link
              href="/legal/privacy"
              style={{
                color: "var(--saffron)",
                textDecoration: "underline",
              }}
            >
              En savoir plus
            </Link>
          </div>

          {/* === Bouton Contact Picker (Android) === */}
          {contactPickerSupported ? (
            <button
              type="button"
              onClick={pickContactsFromDevice}
              className="btn-ghost btn-block"
              style={{
                marginBottom: 12,
                borderColor: "var(--saffron)",
                color: "var(--saffron)",
              }}
            >
              📇 Choisir dans mon répertoire
            </button>
          ) : (
            <div
              className="info"
              style={{ fontSize: 11, lineHeight: 1.5 }}
            >
              ℹ️ La sélection depuis le carnet d'adresses est disponible
              sur Chrome Android. Sur iPhone et autres navigateurs, saisis
              manuellement les contacts ci-dessous.
            </div>
          )}

          {/* === Saisie manuelle === */}
          <div
            style={{
              padding: 10,
              borderRadius: 10,
              background: "var(--overlay)",
              border: "1px solid var(--line-soft)",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.4,
                color: "var(--muted)",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              ✍ Saisie manuelle
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <select
                value={contactType}
                onChange={(e) => {
                  const t = e.target.value as "PHONE" | "EMAIL";
                  setContactType(t);
                  setContactValue(t === "PHONE" ? "+33" : "");
                }}
                style={{
                  background: "var(--overlay-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 10,
                  padding: "10px 8px",
                  fontSize: 13,
                  color: "var(--cream)",
                  width: 80,
                }}
              >
                <option value="PHONE">📞</option>
                <option value="EMAIL">✉️</option>
              </select>
              <input
                type={contactType === "EMAIL" ? "email" : "tel"}
                inputMode={contactType === "EMAIL" ? "email" : "tel"}
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addManualToQueue();
                }}
                placeholder={
                  contactType === "PHONE"
                    ? "+33 6 12 34 56 78"
                    : "ami@exemple.com"
                }
                style={{
                  flex: 1,
                  background: "var(--overlay-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 16,
                  color: "var(--cream)",
                  minWidth: 0,
                }}
              />
              <button
                type="button"
                onClick={addManualToQueue}
                disabled={
                  !contactValue.trim() ||
                  (liveContactValidation !== null && !liveContactValidation.ok)
                }
                className="btn-ghost btn-sm"
                style={{
                  flexShrink: 0,
                  borderColor: "var(--saffron)",
                  color: "var(--saffron)",
                  opacity:
                    contactValue.trim() &&
                    (!liveContactValidation || liveContactValidation.ok)
                      ? 1
                      : 0.4,
                }}
              >
                ＋ Ajouter
              </button>
            </div>
            {/* Feedback validation temps réel */}
            {liveContactValidation && (
              <div
                style={{
                  fontSize: 11,
                  marginTop: 4,
                  color: liveContactValidation.ok
                    ? "var(--emerald, #10b981)"
                    : "var(--rose, #ef4444)",
                }}
              >
                {liveContactValidation.ok
                  ? `✓ Format valide${liveContactValidation.value !== contactValue ? ` (sera normalisé en ${liveContactValidation.value})` : ""}`
                  : `⚠ ${liveContactValidation.message}`}
              </div>
            )}
          </div>

          {/* === File d'invitations en attente === */}
          {pendingInvites.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-title">
                <span>
                  📋 À inviter ({pendingInvites.length})
                </span>
                <a
                  onClick={() => setPendingInvites([])}
                  style={{ cursor: "pointer" }}
                >
                  Tout vider
                </a>
              </div>
              <div className="list">
                {pendingInvites.map((inv, idx) => (
                  <div key={idx} className="list-item">
                    <div className="icon">
                      {inv.contactType === "PHONE" ? "📞" : "✉️"}
                    </div>
                    <div className="text">
                      <div className="name">
                        {inv.displayName ?? inv.contactValue}
                      </div>
                      <div className="meta">
                        {inv.displayName ? inv.contactValue : ""}
                        {inv.source === "picker" && (
                          <span
                            style={{
                              color: "var(--saffron)",
                              marginLeft: 4,
                            }}
                          >
                            · 📇 répertoire
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromQueue(idx)}
                      className="btn-ghost btn-sm"
                      style={{
                        padding: "4px 10px",
                        color: "var(--rose)",
                        borderColor: "rgba(217,113,74,0.3)",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === Résultat du dernier batch === */}
          {batchResult && (
            <>
              {batchResult.added > 0 && (
                <div className="success" style={{ fontSize: 12 }}>
                  ✓ {batchResult.added} invitation
                  {batchResult.added > 1 ? "s" : ""} envoyée
                  {batchResult.added > 1 ? "s" : ""}
                </div>
              )}
              {batchResult.failed.length > 0 && (
                <div className="error" style={{ fontSize: 12 }}>
                  ✗ {batchResult.failed.length} échec
                  {batchResult.failed.length > 1 ? "s" : ""} :
                  <ul
                    style={{
                      marginTop: 4,
                      marginLeft: 16,
                      lineHeight: 1.4,
                    }}
                  >
                    {batchResult.failed.map((f, i) => (
                      <li key={i}>
                        <strong>{f.contactValue}</strong> · {f.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* === Action finale === */}
          <button
            className="btn btn-block"
            onClick={submitBatch}
            disabled={pendingInvites.length === 0 || batchSubmitting}
          >
            {batchSubmitting
              ? "Envoi en cours…"
              : pendingInvites.length === 0
                ? "Ajoute au moins 1 contact"
                : `✓ Inviter ${pendingInvites.length} personne${pendingInvites.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* === PANEL : Ajouter / éditer dépense === */}
      {openPanel === "expense" && (
        <div className="card">
          <div className="card-head">
            <h2>
              {editingExpenseId ? "✏️ " + t("group.editExpense") : t("expense.modalTitle")}
            </h2>
            <button className="btn-ghost btn-sm" onClick={closeExpensePanel}>
              ✕
            </button>
          </div>

          {/* Charger un preset (M10) */}
          {presets.length > 0 && (
            <div className="field">
              <label>🔖 Charger un partage type</label>
              <select
                onChange={(e) => {
                  if (e.target.value) loadPreset(e.target.value);
                  e.target.value = "";
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Choisis un modèle…
                </option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.config.participants.length}p ·{" "}
                    {p.splitMode === "EQUAL"
                      ? "égal"
                      : p.splitMode === "PERCENTAGE"
                        ? "%"
                        : "parts"}
                    )
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sprint AB · Compteur OCR au-dessus du bouton scan : visible avant
              chaque scan pour générer l'envie d'upgrade et signaler quand le
              quota est atteint mais qu'on peut continuer dans ce groupe payant. */}
          <div style={{ marginBottom: 10 }}>
            <OcrCounter variant="card" />
          </div>

          {/* OCR scan : ouvre le modal IA fullscreen (style maquette) */}
          <button
            type="button"
            onClick={() => setScanModalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1.5px dashed var(--saffron)",
              background:
                "linear-gradient(135deg,rgba(232,163,61,0.08),rgba(181,70,46,0.04))",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--saffron)",
              marginBottom: 14,
              minHeight: 50,
              transition: "all 0.15s",
              fontFamily: "inherit",
              width: "100%",
            }}
          >
            {t("expense.scanReceipt")}
          </button>

          {/* Saisie vocale (spec §3.8 + Sprint AC) — pré-remplit le formulaire.
              Le LLM reçoit le contexte du groupe via groupId et matche
              directement les noms cités → participantIds + paidByUserId
              + splitMode + shares résolus. Le frontend applique tout. */}
          <div style={{ marginBottom: 14 }}>
            <VoiceInput
              hint="Dis-moi quoi ajouter, je remplis pour toi"
              groupId={groupId}
              onParsed={(r) => {
                // 1. Champs de base
                if (r.amount) setAmount(r.amount);
                if (r.description) setDescription(r.description);

                // 2. Sprint AC · si le LLM a résolu le payeur, on l'applique direct
                if (r.paidByUserId) {
                  setPaidByUserId(r.paidByUserId);
                }

                // 3. Sprint AC · si le LLM a résolu les participants, on coche
                //    direct ces ids. Sinon fallback sur le matching fuzzy
                //    par displayName (parser local ou LLM sans contexte).
                if (r.participantIds && r.participantIds.length > 0 && group?.members) {
                  const next: Record<string, boolean> = {};
                  for (const m of group.members) {
                    next[m.user.id] = r.participantIds!.includes(m.user.id);
                  }
                  setParticipants(next);
                } else if (r.participantsHints.length > 0 && group?.members) {
                  const normalize = (s: string) =>
                    s
                      .normalize("NFD")
                      .replace(/\p{Diacritic}/gu, "")
                      .toLowerCase();
                  const next: Record<string, boolean> = {};
                  for (const m of group.members) {
                    const name = normalize(m.user.displayName);
                    next[m.user.id] = r.participantsHints.some((h) =>
                      name.includes(normalize(h)),
                    );
                  }
                  if (Object.values(next).some((v) => v)) {
                    setParticipants(next);
                  }
                }

                // 4. Sprint AC · mode de partage + parts personnalisées si dictées
                if (r.splitMode) {
                  setSplitMode(r.splitMode);
                  if (r.shares && Object.keys(r.shares).length > 0) {
                    const next: Record<string, string> = {};
                    for (const [uid, val] of Object.entries(r.shares)) {
                      next[uid] = String(val);
                    }
                    setShares(next);
                  }
                }

                // 5. Sprint AC-3 · multi-payeurs détectés ("Karim 30, Linda 50, moi 20")
                // → bascule automatiquement le formulaire en mode multi-payeurs
                if (r.payers && r.payers.length >= 2) {
                  setMultiPayers(
                    r.payers.map((p: any) => ({
                      userId: p.userId,
                      ...(typeof p.amount === "number"
                        ? { amount: String(p.amount) }
                        : {}),
                      ...(typeof p.percent === "number"
                        ? { percent: p.percent }
                        : {}),
                    })),
                  );
                }
              }}
            />
          </div>

          {scanResult && !scanning && (
            <div
              className={scanResult.confidence > 0.6 ? "success" : "info"}
              style={{ fontSize: 12 }}
            >
              ✓ Lu · confiance {Math.round(scanResult.confidence * 100)} %
              {scanResult.itemsFound !== undefined && scanResult.itemsFound > 0 && (
                <>
                  {" · "}
                  <strong>
                    {scanResult.itemsFound} article
                    {scanResult.itemsFound > 1 ? "s" : ""} détecté
                    {scanResult.itemsFound > 1 ? "s" : ""}
                  </strong>{" "}
                  · mode "Articles" activé
                </>
              )}
            </div>
          )}

          <div className="field">
            <label>{t("expense.description")}</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("expense.placeholderHint")}
            />
          </div>

          {/* Suggestion IA basée sur l'historique du groupe (spec §3.7).
              N'apparaît que si BMD a appris des patterns (>= 3 dépenses
              similaires). L'utilisateur peut Appliquer ou Ignorer. */}
          <SplitSuggestionBanner
            groupId={group.id}
            description={description}
            members={group.members}
            currentSplitMode={splitMode}
            onApply={({ splitMode: m, participantUserIds }) => {
              setSplitMode(m);
              const next: Record<string, boolean> = {};
              for (const memId of participantUserIds) next[memId] = true;
              setParticipants(next);
            }}
          />

          <div className="field">
            <label>{t("group.amountLabel", { currency: group.defaultCurrency })}</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="60.00"
              inputMode="decimal"
            />
          </div>

          <div className="field">
            <label>{t("expense.whoPaid")}</label>
            <select
              value={paidByUserId}
              onChange={(e) => setPaidByUserId(e.target.value)}
            >
              {group.members.map((m: Member) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.displayName}
                  {me?.id === m.user.id ? ` (${t("expense.me")})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Sprint AC-2 — Multi-payeurs : optionnel, juste sous le payeur
              principal. Permet de répartir le crédit entre plusieurs personnes
              quand chacune a avancé une partie de la dépense (cas resto à 3,
              etc.). Si désactivé, le mode classique paidByUserId reste actif. */}
          {me && group?.members && group.members.length >= 2 && amount && (
            <div className="field">
              <MultiPayersEditor
                members={group.members.map((m: Member) => ({
                  id: m.user.id,
                  displayName: m.user.displayName,
                }))}
                meId={me.id}
                totalAmount={amount}
                currency={group.defaultCurrency}
                value={multiPayers}
                onChange={setMultiPayers}
              />
            </div>
          )}

          <div className="field">
            <label>{t("expense.shareMode")}</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 6,
              }}
            >
              {[
                { v: "EQUAL", lbl: t("expense.shareEqual") },
                { v: "UNEQUAL", lbl: t("expense.shareCustom") },
                { v: "PERCENTAGE", lbl: t("expense.sharePercent") },
                { v: "ITEMIZED", lbl: t("expense.shareItems") },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => {
                    setSplitMode(opt.v as SplitMode);
                    setShares({});
                  }}
                  style={{
                    padding: "10px 4px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    border:
                      splitMode === opt.v
                        ? "1px solid var(--saffron)"
                        : "1px solid var(--line-soft)",
                    background:
                      splitMode === opt.v
                        ? "rgba(232,163,61,0.16)"
                        : "var(--overlay-2)",
                    color:
                      splitMode === opt.v
                        ? "var(--saffron)"
                        : "var(--cream-soft)",
                    cursor: "pointer",
                    minHeight: 42,
                  }}
                >
                  {opt.lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Raccourci "Couple 50/50" — visible pour type EVENT (mariages) */}
          {/* Spec §3.7 : "Couple uniquement (50/50 par défaut, ajustable)" */}
          {group.type === "EVENT" && (
            <div className="field">
              <button
                type="button"
                onClick={() => {
                  // Sélectionne uniquement moi + le payeur (s'il diffère),
                  // sinon les 2 premiers membres ; passe en UNEQUAL avec 50/50.
                  const meId = me?.id;
                  const others = group.members
                    .map((m: Member) => m.user.id)
                    .filter((id: string) => id !== meId);
                  const partner = paidByUserId !== meId
                    ? paidByUserId
                    : others[0] ?? meId;
                  const sel: Record<string, boolean> = {};
                  group.members.forEach(
                    (m: Member) => (sel[m.user.id] = false),
                  );
                  if (meId) sel[meId] = true;
                  if (partner && partner !== meId) sel[partner] = true;
                  setParticipants(sel);
                  setSplitMode("UNEQUAL");
                  // 50/50 sera appliqué via autoFillShares mais on calcule direct
                  const amt = parseFloat(amount) || 0;
                  if (amt > 0) {
                    const half = (amt / 2).toFixed(2);
                    const sh: Record<string, string> = {};
                    if (meId) sh[meId] = half;
                    if (partner && partner !== meId) sh[partner] = half;
                    setShares(sh);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background:
                    "linear-gradient(135deg, rgba(232,163,61,0.08), rgba(181,70,46,0.04))",
                  border: "1px dashed var(--saffron, #E8A33D)",
                  borderRadius: 10,
                  color: "var(--saffron, #E8A33D)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  minHeight: 42,
                }}
              >
                💍 Couple uniquement (50/50)
              </button>
            </div>
          )}

          {/* Mode ITEMIZED : éditeur des articles */}
          {splitMode === "ITEMIZED" && (
            <div className="field">
              <label>
                Articles du ticket
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    marginLeft: 6,
                    fontWeight: 400,
                  }}
                >
                  · sélectionne directement les membres concernés par chaque
                  article (sinon, tous paieront ensemble)
                </span>
              </label>
              <ItemizedEditor
                items={draftItems}
                onChange={setDraftItems}
                totalAmount={amount || "0"}
                currency={group.defaultCurrency}
                members={group.members.map((m: any) => ({
                  id: m.user.id,
                  displayName: m.user.displayName,
                }))}
              />
            </div>
          )}

          <div className="field">
            <label>
              {t("expense.participants", { count: String(selectedIds.length), total: String(group.members.length) })}
            </label>
            <div
              style={{
                background: "var(--overlay)",
                border: "1px solid var(--line-soft)",
                borderRadius: 12,
                padding: 6,
              }}
            >
              {group.members.map((m: Member) => {
                const isSel = !!participants[m.user.id];
                return (
                  <div
                    key={m.user.id}
                    onClick={() => toggleParticipant(m.user.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: isSel
                        ? "rgba(232,163,61,0.06)"
                        : "transparent",
                      minHeight: 42,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        border: "1.5px solid var(--saffron)",
                        background: isSel ? "var(--saffron)" : "transparent",
                        color: "#16111e",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {isSel ? "✓" : ""}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        fontSize: 14,
                        color: "var(--cream)",
                        fontWeight: isSel ? 600 : 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.user.displayName}
                      {me?.id === m.user.id && (
                        <span
                          style={{
                            color: "var(--saffron)",
                            fontSize: 10,
                            marginLeft: 4,
                          }}
                        >
                          (moi)
                        </span>
                      )}
                    </div>
                    {isSel && splitMode !== "EQUAL" && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <input
                          value={shares[m.user.id] || ""}
                          onChange={(e) =>
                            setShare(m.user.id, e.target.value)
                          }
                          placeholder="0"
                          inputMode="decimal"
                          style={{
                            width: 64,
                            padding: "6px 8px",
                            fontSize: 13,
                            background: "rgba(0,0,0,0.3)",
                            border: "1px solid var(--line-soft)",
                            borderRadius: 6,
                            color: "var(--cream)",
                            textAlign: "right",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            width: 16,
                          }}
                        >
                          {splitMode === "UNEQUAL"
                            ? group.defaultCurrency.slice(0, 1)
                            : "%"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              {splitMode !== "EQUAL" && selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={autoFillShares}
                  className="btn-ghost btn-sm"
                >
                  ⚖ Auto · parts égales
                </button>
              )}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={savePreset}
                  className="btn-ghost btn-sm"
                >
                  {t("expense.saveAsTemplate")}
                </button>
              )}
            </div>

            {/* Mes presets existants — gérables depuis ici */}
            {presets.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    letterSpacing: 1.4,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  🔖 Mes modèles ({presets.length})
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  {presets.map((p) => (
                    <span
                      key={p.id}
                      className="chip chip-saffron"
                      style={{
                        cursor: "pointer",
                        textTransform: "none",
                        letterSpacing: 0.3,
                      }}
                      onClick={() => loadPreset(p.id)}
                      onDoubleClick={() => deletePreset(p.id)}
                      title="Clic pour charger · double-clic pour supprimer"
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div
            className={validation.ok ? "success" : "error"}
            style={{ fontSize: 12 }}
          >
            {validation.ok ? "✓ " : "⚠ "}
            {validation.msg}
          </div>

          <button
            className="btn btn-block"
            onClick={addExpense}
            disabled={!validation.ok}
          >
            {editingExpenseId ? t("expense.editTitle") : t("expense.add")}
          </button>
        </div>
      )}

      {/* === SOLDES === */}
      <div id="section-balance" />
      {balance && balance.balances.length > 0 && (
        <div className="card" data-gd-section="balance">
          <div className="card-head">
            <h2>{t("group.tab.balances")}</h2>
            <span className="muted" style={{ fontSize: 11 }}>
              {balance.currency}
            </span>
          </div>
          <div className="list">
            {balance.balances.map((b: any) => {
              const v = parseFloat(b.net);
              const isMe = me?.id === b.userId;
              return (
                <div key={b.userId} className="list-item">
                  <div
                    className="icon"
                    style={
                      isMe
                        ? {
                            background:
                              "linear-gradient(135deg,var(--saffron),var(--terracotta))",
                            color: "#16111e",
                          }
                        : undefined
                    }
                  >
                    {b.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="text">
                    <div className="name">
                      {b.displayName}
                      {isMe && (
                        <span
                          style={{
                            color: "var(--saffron)",
                            fontSize: 9,
                            marginLeft: 6,
                            letterSpacing: 1,
                          }}
                        >
                          MOI
                        </span>
                      )}
                    </div>
                    <div className="meta">
                      {v > 0
                        ? t("group.groupOwes")
                        : v < 0
                          ? t("group.owesGroup")
                          : t("group.balancedInGroup")}
                    </div>
                  </div>
                  <div
                    className={`amount ${v < 0 ? "amount-neg" : v > 0 ? "amount-pos" : ""}`}
                  >
                    {v > 0 ? "+" : ""}
                    {/* AA2 — formatAmount convertit dans la devise utilisateur */}
                    {formatAmount(
                      Math.abs(v).toString(),
                      balance.currency,
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Détection auto des dettes croisées (spec §3.6) */}
          {/* Si ≥ 3 règlements et qu'il existe un cycle (A→B et B→C par ex), */}
          {/* on suggère un swap pour réduire le nombre de transactions. */}
          {balance.suggestions.length >= 3 && !activeSwap && (() => {
            // Détection cycle : un user qui apparaît à la fois comme from et to
            const fromIds = new Set(
              balance.suggestions.map((s: any) => s.fromUserId),
            );
            const toIds = new Set(
              balance.suggestions.map((s: any) => s.toUserId),
            );
            const intermediaries = [...fromIds].filter((id) => toIds.has(id));
            if (intermediaries.length === 0) return null;
            return (
              <div
                style={{
                  background:
                    "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(181,70,46,0.06))",
                  border: "1px solid var(--saffron, #E8A33D)",
                  borderRadius: 12,
                  padding: 14,
                  marginTop: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    background: "rgba(232,163,61,0.15)",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ⬡
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.5,
                      color: "var(--saffron, #E8A33D)",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      marginBottom: 2,
                    }}
                  >
                    Optimisation possible
                  </div>
                  <div style={{ fontSize: 13, color: "var(--cream, #F4E4C1)", lineHeight: 1.4 }}>
                    {balance.suggestions.length} règlements actuels — un{" "}
                    <strong>swap de dettes</strong> peut réduire le nombre de
                    transactions à effectuer.
                  </div>
                </div>
                <button
                  onClick={proposeSwap}
                  className="btn btn-sm"
                  style={{ flexShrink: 0 }}
                >
                  ⬡ Proposer
                </button>
              </div>
            );
          })()}

          {balance.suggestions.length > 0 && (
            <>
              <div className="section-title">
                {t("group.suggestedSettlements")}
              </div>
              <div className="list">
                {balance.suggestions.map((s: any, i: number) => (
                  <div key={i} className="list-item">
                    <div className="icon">↔</div>
                    <div className="text">
                      <div className="name">
                        {s.fromName} → {s.toName}
                      </div>
                      <div className="meta">{t("group.paymentToMake")}</div>
                    </div>
                    <div className="amount">
                      {/* AA2 — Convertit dans la devise utilisateur */}
                      {formatAmount(
                        parseFloat(s.amount).toString(),
                        s.currency ?? balance.currency,
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!activeSwap && (
                <button
                  className="btn-ghost btn-block"
                  onClick={proposeSwap}
                  style={{ marginTop: 12 }}
                >
                  {t("group.proposeSwap")}
                </button>
              )}
            </>
          )}

          {activeSwap && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                background:
                  "linear-gradient(135deg,rgba(232,163,61,0.1),rgba(181,70,46,0.04))",
                border: "1.5px solid var(--saffron)",
                borderRadius: 14,
              }}
            >
              <div className="between" style={{ marginBottom: 10 }}>
                <strong
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 16,
                    color: "var(--saffron)",
                  }}
                >
                  ⇄ Swap proposé
                </strong>
                <span className="chip chip-saffron">
                  {new Date(activeSwap.expiresAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--cream-soft)",
                  marginBottom: 10,
                }}
              >
                {activeSwap.description}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                  marginBottom: 12,
                }}
              >
                {activeSwap.participants.map((p: any) => (
                  <span
                    key={p.id}
                    className={
                      p.acceptedAt
                        ? "chip chip-emerald"
                        : p.rejectedAt
                          ? "chip chip-rose"
                          : "chip chip-muted"
                    }
                  >
                    {p.acceptedAt ? "✓" : p.rejectedAt ? "✗" : "⏳"}{" "}
                    {p.displayName}
                  </span>
                ))}
              </div>
              {(() => {
                const myPart = activeSwap.participants.find(
                  (p: any) => p.userId === me?.id,
                );
                if (!myPart) return null;
                if (myPart.acceptedAt) {
                  return (
                    <div className="success" style={{ marginBottom: 0 }}>
                      ✓ Tu as accepté
                    </div>
                  );
                }
                if (myPart.rejectedAt) {
                  return (
                    <div className="error" style={{ marginBottom: 0 }}>
                      ✗ Tu as refusé
                    </div>
                  );
                }
                return (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn-ghost"
                      onClick={rejectSwap}
                      style={{ flex: 1 }}
                    >
                      ✗ Refuser
                    </button>
                    <button
                      className="btn"
                      onClick={acceptSwap}
                      style={{ flex: 2 }}
                    >
                      ✓ Accepter
                    </button>
                  </div>
                );
              })()}
              {activeSwap.proposedById === me?.id && (
                <button
                  className="btn-ghost btn-block btn-sm"
                  onClick={cancelSwap}
                  style={{ marginTop: 8 }}
                >
                  Annuler ma proposition
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* === DEBT TRANSFERS BILATÉRAUX === */}
      <DebtTransferPanel
        groupId={groupId}
        group={group}
        meId={me?.id}
        balance={balance}
        onChanged={refresh}
      />

      {/* === RÉUNIONS ENREGISTRÉES (Sprint AC-2) === */}
      {/* On affiche le panneau pour tous les membres en lecture, mais seuls
          les admins du groupe peuvent valider les décisions. */}
      <div style={{ marginTop: 16 }}>
        <MeetingsPanel
          groupId={groupId}
          isAdmin={
            !!me &&
            group.members.some(
              (m: Member) => m.user.id === me.id && m.role === "ADMIN",
            )
          }
        />
      </div>

      {/* === MEMBRES === */}
      <div id="section-members" />
      <div className="card" data-gd-section="members">
        <div className="card-head">
          <h2>{t("group.tab.members")}</h2>
          <span className="muted" style={{ fontSize: 11 }}>
            {group.members.length}
          </span>
        </div>
        <div className="list">
          {group.members.map((m: Member) => (
            <div key={m.id} className="list-item">
              <div className="icon">
                {m.user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="text">
                <div className="name">
                  {m.user.displayName}
                  {me?.id === m.user.id && (
                    <span
                      style={{
                        color: "var(--saffron)",
                        fontSize: 9,
                        marginLeft: 6,
                        letterSpacing: 1,
                      }}
                    >
                      MOI
                    </span>
                  )}
                </div>
                <div className="meta">{m.role.toLowerCase()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === STATISTIQUES (spec §3.11) === */}
      <GroupStatsBlock expenses={expenses} currency={group.defaultCurrency} />

      {/* === DÉPENSES === */}
      <div id="section-expenses" />
      <div className="card" data-gd-section="expenses">
        <div className="card-head">
          <h2>{t("group.tab.expenses")}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 11 }}>
              {filteredExpenses.length}
              {searchTerm ? ` / ${expenses.length}` : ""}
            </span>
            <button
              onClick={exportExpensesCsv}
              title="Exporter au format CSV (compatible Excel)"
              style={{
                fontSize: 11,
                padding: "6px 10px",
                minHeight: "32px",
                background: "transparent",
                border: "1px solid var(--border, #ccc)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              ⬇ CSV
            </button>
            {/* Export PDF (spec §3.11) — ouvre la page imprimable */}
            <Link
              href={`/dashboard/groups/${groupId}/print`}
              target="_blank"
              title="Vue imprimable / Enregistrer en PDF"
              style={{
                fontSize: 11,
                padding: "6px 10px",
                minHeight: 32,
                background: "transparent",
                border: "1px solid var(--border, #ccc)",
                borderRadius: 6,
                textDecoration: "none",
                color: "inherit",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              📄 PDF
            </Link>
            <button
              onClick={() => setCsvImportOpen(true)}
              title="Importer en lot depuis un CSV (spec §8.4)"
              style={{
                fontSize: 11,
                padding: "6px 10px",
                minHeight: 32,
                background: "transparent",
                border: "1px solid var(--border, #ccc)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              ⬆ Import CSV
            </button>
            <ExportButton
              filename={`depenses-${(group?.name ?? "groupe").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              rows={expenses}
              columns={[
                {
                  header: "Date",
                  get: (e: any) => new Date(e.occurredAt),
                },
                {
                  header: "Libellé",
                  get: (e: any) => e.description,
                },
                {
                  header: "Catégorie",
                  get: (e: any) => e.category ?? "",
                },
                {
                  header: "Montant",
                  get: (e: any) => parseFloat(e.amount),
                },
                {
                  header: "Devise",
                  get: (e: any) => e.currency,
                },
                {
                  header: "Payeur",
                  get: (e: any) => e.paidBy?.displayName ?? "",
                },
                {
                  header: "Mode partage",
                  get: (e: any) => e.splitMode,
                },
                {
                  header: "Nb participants",
                  get: (e: any) => e.shares?.length ?? 0,
                },
              ]}
              label="📊 Excel"
              style={{
                fontSize: 11,
                padding: "6px 10px",
                minHeight: 32,
                background: "transparent",
                border: "1px solid var(--border, #ccc)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            />
            {/* Bouton Export PDF — feature Premium (côté serveur, pdf-lib). */}
            <button
              type="button"
              onClick={async () => {
                try {
                  await api.downloadGroupPdf(groupId);
                } catch (e) {
                  if (planGate.handleApiError(e)) return;
                  toast.error(e);
                }
              }}
              style={{
                fontSize: 11,
                padding: "6px 10px",
                minHeight: 32,
                background: "transparent",
                border: "1px solid var(--border, #ccc)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              📄 PDF
            </button>
            {/* Bouton Export Excel SERVEUR (3 feuilles, formules SUM,
                formats devise/date) — différent du "📊 Excel" client qui
                n'est qu'un CSV simple. Premium-only. */}
            <button
              type="button"
              onClick={async () => {
                try {
                  await api.downloadGroupXlsx(groupId);
                } catch (e) {
                  if (planGate.handleApiError(e)) return;
                  toast.error(e);
                }
              }}
              style={{
                fontSize: 11,
                padding: "6px 10px",
                minHeight: 32,
                background: "transparent",
                border: "1px solid var(--border, #ccc)",
                borderRadius: 6,
                cursor: "pointer",
              }}
              title={t("group.csvExportHint")}
            >
              📑 Excel +
            </button>
          </div>
        </div>

        {expenses.length > 0 && (
          <input
            type="search"
            value={searchTerm}
            onChange={(ev) => setSearchTerm(ev.target.value)}
            placeholder="🔍 Filtrer par description, montant, payeur…"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid var(--border, #ccc)",
              borderRadius: 8,
              marginBottom: 12,
              boxSizing: "border-box",
            }}
          />
        )}

        {expenses.length === 0 ? (
          <p className="muted text-center" style={{ padding: "20px 0" }}>
            Aucune dépense pour l'instant
          </p>
        ) : filteredExpenses.length === 0 ? (
          <p className="muted text-center" style={{ padding: "20px 0" }}>
            Aucun résultat pour « {searchTerm} »
          </p>
        ) : (
          <div className="list">
            {filteredExpenses.map((e: any) => {
              // Règle de permission : créateur (payeur) OU admin du groupe.
              // Doit matcher exactement la règle backend dans expenses.service.
              const canEdit =
                me?.id === e.paidBy?.id ||
                group.members.some(
                  (m: Member) =>
                    m.user.id === me?.id && m.role === "ADMIN",
                );
              const isExpanded = expandedExpenseId === e.id;
              return (
                <div key={e.id}>
                  <div
                    className="list-item"
                    style={{
                      // Style visuel pour les dépenses optimistic en cours
                      // d'enregistrement — opacity 0.7 + spinner pour signaler
                      // "ça arrive" sans bloquer la lecture
                      ...(e._optimistic
                        ? {
                            opacity: 0.7,
                            animation: "bmd-optimistic-pulse 1.4s ease-in-out infinite",
                          }
                        : {}),
                    }}
                  >
                    <div
                      className="icon"
                      style={{
                        cursor: e._optimistic ? "wait" : "pointer",
                      }}
                      onClick={() =>
                        e._optimistic
                          ? null
                          : setExpandedExpenseId(isExpanded ? null : e.id)
                      }
                      role="button"
                      aria-label={
                        e._optimistic
                          ? "Enregistrement…"
                          : "Voir les détails"
                      }
                    >
                      {e._optimistic ? "⏳" : "💸"}
                    </div>
                    <div
                      className="text"
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        setExpandedExpenseId(isExpanded ? null : e.id)
                      }
                    >
                      <div className="name">
                        {e.description}{" "}
                        {/* Badge anomalies (spec §3.8) — affichage non bloquant
                            qui détecte montant inhabituel / doublon / retard. */}
                        <ExpenseAnomaliesBadge expenseId={e.id} />
                      </div>
                      <div className="meta">
                        {e.paidBy.displayName} · {e.shares.length}p ·{" "}
                        {new Date(e.occurredAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div className="amount">
                        {parseFloat(e.amount).toFixed(2)}
                      </div>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => openEditPanel(e.id)}
                            title={t("expense.editTooltip2")}
                            aria-label={t("expense.editTooltipShort")}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--saffron, #E8A33D)",
                              fontSize: 16,
                              cursor: "pointer",
                              padding: "4px 8px",
                              minHeight: "32px",
                              minWidth: "32px",
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() =>
                              setConfirmDelete({
                                expenseId: e.id,
                                description: e.description,
                              })
                            }
                            title={t("expense.deleteTooltip2")}
                            aria-label={t("expense.deleteTooltip2")}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#ef4444",
                              fontSize: 18,
                              cursor: "pointer",
                              padding: "4px 8px",
                              minHeight: "32px",
                              minWidth: "32px",
                            }}
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Expansion : items (mode ITEMIZED) + pièces jointes */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: "10px 14px 14px 60px",
                        background: "var(--overlay, rgba(255,255,255,0.03))",
                        borderRadius: "0 0 10px 10px",
                        borderTop: "1px dashed var(--line-soft, #e5e7eb)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                      }}
                    >
                      {e.splitMode === "ITEMIZED" && (
                        <ItemizedClaimsView
                          expenseId={e.id}
                          meId={me?.id}
                          currency={
                            e.currency ?? group.defaultCurrency ?? "EUR"
                          }
                        />
                      )}
                      <ExpenseAttachments
                        expenseId={e.id}
                        canManage={canEdit}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* === ACTIVITÉ === */}
      <div id="section-activity" />
      <div className="card" data-gd-section="activity">
        <div className="card-head">
          <h2>{t("group.tab.activity")}</h2>
          <button
            onClick={() => setShowActivity((v) => !v)}
            style={{
              fontSize: 11,
              padding: "6px 10px",
              minHeight: "32px",
              background: "transparent",
              border: "1px solid var(--border, #ccc)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {showActivity ? t("common.hide") : `${t("common.show")} (${activities.length})`}
          </button>
        </div>
        {showActivity &&
          (activities.length === 0 ? (
            <p className="muted text-center" style={{ padding: "20px 0" }}>
              Aucune activité enregistrée
            </p>
          ) : (
            <div className="list">
              {activities.slice(0, 30).map((a: any) => (
                <div key={a.id} className="list-item">
                  <div className="icon">{activityIcon(a.kind)}</div>
                  <div className="text">
                    <div className="name" style={{ fontSize: 14 }}>
                      {a.message}
                    </div>
                    <div className="meta" style={{ fontSize: 11 }}>
                      {a.actorName ?? "Système"} ·{" "}
                      {new Date(a.createdAt).toLocaleString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>

      {/* === MODAL CONFIRMATION SUPPRESSION === */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmDelete(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 24,
              maxWidth: 400,
              width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ marginTop: 0, color: "#111827" }}>
              Supprimer cette dépense&nbsp;?
            </h3>
            <p style={{ color: "#374151", lineHeight: 1.5 }}>
              «&nbsp;<strong>{confirmDelete.description}</strong>&nbsp;» sera
              définitivement supprimée. Les balances seront recalculées
              automatiquement.
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: "10px 16px",
                  background: "transparent",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  cursor: "pointer",
                  minHeight: 44,
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => performDeleteExpense(confirmDelete.expenseId)}
                style={{
                  padding: "10px 16px",
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  minHeight: 44,
                  fontWeight: 600,
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* (Bottom-nav fournie par <MobileShell> via <ResponsiveShell>) */}

      {/* Modal d'import CSV en lot (spec §8.4) */}
      <CsvImportModal
        open={csvImportOpen}
        groupId={groupId}
        onClose={() => setCsvImportOpen(false)}
        onImported={() => {
          void refresh();
        }}
      />

      {/* Modal de scan IA — UI fullscreen avec animation, bulle IA, lignes */}
      <ScanReceiptModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        // Sprint AB · groupId injecté pour bénéficier du plan de l'admin
        // du groupe si l'user FREE a épuisé son quota perso.
        scanFn={(file: File) => api.scanReceipt(file, groupId)}
        onConfirm={(result) => {
          // Applique les résultats au formulaire de dépense
          if (result.amount) setAmount(result.amount);
          if (result.merchant) setDescription(result.merchant);
          else if (result.category) setDescription(result.category);
          if (result.items && result.items.length > 0) {
            setDraftItems(
              result.items.map((it) => ({
                description: it.description,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                totalPrice: it.totalPrice,
              })),
            );
            setSplitMode("ITEMIZED");
          }
          setScanResult({
            merchant: result.merchant,
            confidence: result.confidence,
            itemsFound: result.items?.length ?? 0,
          });
          // S'assure que le panel "expense" est ouvert pour voir les résultats
          if (openPanel !== "expense") {
            setEditingExpenseId(null);
            setOpenPanel("expense");
          }
        }}
      />
      </div>
    </ResponsiveShell>
  );
}

/**
 * Bloc statistiques d'un groupe (spec §3.11).
 *  - Donut : répartition par catégorie (Restaurant, Courses, Transport...)
 *  - BarChart : évolution mensuelle (6 derniers mois)
 *
 * Calculs côté client à partir de la liste d'expenses déjà chargée — pas
 * de requête supplémentaire. Si le groupe a < 3 dépenses on n'affiche rien
 * (graphiques inutiles avec si peu de données).
 */
function GroupStatsBlock({
  expenses,
  currency,
}: {
  expenses: any[];
  currency: string;
}) {
  const t = useT();
  const [show, setShow] = useState(false);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) {
      const cat = e.category ?? "Autres";
      map[cat] = (map[cat] ?? 0) + parseFloat(e.amount);
    }
    return Object.entries(map)
      .map(([label, value]) => ({ label, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [expenses]);

  const monthlyData = useMemo(() => {
    // 6 derniers mois
    const map: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map[key] = 0;
    }
    for (const e of expenses) {
      const d = new Date(e.occurredAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in map) {
        map[key] += parseFloat(e.amount);
      }
    }
    const monthLabels = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    return Object.entries(map).map(([key, value]) => {
      const m = parseInt(key.split("-")[1]) - 1;
      return { label: monthLabels[m] ?? key, value: Math.round(value) };
    });
  }, [expenses]);

  if (expenses.length < 3) return null;

  const totalAmount = expenses.reduce(
    (s, e) => s + parseFloat(e.amount),
    0,
  );

  return (
    <div className="card">
      <div className="card-head">
        <h2>📊 Statistiques</h2>
        <button
          onClick={() => setShow((v) => !v)}
          className="btn-ghost btn-sm"
          style={{ padding: "6px 12px" }}
        >
          {show ? t("common.hide") : `${Math.round(totalAmount)} ${currency} ▾`}
        </button>
      </div>
      {show && (
        <>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              color: "var(--gold, #C9A24A)",
              textTransform: "uppercase",
              fontWeight: 700,
              margin: "8px 0",
            }}
          >
            Évolution sur 6 mois
          </div>
          <BarChart
            data={monthlyData}
            height={160}
            valueFormat={(n) => n.toFixed(0)}
            unit={currency}
          />

          {categoryData.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1.5,
                  color: "var(--gold, #C9A24A)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  margin: "20px 0 8px",
                }}
              >
                Top catégories
              </div>
              <DonutChart data={categoryData} unit={currency} size={170} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Petits composants skeleton (chargement) — affichés instantanément
 * pendant que les requêtes initiales se chargent. Évite la sensation de
 * "page vide qui mouline" sur la première navigation.
 */
function SkelLine({
  width = "100%",
  height = 16,
}: {
  width?: number | string;
  height?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
        backgroundSize: "200% 100%",
        animation: "bmd-skel 1.4s ease-in-out infinite",
        borderRadius: 6,
        marginBottom: 8,
      }}
    />
  );
}
function SkelBox({ height = 80 }: { height?: number }) {
  return (
    <>
      <div
        style={{
          width: "100%",
          height,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
          backgroundSize: "200% 100%",
          animation: "bmd-skel 1.4s ease-in-out infinite",
          borderRadius: 14,
          marginBottom: 6,
        }}
      />
      <style jsx global>{`
        @keyframes bmd-skel {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  );
}

/**
 * Hero balance affichée en TÊTE de la vue groupe (UX banque mobile).
 *
 * Première chose visible à l'ouverture du groupe : combien on doit
 * personnellement / combien on me doit, dans la devise du groupe.
 * Inspiré des écrans de coffre des néobanques (Lydia / Wave / Wise) :
 * gros chiffre en Cormorant, halo radial saffron, indicateur ↗/↘.
 *
 * Si la balance n'est pas encore chargée, on affiche un placeholder
 * pour réserver la place et éviter le saut visuel.
 */
function GroupHeroBalance({
  group,
  balance,
  meId,
}: {
  group: any;
  balance: any;
  meId?: string;
}): JSX.Element {
  const t = useT();
  // Mon solde net dans ce groupe (positif = on me doit, négatif = je dois)
  const myEntry = meId
    ? (balance?.balances ?? []).find((b: any) => b.userId === meId)
    : null;
  const myNet = myEntry ? parseFloat(myEntry.net) : 0;
  const currency = group?.defaultCurrency ?? "EUR";

  // Total dépensé du groupe (somme des expenses)
  const totalGroupSpent = parseFloat(group?.totalSpent ?? "0");

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #2A2244 0%, #3A2A52 100%)",
        borderRadius: 22,
        padding: 22,
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(232,163,61,0.18)",
        marginBottom: 16,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -50,
          top: -50,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(232,163,61,0.22), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          fontSize: 11,
          color: "var(--cream-soft, #d4c4a8)",
          letterSpacing: 1.6,
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {t("group.myBalance")}
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 42,
            fontWeight: 600,
            color:
              myNet > 0
                ? "#7DC59E"
                : myNet < 0
                  ? "#D9714A"
                  : "var(--cream)",
            lineHeight: 1,
          }}
        >
          {myNet > 0 ? "+" : myNet < 0 ? "−" : ""}
          {Math.abs(myNet).toLocaleString("fr-FR", {
            minimumFractionDigits: ["XAF", "XOF"].includes(currency) ? 0 : 2,
            maximumFractionDigits: ["XAF", "XOF"].includes(currency) ? 0 : 2,
          })}
        </div>
        <div
          style={{
            fontSize: 18,
            color: "var(--saffron, #e8a33d)",
            fontWeight: 600,
          }}
        >
          {currency}
        </div>
      </div>
      <div
        style={{
          position: "relative",
          fontSize: 12,
          color: "var(--cream-soft, #d4c4a8)",
          lineHeight: 1.5,
        }}
      >
        {myNet > 0 && (
          <>
            {t("group.groupOwesYou")}
          </>
        )}
        {myNet < 0 && (
          <>
            {t("group.youOweTheGroup")}
          </>
        )}
        {myNet === 0 && (
          <>Tout est à zéro · {totalGroupSpent.toLocaleString("fr-FR")} {currency} dépensés au total.</>
        )}
      </div>
    </div>
  );
}

/**
 * Barre de chips sticky (mobile) pour naviguer rapidement entre les
 * sections d'un groupe sans avoir à scroller la page entière.
 *
 * Utilise des liens d'ancre (#section-XXX) avec smooth-scroll natif :
 * pas de JS, donc compatible SSR et accessible (un click = un focus).
 *
 * Sur desktop (≥ 769px), la barre est masquée par CSS car le layout
 * multi-colonne rend la navigation par chip inutile.
 */
function SectionNav({
  sections,
}: {
  sections: Array<{ id: string; label: string; icon: string }>;
}): JSX.Element {
  return (
    <nav
      aria-label="Sections du groupe"
      className="gd-section-nav"
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        padding: "8px 0",
        marginBottom: 14,
        position: "sticky",
        top: 56, // sous le header MobileShell (56px de haut)
        zIndex: 30,
        background:
          "linear-gradient(180deg, rgba(14,11,20,0.95), rgba(14,11,20,0.75))",
        backdropFilter: "blur(8px)",
        scrollbarWidth: "none",
      }}
    >
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          style={{
            flexShrink: 0,
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.1)",
            color: "var(--cream-soft, #d4c4a8)",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <span aria-hidden>{s.icon}</span>
          {s.label}
        </a>
      ))}
      <style jsx>{`
        nav.gd-section-nav::-webkit-scrollbar {
          display: none;
        }
        @media (min-width: 769px) {
          nav.gd-section-nav {
            display: none !important;
          }
        }
        html {
          scroll-behavior: smooth;
        }
        /* Offset pour que l'ancre ne soit pas masquée sous la nav sticky */
        [id^="section-"] {
          scroll-margin-top: 110px;
        }
      `}</style>
    </nav>
  );
}
