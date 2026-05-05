"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { ExpenseAttachments } from "../../../../lib/ui/expense-attachments";
import { DebtTransferPanel } from "../../../../lib/ui/debt-transfer-panel";
import {
  ItemizedClaimsView,
  ItemizedEditor,
} from "../../../../lib/ui/itemized-expense";
import { BottomNav } from "../../../../lib/ui/bottom-nav";
import { ScanReceiptModal } from "../../../../lib/ui/scan-receipt-modal";
import { validateContact } from "../../../../lib/validators";

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

  const [group, setGroup] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSwap, setActiveSwap] = useState<any>(null);

  // Activity feed (M11-like)
  const [activities, setActivities] = useState<any[]>([]);
  const [showActivity, setShowActivity] = useState(false);

  // Search / filter sur la liste de dépenses
  const [searchTerm, setSearchTerm] = useState("");

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
   * Auto-refresh polling : recharge toutes les 15s tant que l'onglet est
   * visible. Si l'utilisateur passe sur un autre onglet on suspend pour
   * économiser les requêtes (et la batterie sur mobile).
   */
  const pollingRef = useRef<number | null>(null);
  useEffect(() => {
    if (!groupId) return;
    function start() {
      if (pollingRef.current != null) return;
      pollingRef.current = window.setInterval(
        () => void refresh(true),
        15_000,
      );
    }
    function stop() {
      if (pollingRef.current != null) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Init form expense (mode create OU edit)
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
  }, [openPanel, group, me, editingExpenseId, expenses]);

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
    if (!description.trim()) return { ok: false, msg: "Description requise" };
    if (!amt || amt <= 0) return { ok: false, msg: "Montant > 0 requis" };
    if (selectedIds.length === 0)
      return { ok: false, msg: "Au moins 1 participant" };
    if (!paidByUserId) return { ok: false, msg: "Choisis qui a payé" };

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
          msg: "Aucun article — les membres pourront en ajouter ensuite",
        };
      }
      const sum = draftItems.reduce(
        (s, it) => s + parseFloat(it.totalPrice || "0"),
        0,
      );
      if (Math.abs(sum - amt) > 0.02) {
        return {
          ok: false,
          msg: `Articles ${sum.toFixed(2)} ≠ total ${amt.toFixed(2)}`,
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
  ]);

  // ============ FILTRE / EXPORT CSV / DELETE ============

  /** Filtre simple sur description et montant (insensible à la casse). */
  const filteredExpenses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return expenses;
    return expenses.filter((e: any) => {
      const desc = (e.description ?? "").toLowerCase();
      const payer = (e.paidBy?.displayName ?? "").toLowerCase();
      const amt = String(e.amount ?? "");
      return desc.includes(q) || payer.includes(q) || amt.includes(q);
    });
  }, [expenses, searchTerm]);

  /**
   * Export CSV : description, montant, devise, payeur, date, mode, parts.
   * Utilise un Blob + ObjectURL pour le download, fonctionne offline.
   */
  function exportExpensesCsv() {
    if (!group || expenses.length === 0) {
      toast.warning("Aucune dépense à exporter");
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
    toast.success(`${rows.length} dépenses exportées`);
  }

  async function performDeleteExpense(expenseId: string) {
    try {
      await api.deleteExpense(expenseId);
      toast.success("Dépense supprimée");
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
      setError("Sélectionne d'abord les participants");
      return;
    }
    const name = window.prompt(
      "Nom du modèle ? (ex: 'Couple seul', 'Comité salle', 'Famille 60% / amis 40%')",
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
    if (!window.confirm("Supprimer ce modèle de partage ?")) return;
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
    try {
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
      let expenseId: string;
      if (editingExpenseId) {
        // === MODE EDITION ===
        await api.updateExpense(editingExpenseId, payload);
        expenseId = editingExpenseId;
        toast.success(`Dépense « ${description} » mise à jour`);
      } else {
        const created = await api.createExpense(groupId, payload);
        expenseId = created.id;
        toast.success(`Dépense « ${description} » enregistrée`);
      }
      // Si on est en mode ITEMIZED, on attache les items à la dépense.
      // Ils sont stockés séparément des shares (qui restent en mode equal
      // initial) et serviront à calculer la vraie répartition via les claims.
      if (splitMode === "ITEMIZED" && draftItems.length > 0) {
        try {
          await api.setExpenseItems(
            expenseId,
            draftItems.filter(
              (it) =>
                it.description.trim() &&
                parseFloat(it.totalPrice || "0") > 0,
            ),
          );
        } catch (itErr) {
          // On a déjà créé la dépense ; on signale juste l'échec items
          toast.error(
            `Dépense créée mais articles non sauvegardés : ${(itErr as Error).message}`,
          );
        }
      }
      setOpenPanel("none");
      setEditingExpenseId(null);
      setDescription("");
      setAmount("");
      setShares({});
      setScanResult(null);
      setDraftItems([]);
      void refresh();
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      toast.error(e);
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
      const result = await api.scanReceipt(file);
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
      setError((e as Error).message);
    }
  }
  async function acceptSwap() {
    setError(null);
    try {
      await api.acceptSwap(activeSwap.id);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function rejectSwap() {
    setError(null);
    try {
      await api.rejectSwap(activeSwap.id);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function cancelSwap() {
    if (!window.confirm("Annuler la proposition de swap ?")) return;
    try {
      await api.cancelSwap(activeSwap.id);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!group) {
    return (
      <div className="container">
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  const groupIcon = GROUP_TYPE_ICONS[group.type] ?? "📁";

  return (
    <div className="container">
      {/* Top bar : retour + brand */}
      <div className="between" style={{ marginBottom: 14 }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "var(--cream-soft)",
          }}
        >
          ← Mes groupes
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotificationBell />
          <Link
            href="/"
            aria-label="Retour à l'accueil"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/bmd-logo.svg"
              alt=""
              width={28}
              height={28}
              style={{ flexShrink: 0 }}
            />
            <span
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 18,
                color: "var(--cream)",
                fontWeight: 700,
              }}
            >
              BMD<span style={{ color: "var(--saffron)" }}>·</span>
            </span>
          </Link>
        </div>
      </div>

      {/* Page header */}
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
          aria-label="Paramètres du groupe"
          title="Paramètres du groupe"
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

      {error && <div className="error">{error}</div>}

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
            <h2>👤 Inviter des membres</h2>
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
            🛡️ <strong>Vie privée :</strong> les contacts sélectionnés sont
            utilisés <em>uniquement</em> pour générer leur invitation. Tant
            qu'ils ne s'inscrivent pas, leurs données ne sont pas conservées
            au-delà de cette demande.{" "}
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
              {editingExpenseId ? "✏️ Modifier la dépense" : "＋ Nouvelle dépense"}
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
            📷 Scanner ticket ou PDF · IA
          </button>

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
            <label>Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resto, courses, hôtel…"
            />
          </div>

          <div className="field">
            <label>Montant ({group.defaultCurrency})</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="60.00"
              inputMode="decimal"
            />
          </div>

          <div className="field">
            <label>Qui a payé ?</label>
            <select
              value={paidByUserId}
              onChange={(e) => setPaidByUserId(e.target.value)}
            >
              {group.members.map((m: Member) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.displayName}
                  {me?.id === m.user.id ? " (moi)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Mode de partage</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 6,
              }}
            >
              {[
                { v: "EQUAL", lbl: "🟰 Égal" },
                { v: "UNEQUAL", lbl: "✏️ Parts" },
                { v: "PERCENTAGE", lbl: "% Pourc." },
                { v: "ITEMIZED", lbl: "🧾 Articles" },
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
                  · les membres réclameront ce qu'ils ont consommé après création
                </span>
              </label>
              <ItemizedEditor
                items={draftItems}
                onChange={setDraftItems}
                totalAmount={amount || "0"}
                currency={group.defaultCurrency}
              />
            </div>
          )}

          <div className="field">
            <label>
              Participants ({selectedIds.length}/{group.members.length})
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
                  💾 Sauver comme modèle
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
            {editingExpenseId ? "✓ Enregistrer les modifications" : "✓ Ajouter"}
          </button>
        </div>
      )}

      {/* === SOLDES === */}
      {balance && balance.balances.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>⚖ Soldes</h2>
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
                        ? "On lui doit"
                        : v < 0
                          ? "Doit au groupe"
                          : "À l'équilibre"}
                    </div>
                  </div>
                  <div
                    className={`amount ${v < 0 ? "amount-neg" : v > 0 ? "amount-pos" : ""}`}
                  >
                    {v > 0 ? "+" : ""}
                    {v.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>

          {balance.suggestions.length > 0 && (
            <>
              <div className="section-title">↔ Règlements suggérés</div>
              <div className="list">
                {balance.suggestions.map((s: any, i: number) => (
                  <div key={i} className="list-item">
                    <div className="icon">↔</div>
                    <div className="text">
                      <div className="name">
                        {s.fromName} → {s.toName}
                      </div>
                      <div className="meta">Paiement à effectuer</div>
                    </div>
                    <div className="amount">
                      {parseFloat(s.amount).toFixed(2)}
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
                  ⇄ Proposer un swap officiel
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

      {/* === MEMBRES === */}
      <div className="card">
        <div className="card-head">
          <h2>👥 Membres</h2>
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

      {/* === DÉPENSES === */}
      <div className="card">
        <div className="card-head">
          <h2>🧾 Dépenses</h2>
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
                  <div className="list-item">
                    <div
                      className="icon"
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        setExpandedExpenseId(isExpanded ? null : e.id)
                      }
                      role="button"
                      aria-label="Voir les détails"
                    >
                      💸
                    </div>
                    <div
                      className="text"
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        setExpandedExpenseId(isExpanded ? null : e.id)
                      }
                    >
                      <div className="name">{e.description}</div>
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
                            title="Modifier cette dépense"
                            aria-label="Modifier la dépense"
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
                            title="Supprimer cette dépense"
                            aria-label="Supprimer la dépense"
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
      <div className="card">
        <div className="card-head">
          <h2>📰 Activité</h2>
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
            {showActivity ? "Masquer" : `Voir (${activities.length})`}
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

      {/* Bottom-nav mobile (visible uniquement < 768px) */}
      <BottomNav
        active="groups"
        onCreate={() => {
          setEditingExpenseId(null);
          setOpenPanel("expense");
        }}
      />

      {/* Modal de scan IA — UI fullscreen avec animation, bulle IA, lignes */}
      <ScanReceiptModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        scanFn={api.scanReceipt}
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
  );
}
