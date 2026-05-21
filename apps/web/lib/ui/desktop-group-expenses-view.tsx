"use client";

/**
 * V211.B — Vue Dépenses dédiée desktop.
 * =============================================================================
 * V222.F — Layout 3 colonnes + 2 onglets :
 *   ┌──────────────┬──────────────────────────────────────────┐
 *   │              │  [Onglet 1: Dépenses] [Onglet 2: Qui doit quoi]
 *   │  PANNEAU     │                                            │
 *   │  GAUCHE      │  ─ Onglet 1 ─ split 60/40 liste + détail   │
 *   │  Solde toi   │  ─ Onglet 2 ─ split 1/1 constellation +    │
 *   │  À encaisser │           plan optimal règlement           │
 *   │  À payer     │                                            │
 *   └──────────────┴──────────────────────────────────────────┘
 *
 * Le panneau gauche (`GroupDebtSidebar`, 280px) reste visible sur les deux
 * onglets. La zone droite change selon `expensesTab` (state local, defaut
 * "expenses").
 *
 * V211.B original : split 60/40 liste filtrable / détail.
 * V222.F nouveau : ajout balances (calculées via group-balances.ts) +
 * settlements optimaux (algo min-settlements). Composants
 * DebtConstellationView + OptimalSettlementPlan + GroupDebtSidebar.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { DesktopGroupSectionShell } from "./group-desktop-shell";
import { useDialog } from "./dialog-provider";
import { useToast } from "./toast";
import { SegmentedControl } from "./segmented-control";
import { computeMinSettlements } from "../min-settlements";
import {
  computeNetBalances,
  balancesMapToRecord,
  type BalanceExpense,
  type BalanceSettlement,
} from "../group-balances";
import { DebtConstellationView } from "./debt-constellation-view";
import { OptimalSettlementPlan } from "./optimal-settlement-plan";
import { GroupDebtSidebar } from "./group-debt-sidebar";
// V226 — Lightbox réutilisable pour ouvrir l'attachment au clic depuis la
// liste (sans passer par le détail de la dépense). On réutilise le viewer
// V80.3 qui sait afficher images/PDF/audio + faire le download authentifié.
import {
  MobileAttachmentViewer,
  type ViewerAttachment,
} from "./mobile-attachment-viewer";

type Group = {
  id: string;
  name: string;
  defaultCurrency: string;
  members: Array<{
    id: string;
    userId?: string;
    user?: { id: string; displayName: string; photoUrl?: string | null };
  }>;
};

type Expense = {
  id: string;
  description: string;
  amount: string | number;
  currency: string;
  // V216.A — Le backend retourne `occurredAt` (Prisma) pas `date`. On lit
  // les deux pour rétro-compatibilité avec un éventuel mapping client.
  occurredAt?: string;
  createdAt?: string;
  date?: string;
  category?: string;
  /**
   * V239.A — Mode de partage : EQUAL / UNEQUAL / PERCENTAGE / ITEMIZED.
   * Utilisé pour afficher la section "Articles partagés" quand ITEMIZED.
   */
  splitMode?: string;
  /// V216.A — Backend renvoie `paidBy` (relation Prisma), pas `paidByUser`.
  paidBy?: { id: string; displayName: string };
  paidByUser?: { id: string; displayName: string };
  location?: string;
  /**
   * V220.C — Le backend persiste `amountOwed` (cf. expenses.service.ts:354 où
   * Prisma.Decimal(s.amountOwed)). Avant V220.C on lisait `s.amount` qui était
   * undefined → toutes les parts s'affichaient à 0. On lit les deux noms par
   * rétrocompatibilité, mais le vrai champ est `amountOwed`.
   */
  shares?: Array<{
    userId: string;
    amountOwed?: string | number;
    amount?: string | number;
    user?: { id: string; displayName: string };
  }>;
  /**
   * V226 — Mini-liste des attachments (max 6 premiers) renvoyée par le
   * backend dans listExpensesForGroup. Permet d'afficher un badge cliquable
   * `📎 N` dans la liste, et d'ouvrir la lightbox au clic sans aller dans
   * le détail. Si la dépense a plus d'attachments, l'utilisateur peut
   * aller dans le détail pour voir le reste.
   */
  attachments?: Array<{
    id: string;
    kind: string;
    mimeType?: string;
    fileName?: string;
  }>;
};

// V220.C — Helper unifié pour extraire le montant d'une part quel que soit
// le nom de champ utilisé par l'API.
function shareAmount(s: NonNullable<Expense["shares"]>[number]): number {
  const raw = s.amountOwed ?? s.amount ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// V216.A — Helper unifié pour extraire la date d'une dépense quel que soit
// le nom de champ utilisé par l'API (occurredAt prioritaire).
function expenseDate(e: Expense): Date | null {
  const raw = e.occurredAt ?? e.date ?? e.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatExpenseDate(e: Expense): string {
  const d = expenseDate(e);
  return d
    ? d.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}
function expensePaidByName(e: Expense): string {
  return e.paidBy?.displayName ?? e.paidByUser?.displayName ?? "—";
}

const CATEGORIES = [
  { key: "all", label: "Tout", icon: "" },
  { key: "FOOD", label: "🍽 Resto", icon: "" },
  { key: "TRANSPORT", label: "🚗 Transp.", icon: "" },
  { key: "ACCOMMODATION", label: "🏨 Hébergt", icon: "" },
  { key: "ENTERTAINMENT", label: "🎟 Loisirs", icon: "" },
  { key: "SHOPPING", label: "🛒 Courses", icon: "" },
  { key: "OTHER", label: "📦 Autre", icon: "" },
];

export function DesktopGroupExpensesView({
  group,
  expenses,
  meId,
  settlements = [],
  balanceSnapshot,
  onChange,
  initialSelectedId,
}: {
  group: Group;
  expenses: Expense[];
  meId?: string;
  /**
   * V222.F — Liste des règlements confirmés du groupe (passée par la page
   * parent). Utilisée pour calculer les balances P2P nettes. Optionnel pour
   * rester rétrocompatible : si non fournie, traité comme tableau vide.
   */
  settlements?: BalanceSettlement[];
  /**
   * V222.F — Snapshot backend depuis `api.getBalance(groupId)`. Quand fourni,
   * c'est la SOURCE DE VÉRITÉ : balances nettes (après tous les Settlement
   * confirmés côté serveur) + transferts optimaux déjà calculés par le
   * backend (algo greedy serveur, identique à computeMinSettlements client).
   * Quand absent, le composant fait le calcul localement à partir de
   * expenses + settlements.
   */
  balanceSnapshot?: {
    balances: Array<{ userId: string; net: string }>;
    suggestions: Array<{ fromUserId: string; toUserId: string; amount: string }>;
  } | null;
  /**
   * V220.D — Callback déclenché après une suppression réussie pour que la
   * page parent refetch la liste. Optionnel pour rester rétrocompatible.
   */
  onChange?: () => void;
  /**
   * V245.B — Quand la page parent reçoit `?expense=<id>` dans l'URL
   * (typiquement après un clic sur "Voir la dépense" depuis le banner
   * anti-doublon), on présélectionne cette dépense au mount + on scrolle
   * jusqu'à elle dans la liste. Sans ça l'utilisateur arrive sur la
   * première dépense de la liste, pas sur celle qu'il cherchait.
   */
  initialSelectedId?: string | null;
}) {
  const router = useRouter();
  const t = useT();
  const { formatAmount } = useCurrency();
  const dialog = useDialog();
  const toast = useToast();

  const [filter, setFilter] = useState<string>("all");
  const [deleting, setDeleting] = useState(false);
  // V245.B — Si `initialSelectedId` est fourni (cas redirection depuis le
  // banner anti-doublon avec `?expense=<id>`), on présélectionne cette
  // dépense au mount. Sinon on retombe sur la première de la liste.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (
      initialSelectedId &&
      expenses.some((e) => e.id === initialSelectedId)
    ) {
      return initialSelectedId;
    }
    return expenses.length > 0 ? expenses[0].id : null;
  });

  // V245.B — Si la prop `initialSelectedId` change après le mount (ex. user
  // clique sur un autre banner anti-doublon dans la même session), on se
  // resync. Guard `expenses.some()` pour ne pas écraser la sélection si
  // l'ID n'existe pas (encore) côté client.
  useEffect(() => {
    if (
      initialSelectedId &&
      expenses.some((e) => e.id === initialSelectedId)
    ) {
      setSelectedId(initialSelectedId);
    }
  }, [initialSelectedId, expenses]);

  // V226 — Index de l'attachment ouvert dans la lightbox + liste correspondante.
  // Permet la navigation gauche/droite si une dépense a plusieurs attachments.
  // Tuple [expenseAttachments, currentIndex]. null = lightbox fermée.
  const [lightbox, setLightbox] = useState<null | {
    attachments: NonNullable<Expense["attachments"]>;
    index: number;
  }>(null);

  // V222.F — Onglet courant (Dépenses vs Qui doit quoi)
  const [expensesTab, setExpensesTab] = useState<"expenses" | "debts">(
    "expenses",
  );

  // V226 — Navigation clavier dans la lightbox (← / → pour naviguer entre les
  // attachments d'une dépense, Esc pour fermer est déjà géré par le viewer).
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (!lightbox) return;
      if (e.key === "ArrowLeft" && lightbox.index > 0) {
        setLightbox({ ...lightbox, index: lightbox.index - 1 });
      } else if (
        e.key === "ArrowRight" &&
        lightbox.index < lightbox.attachments.length - 1
      ) {
        setLightbox({ ...lightbox, index: lightbox.index + 1 });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  // V226 — Convertit l'attachment courant pour MobileAttachmentViewer.
  const currentViewerAttachment: ViewerAttachment | null = useMemo(() => {
    if (!lightbox) return null;
    const a = lightbox.attachments[lightbox.index];
    if (!a) return null;
    return {
      id: a.id,
      fileName: a.fileName ?? "attachment",
      mimeType: a.mimeType ?? "application/octet-stream",
      kind: (a.kind as ViewerAttachment["kind"]) ?? "RECEIPT",
    };
  }, [lightbox]);

  // V222.F — Liste plate des membres (id + displayName + photoUrl) déduits
  // de group.members. Utilisée par les composants debt/constellation.
  const flatMembers = useMemo(
    () =>
      (group.members ?? [])
        .map((m) => {
          const id = m.user?.id ?? m.userId ?? m.id;
          const displayName = m.user?.displayName ?? "—";
          const photoUrl = m.user?.photoUrl ?? null;
          return id ? { id, displayName, photoUrl } : null;
        })
        .filter((x): x is { id: string; displayName: string; photoUrl: string | null } => x != null),
    [group.members],
  );

  // V222.F — Calcule balances + transferts optimaux.
  // Priorité 1 : snapshot backend (source de vérité, agrège tous les
  // règlements confirmés côté serveur). Priorité 2 : calcul client local.
  const { balances, transfers, grossDebtCount } = useMemo(() => {
    if (balanceSnapshot) {
      const net = new Map<string, number>();
      for (const b of balanceSnapshot.balances) {
        const n = Number(b.net);
        net.set(b.userId, Number.isFinite(n) ? n : 0);
      }
      // S'assure que tous les membres ont une entrée (sinon DebtConstellationView
      // les masquera, ce qui est OK pour les soldes nuls).
      for (const m of flatMembers) if (!net.has(m.id)) net.set(m.id, 0);

      const minTx = balanceSnapshot.suggestions.map((s) => ({
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: Number(s.amount),
      }));
      // Approxime grossDebtCount à partir des expenses bruts pour l'affichage
      // du ratio "N optimaux vs M bruts" (même si le backend a déjà compensé).
      const balanceExpenses = expenses as unknown as BalanceExpense[];
      const { grossDebtCount } = computeNetBalances(
        balanceExpenses,
        [],
        flatMembers.map((m) => ({ id: m.id })),
      );
      return { balances: net, transfers: minTx, grossDebtCount };
    }
    // Fallback : tout calculer côté client
    const balanceExpenses = expenses as unknown as BalanceExpense[];
    const { balances: net, grossDebtCount } = computeNetBalances(
      balanceExpenses,
      settlements,
      flatMembers.map((m) => ({ id: m.id })),
    );
    const minTx = computeMinSettlements(balancesMapToRecord(net));
    return { balances: net, transfers: minTx, grossDebtCount };
  }, [balanceSnapshot, expenses, settlements, flatMembers]);

  // V220.B — Compte le nombre de dépenses par catégorie (toutes catégories
  // affichent leur compteur dans le pill du filtre). On utilise `expenses`
  // brut (avant filter) — sinon "Tout" affiche toujours le total filtré.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    counts.set("all", expenses.length);
    for (const e of expenses) {
      const k = (e.category || "OTHER").toUpperCase();
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  }, [expenses]);

  // V245.C — Tri par date décroissante (plus récent en premier). On utilise
  // `occurredAt` (date réelle de la dépense) puis fallback sur `createdAt`
  // via le helper `expenseDate()`. Tie-breaker stable sur `id` lex desc
  // pour éviter les sauts visuels au moment des invalidations de cache.
  const filtered = useMemo(() => {
    const base =
      filter === "all"
        ? expenses
        : expenses.filter((e) => (e.category || "OTHER") === filter);
    return [...base].sort((a, b) => {
      const da = expenseDate(a)?.getTime() ?? 0;
      const db = expenseDate(b)?.getTime() ?? 0;
      if (db !== da) return db - da;
      // Tie-breaker stable : id lex desc (cuid/ulid ≈ ordre chronologique)
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });
  }, [expenses, filter]);

  const selected = useMemo(
    () => filtered.find((e) => e.id === selectedId) || filtered[0] || null,
    [filtered, selectedId],
  );

  const total = useMemo(
    () => filtered.reduce((s, e) => s + Number(e.amount || 0), 0),
    [filtered],
  );

  return (
    <DesktopGroupSectionShell
      groupId={group.id}
      groupName={group.name}
      sectionLabel={t("group.hub.expenses") || "Dépenses"}
      subtitle={`${filtered.length} ${t("group.hub.entries") || "entrées"} · ${formatAmount(total, group.defaultCurrency)}`}
      noPadding
      primaryAction={
        <button
          type="button"
          // V220.E — Déjà sur /expenses (action=add-expense géré localement).
          onClick={() =>
            router.push(
              `/dashboard/groups/${group.id}/expenses?action=add-expense`,
            )
          }
          style={{
            padding: "8px 14px",
            background: "#C58A2E",
            color: "#2B1F15",
            border: "none",
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ⊕ {t("group.hub.addExpense") || "Ajouter"}
        </button>
      }
    >
      {/* V222.F — Layout global 3 colonnes : sidebar (280px) + zone droite.
          La zone droite contient onglets + contenu de l'onglet actif. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px minmax(0, 1fr)",
          minHeight: 480,
          gap: 0,
        }}
      >
        {/* V222.F — Panneau gauche (toujours visible) */}
        <GroupDebtSidebar
          groupId={group.id}
          groupName={group.name}
          meId={meId ?? ""}
          members={flatMembers}
          balances={balances}
          transfers={transfers}
          currency={group.defaultCurrency}
          formatAmount={formatAmount}
          onChange={onChange}
          yourBalanceLabel={t("group.debts.sidebarYourBalance") || "Ton solde · ce groupe"}
          toCollectLabel={t("group.debts.sidebarToCollect") || "À encaisser"}
          toPayLabel={t("group.debts.sidebarToPay") || "À payer"}
          remindLabel={t("group.debts.sidebarRemind", { count: String(transfers.filter((x) => x.toUserId === meId).length) }) || "Relancer"}
          // V225.B — On passe la STRING BRUTE i18n (sans vars) au composant
          // enfant, qui fait l'interpolation single-brace `{x}` avec les
          // vraies valeurs au moment du rendu. Plus de wrap `{x: "{{x}}"}`
          // (qui produisait des accolades visibles via le t() BMD).
          remindTemplate={
            t("group.debts.sidebarRemind") || "Relancer {count} personnes"
          }
          swapTitleLabel={t("group.debts.swapPossibleTitle") || "Swap possible"}
          swapBodyTemplate={
            t("group.debts.swapPossibleBody") ||
            "{them} te doit {amount}. Tu dois {amount2} à {otherPerson}."
          }
          swapCtaLabel={t("group.debts.swapCta") || "Compenser ↗"}
          zeroStateLabel={t("group.debts.empty") || "Tout est réglé ✓"}
          oweYouCountLabel={
            t("group.debts.oweYouCount") || "{n} personnes te doivent"
          }
          youOweCountLabel={
            t("group.debts.youOweCount") || "Tu dois à {n} personnes"
          }
        />

        {/* V222.F — Zone droite : onglets + contenu */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "12px 18px 0", borderBottom: "0.5px solid #D9C8A6" }}>
            <SegmentedControl<"expenses" | "debts">
              value={expensesTab}
              onChange={setExpensesTab}
              fullWidth={false}
              size="sm"
              ariaLabel={t("group.expensesTab.expenses") || "Dépenses"}
              segments={[
                {
                  value: "expenses",
                  label: `${t("group.expensesTab.expenses") || "Dépenses"} · ${expenses.length}`,
                },
                {
                  value: "debts",
                  label: `${t("group.expensesTab.debts") || "Qui doit quoi"} · ${transfers.length}`,
                },
              ]}
            />
          </div>

          {expensesTab === "debts" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: 14,
                padding: 18,
              }}
            >
              <DebtConstellationView
                members={flatMembers}
                balances={balances}
                settlements={transfers}
                currency={group.defaultCurrency}
                formatAmount={formatAmount}
                emptyLabel={t("group.debts.empty") || "Tout est réglé ✓"}
                centerLabel={t("group.debts.constellationCenter") || "Solde groupe"}
                showAllLabel={t("group.debts.constellationShowAll") || "Voir tout"}
                collapseLabel={t("group.debts.constellationCollapse") || "Réduire"}
                legendOwesLabel={t("group.debts.legendOwes") || "→ doit"}
                legendOwedLabel={t("group.debts.legendOwed") || "← est dû"}
                // V225.A — Callbacks d'interpolation : on appelle `t()` ici avec
                // les vraies valeurs. Le i18n string utilise `{to}` `{amount}`
                // (single-brace, cohérent avec le t() BMD).
                formatOwesText={(toName, amount) =>
                  t("group.debts.tooltipOwes", { to: toName, amount }) ||
                  `Doit à ${toName} : ${amount}`
                }
                formatOwedText={(fromName, amount) =>
                  t("group.debts.tooltipOwed", { from: fromName, amount }) ||
                  `Reçoit de ${fromName} : ${amount}`
                }
              />
              <OptimalSettlementPlan
                groupId={group.id}
                transfers={transfers}
                grossCount={grossDebtCount}
                currency={group.defaultCurrency}
                members={flatMembers}
                meId={meId}
                formatAmount={formatAmount}
                onChange={onChange}
                titleLabel={t("group.debts.planTitle") || "Plan optimal de règlement"}
                // V225.B — single-brace, on passe la string raw, l'enfant interpole.
                subtitleTemplate={
                  t("group.debts.planSubtitle") ||
                  "{n} paiements au lieu de {m} bruts"
                }
                savingsHintTemplate={
                  t("group.debts.savingsHint") ||
                  "{n} transferts évités grâce aux swaps."
                }
                markPaidLabel={t("group.debts.markPaid") || "Marquer payé"}
                proposeSwapLabel={t("group.debts.proposeSwap") || "Proposer un swap"}
                proposeSwapToastSoon={
                  t("group.debts.proposeSwapSoon") || "Swap manuel disponible bientôt"
                }
                emptyLabel={t("group.debts.empty") || "Tout est réglé ✓"}
                // V223.C — Confirm sheet pour Marquer payé
                confirmTitleLabel={t("group.debts.confirmPaymentTitle") || "Confirmer le règlement"}
                // V225.B — Callback d'interpolation : appelé au moment où la
                // modale s'ouvre, avec les vraies valeurs. Plus aucune
                // accolade visible : le t() BMD utilise `{x}` single-brace.
                formatConfirmBody={({ to, from, amount }) =>
                  t("group.debts.confirmPaymentBody", { to, from, amount }) ||
                  `Tu confirmes que **${to}** a reçu **${amount}** de **${from}** pour solder leurs dépenses partagées.`
                }
                confirmDateLabel={t("group.debts.confirmPaymentDate") || "Date du paiement"}
                confirmMethodLabel={t("group.debts.confirmPaymentMethod") || "Méthode"}
                confirmNoteLabel={
                  t("group.debts.confirmPaymentNote") ||
                  "Référence ou commentaire (optionnel)"
                }
                confirmSubmitLabel={
                  t("group.debts.confirmPaymentSubmit") || "Confirmer le paiement"
                }
                cancelLabel={t("common.cancel") || "Annuler"}
                methodCashLabel={t("payment.method.CASH") || "Espèces"}
                methodTransferLabel={t("payment.method.TRANSFER") || "Virement"}
                methodMobileLabel={t("payment.method.MOBILE_MONEY") || "Mobile money"}
                methodOtherLabel={t("payment.method.OTHER") || "Autre"}
                // V223.D — Sheet swap
                swapTitleLabel={t("group.debts.swapTitle") || "Proposer un swap de dette"}
                swapIntroLabel={
                  t("group.debts.swapIntro") ||
                  "Compense deux dettes en croix d'un seul coup."
                }
                swapStep1Label={
                  t("group.debts.swapStep1") || "Sélectionne 2 dettes à compenser"
                }
                swapMyDebtLabel={t("group.debts.swapMyDebt") || "Ma dette envers"}
                swapTheirDebtLabel={t("group.debts.swapTheirDebt") || "Ce qu'on me doit"}
                swapSubmitLabel={t("group.debts.swapSubmit") || "Confirmer le swap"}
                swapEmptyLabel={
                  t("group.debts.swapEmpty") || "Aucun swap possible pour le moment."
                }
                swapPreviewTemplate={
                  t("group.debts.swapPreview") ||
                  "Si tu acceptes : tu ne dois plus rien à {a}, et {b} ne te doit plus que {remainder} au lieu de {originalB}."
                }
              />
            </div>
          ) : (
            <ExpensesTabContent
              expenses={expenses}
              filtered={filtered}
              filter={filter}
              setFilter={setFilter}
              categoryCounts={categoryCounts}
              selected={selected}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              meId={meId}
              group={group}
              total={total}
              t={t}
              formatAmount={formatAmount}
              deleting={deleting}
              setDeleting={setDeleting}
              dialog={dialog}
              toast={toast}
              router={router}
              onChange={onChange}
              // V226 — Ouvre la lightbox sur la liste des attachments d'une
              // dépense, à l'index donné. Permet le clic direct depuis la
              // liste sans passer par le détail.
              onOpenAttachment={(atts, index) =>
                setLightbox({ attachments: atts, index })
              }
            />
          )}
        </div>
      </div>

      {/* V226 — Lightbox réutilisée (viewer V80.3) pour ouvrir les attachments
          directement depuis la liste des dépenses. Navigation gauche/droite
          via le useEffect plus haut si la dépense a plusieurs attachments.
          Le viewer gère lui-même Esc + clic backdrop pour fermer. */}
      <MobileAttachmentViewer
        attachment={currentViewerAttachment}
        onClose={() => setLightbox(null)}
      />
    </DesktopGroupSectionShell>
  );
}

/**
 * V222.F — Contenu de l'onglet "Dépenses" extrait pour clarté.
 * Identique au split 60/40 V211.B : filtres + liste + détail.
 */
function ExpensesTabContent({
  expenses,
  filtered,
  filter,
  setFilter,
  categoryCounts,
  selected,
  selectedId,
  setSelectedId,
  meId,
  group,
  total: _total,
  t,
  formatAmount,
  deleting,
  setDeleting,
  dialog,
  toast,
  router,
  onChange,
  onOpenAttachment,
}: {
  expenses: Expense[];
  filtered: Expense[];
  filter: string;
  setFilter: (v: string) => void;
  categoryCounts: Map<string, number>;
  selected: Expense | null;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  meId?: string;
  group: Group;
  total: number;
  t: ReturnType<typeof useT>;
  formatAmount: (amount: number, currency: string) => string;
  deleting: boolean;
  setDeleting: (b: boolean) => void;
  dialog: ReturnType<typeof useDialog>;
  toast: ReturnType<typeof useToast>;
  router: ReturnType<typeof useRouter>;
  onChange?: () => void;
  /**
   * V226 — Ouvre la lightbox sur les attachments d'une dépense, à l'index
   * donné (0 = premier). Permet le clic direct depuis le badge dans la liste
   * sans passer par le détail.
   */
  onOpenAttachment?: (
    attachments: NonNullable<Expense["attachments"]>,
    index: number,
  ) => void;
}) {
  // V243.A — State local pour les items détaillés de la dépense sélectionnée
  // (chargés à la demande quand splitMode === ITEMIZED). Affichés dans une
  // section "Articles partagés" du panneau détail.
  //
  // FIX V243 : ce state était précédemment déclaré dans le composant parent
  // `DesktopGroupExpensesView` mais référencé ici dans le child sans avoir
  // été passé en prop → crash runtime "selectedItems is not defined".
  // Solution : déplacer state + useEffect dans le composant qui les utilise.
  //
  // V243.B — On stocke aussi unitPrice pour afficher le détail complet du
  // ticket (qty × prix unitaire = total).
  const [selectedItems, setSelectedItems] = useState<
    Array<{
      id: string;
      description: string;
      totalPrice: string | number;
      unitPrice?: string | number | null;
      quantity?: string | number | null;
      claims: Array<{
        userId: string;
        user?: { id: string; displayName: string };
      }>;
    }>
  >([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  useEffect(() => {
    setSelectedItems([]);
    setItemsError(null);
    const sel = expenses.find((e) => e.id === selectedId);
    if (!sel || sel.splitMode !== "ITEMIZED") return;
    let cancelled = false;
    setItemsLoading(true);
    void api
      .listExpenseItems(sel.id)
      .then((items) => {
        if (cancelled) return;
        setSelectedItems(
          items.map((it: any) => ({
            id: it.id,
            description: it.description,
            totalPrice: it.totalPrice,
            unitPrice: it.unitPrice ?? null,
            quantity: it.quantity ?? null,
            claims: (it.claims ?? []).map((c: any) => ({
              userId: c.userId,
              user: c.user,
            })),
          })),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("[expenses-view] listExpenseItems failed", err);
        setItemsError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, expenses]);
  return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          minHeight: 480,
        }}
      >
        {/* === COL GAUCHE : liste filtrable ============================ */}
        <section style={{ padding: "14px 18px", borderRight: "0.5px solid #D9C8A6" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
            {CATEGORIES.map((c) => {
              const isActive = filter === c.key;
              // V220.B — Le compteur reste affiché même si 0 pour que
              // l'utilisateur voie qu'il a coché un filtre vide. Catégories
              // sans aucune dépense restent un peu plus pâles via opacity.
              const count = categoryCounts.get(c.key) || 0;
              const dim = !isActive && count === 0;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFilter(c.key)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: isActive ? 500 : 400,
                    background: isActive ? "#C58A2E" : "#FAF6EE",
                    color: isActive ? "#FAF6EE" : "#8B6F47",
                    border: isActive ? "none" : "0.5px solid #D9C8A6",
                    borderRadius: 7,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    opacity: dim ? 0.55 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span>{c.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "0 5px",
                      borderRadius: 4,
                      background: isActive
                        ? "rgba(250, 246, 238, 0.25)"
                        : "rgba(139, 111, 71, 0.12)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div
              style={{
                padding: "40px 12px",
                textAlign: "center",
                color: "#8B6F47",
              }}
            >
              <div style={{ fontSize: 30, opacity: 0.4 }}>📋</div>
              <div style={{ fontSize: 13, marginTop: 6, fontWeight: 500, color: "#2B1F15" }}>
                {t("group.hub.expensesEmpty") || "Aucune dépense pour l'instant"}
              </div>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                {filter === "all"
                  ? "Ajoute la première via ⊕ Ajouter"
                  : "Aucune dans cette catégorie"}
              </div>
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {filtered.map((e) => {
                const isSelected = selected?.id === e.id;
                const isMine = e.paidByUser?.id === meId;
                return (
                  <li
                    key={e.id}
                    // V245.B — Marqueur DOM utilisé pour scrollIntoView après
                    // une présélection venue de `?expense=<id>` (banner doublon).
                    data-expense-id={e.id}
                    onClick={() => setSelectedId(e.id)}
                    style={{
                      padding: "9px 11px",
                      background: isSelected ? "#F4E4C1" : "transparent",
                      borderLeft: isSelected ? "3px solid #C58A2E" : "3px solid transparent",
                      borderRadius: 7,
                      marginBottom: 2,
                      cursor: "pointer",
                      transition: "background 0.1s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: isSelected ? 500 : 400,
                            color: "#2B1F15",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {e.description}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#8B6F47",
                            marginTop: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <span>
                            {expensePaidByName(e)} · {formatExpenseDate(e)}
                          </span>
                          {/* V226 — Badge cliquable "📎 N" qui ouvre la lightbox
                              directement, sans passer par le détail. Si la
                              dépense a plusieurs attachments, la nav clavier
                              ←/→ permet de les parcourir. Le stopPropagation
                              empêche le clic de sélectionner aussi la dépense. */}
                          {e.attachments && e.attachments.length > 0 && (
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onOpenAttachment?.(e.attachments!, 0);
                              }}
                              aria-label={
                                t("group.hub.attachmentOpen") ||
                                "Ouvrir la pièce jointe"
                              }
                              title={
                                t("group.hub.attachmentOpen") ||
                                "Ouvrir la pièce jointe"
                              }
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "2px 6px",
                                background: "#F4ECD9",
                                color: "#8B6F47",
                                border: "0.5px solid #D9C8A6",
                                borderRadius: 8,
                                fontSize: 10,
                                fontWeight: 500,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                lineHeight: 1.2,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              <span aria-hidden="true">📎</span>
                              <span>{e.attachments.length}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: isMine ? "#1F7A57" : "#2B1F15",
                          fontVariantNumeric: "tabular-nums",
                          flexShrink: 0,
                        }}
                      >
                        {formatAmount(Number(e.amount), e.currency)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* === COL DROITE : détail ===================================== */}
        <aside style={{ padding: "14px 18px", background: "#FAF6EE" }}>
          {selected ? (
            <>
              <div
                style={{
                  fontSize: 10,
                  color: "#8B6F47",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 4,
                }}
              >
                {t("group.hub.expenseDetail") || "détail"}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: "#2B1F15" }}>
                {selected.description}
              </h2>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  color: "#9F4628",
                  marginTop: 4,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.5px",
                }}
              >
                {formatAmount(Number(selected.amount), selected.currency)}
              </div>
              <div style={{ fontSize: 11, color: "#8B6F47", marginTop: 2 }}>
                {t("group.hub.paidBy") || "Payé par"}{" "}
                {expensePaidByName(selected)} · {formatExpenseDate(selected)}
                {selected.location && ` · 📍 ${selected.location}`}
                {selected.category && ` · ${selected.category}`}
              </div>

              <div
                style={{
                  fontSize: 10,
                  color: "#8B6F47",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginTop: 16,
                  marginBottom: 6,
                }}
              >
                {t("group.hub.shares") || "Parts"}
              </div>
              {(selected.shares || []).map((s, i) => {
                const name = s.user?.displayName || group.members.find((m) => m.user?.id === s.userId)?.user?.displayName || "—";
                // V220.C — Utilise le helper qui sait lire amountOwed (vrai
                // champ Prisma) avant amount (fallback rétrocompat).
                return (
                  <div
                    key={s.userId + i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "5px 0",
                      borderBottom: i === (selected.shares?.length || 0) - 1 ? "none" : "0.5px dashed #EEE4CC",
                      fontSize: 12,
                    }}
                  >
                    <span>{name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatAmount(shareAmount(s), selected.currency)}
                    </span>
                  </div>
                );
              })}

              {/* V243.B — Section "Articles scannés" enrichie pour les
                  dépenses ITEMIZED. Affiche pour chaque ligne du ticket :
                  description + qty × prix unitaire = total, puis la liste
                  des membres assignés. En bas : ligne de vérification
                  (somme items vs total dépense) + récap "Coût par personne"
                  pour montrer combien chacun paie réellement par les items.

                  Comportement de chargement :
                  - itemsLoading → "Chargement des articles…"
                  - itemsError → message d'erreur inline
                  - selectedItems.length === 0 → rien (cas où ITEMIZED a été
                    créé mais sans items, fallback EQUAL côté backend) */}
              {selected.splitMode === "ITEMIZED" && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#8B6F47",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginTop: 16,
                      marginBottom: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                    }}
                  >
                    <span>
                      {t("expense.itemizedDetail.title") ||
                        "Détail de la facture"}
                    </span>
                    {selectedItems.length > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "#A99580",
                          textTransform: "none",
                          letterSpacing: 0,
                        }}
                      >
                        {selectedItems.length}{" "}
                        {selectedItems.length > 1
                          ? t("expense.itemizedDetail.itemsPlural") || "articles"
                          : t("expense.itemizedDetail.itemsSingular") ||
                            "article"}
                      </span>
                    )}
                  </div>
                  {itemsLoading && (
                    <div style={{ fontSize: 12, color: "#A99580", padding: "8px 0" }}>
                      {t("expense.itemizedDetail.loading") ||
                        "Chargement des articles…"}
                    </div>
                  )}
                  {itemsError && !itemsLoading && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#9F4628",
                        background: "rgba(159,70,40,0.06)",
                        border: "1px solid rgba(159,70,40,0.2)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        marginBottom: 8,
                      }}
                    >
                      ⚠ {itemsError}
                    </div>
                  )}
                  {!itemsLoading && selectedItems.length === 0 && !itemsError && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#A99580",
                        fontStyle: "italic",
                        padding: "8px 0",
                      }}
                    >
                      {t("expense.itemizedDetail.empty") ||
                        "Aucun article enregistré pour cette dépense."}
                    </div>
                  )}
                  {selectedItems.map((it, i) => {
                    const claimNames = it.claims
                      .map(
                        (c) =>
                          c.user?.displayName ||
                          group.members.find((m) => m.user?.id === c.userId)
                            ?.user?.displayName ||
                          "—",
                      )
                      .filter(Boolean);
                    const qty =
                      it.quantity != null ? Number(it.quantity) || 0 : 0;
                    const unit =
                      it.unitPrice != null ? Number(it.unitPrice) || 0 : 0;
                    const totalNum = Number(it.totalPrice) || 0;
                    // Affiche le breakdown qty × unit = total si on a les 2.
                    const showBreakdown = qty > 0 && unit > 0;
                    return (
                      <div
                        key={it.id}
                        style={{
                          padding: "7px 0",
                          borderBottom:
                            i === selectedItems.length - 1
                              ? "none"
                              : "0.5px dashed #EEE4CC",
                          fontSize: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            alignItems: "baseline",
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontWeight: 600,
                              color: "#2B1F15",
                            }}
                          >
                            {it.description}
                          </span>
                          <span
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: 600,
                              color: "#2B1F15",
                            }}
                          >
                            {formatAmount(totalNum, selected.currency)}
                          </span>
                        </div>
                        {showBreakdown && (
                          <div
                            style={{
                              fontSize: 10.5,
                              color: "#8B6F47",
                              marginTop: 2,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {qty} × {formatAmount(unit, selected.currency)}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 10,
                            color: "#8B6F47",
                            marginTop: 2,
                            display: "flex",
                            gap: 4,
                            alignItems: "baseline",
                          }}
                        >
                          {claimNames.length > 0 ? (
                            <>
                              <span style={{ color: "#1F7A57", fontWeight: 600 }}>
                                ✓
                              </span>
                              <span>
                                {t("expense.itemizedDetail.assignedTo", {
                                  count: String(claimNames.length),
                                }) ||
                                  `${claimNames.length} personne(s)`}{" "}
                                · {claimNames.join(", ")}
                              </span>
                            </>
                          ) : (
                            <span style={{ color: "#A99580" }}>
                              ○{" "}
                              {t("expense.itemizedDetail.unassigned") ||
                                "Non assigné"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* V243.B — Ligne de vérification : somme items vs total */}
                  {selectedItems.length > 0 && (() => {
                    const itemsSum = selectedItems.reduce(
                      (s, it) => s + (Number(it.totalPrice) || 0),
                      0,
                    );
                    const expectedTotal = Number(selected.amount) || 0;
                    const diff = Math.abs(itemsSum - expectedTotal);
                    const match = diff < 0.01;
                    return (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "8px 10px",
                          background: match
                            ? "rgba(31,122,87,0.06)"
                            : "rgba(197,138,46,0.08)",
                          border: `1px solid ${match ? "rgba(31,122,87,0.18)" : "rgba(197,138,46,0.25)"}`,
                          borderRadius: 8,
                          fontSize: 11,
                          color: "#2B1F15",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 8,
                        }}
                      >
                        <span style={{ color: "#6B5A47" }}>
                          {t("expense.itemizedDetail.checkLabel") ||
                            "Total facture"}
                        </span>
                        <span
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 700,
                            color: match ? "#1F7A57" : "#9F4628",
                          }}
                        >
                          {formatAmount(itemsSum, selected.currency)}
                          {!match && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 10,
                                color: "#9F4628",
                                fontWeight: 600,
                              }}
                            >
                              (≠ {formatAmount(expectedTotal, selected.currency)})
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })()}

                  {/* V243.B — Récap "Coût par personne" calculé depuis les items
                      (sum des totalPrice / nb claimers par item). Permet de
                      vérifier d'un coup d'œil combien chacun paie en mode
                      ITEMIZED, sans devoir relire chaque ligne. */}
                  {selectedItems.length > 0 && (() => {
                    const perPerson = new Map<string, number>();
                    selectedItems.forEach((it) => {
                      if (!it.claims.length) return;
                      const share =
                        (Number(it.totalPrice) || 0) / it.claims.length;
                      it.claims.forEach((c) => {
                        perPerson.set(
                          c.userId,
                          (perPerson.get(c.userId) || 0) + share,
                        );
                      });
                    });
                    if (perPerson.size === 0) return null;
                    return (
                      <div style={{ marginTop: 12 }}>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#8B6F47",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            marginBottom: 6,
                          }}
                        >
                          {t("expense.itemizedDetail.perPersonTitle") ||
                            "Coût par personne (selon les items)"}
                        </div>
                        {Array.from(perPerson.entries())
                          .sort((a, b) => b[1] - a[1])
                          .map(([uid, amount]) => {
                            const name =
                              group.members.find((m) => m.user?.id === uid)
                                ?.user?.displayName || "—";
                            const isMe = uid === meId;
                            return (
                              <div
                                key={uid}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  padding: "5px 0",
                                  fontSize: 12,
                                  color: isMe ? "#1F7A57" : "#2B1F15",
                                  fontWeight: isMe ? 600 : 400,
                                }}
                              >
                                <span>
                                  {name}
                                  {isMe && (
                                    <span
                                      style={{
                                        marginLeft: 6,
                                        fontSize: 9,
                                        color: "#C58A2E",
                                        letterSpacing: 0.8,
                                      }}
                                    >
                                      MOI
                                    </span>
                                  )}
                                </span>
                                <span
                                  style={{
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {formatAmount(amount, selected.currency)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })()}
                </>
              )}

              {/* V226 — Block "preuves jointes" devient cliquable : ouvre la
                  lightbox directement sur le premier attachment (et ←/→
                  permet de naviguer entre les preuves). Avant V226 c'était
                  juste un libellé décoratif sans interaction. */}
              {selected.attachments && selected.attachments.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenAttachment?.(selected.attachments!, 0)
                  }
                  style={{
                    marginTop: 14,
                    padding: "14px",
                    background: "#F4ECD9",
                    border: "0.5px solid #D9C8A6",
                    borderRadius: 9,
                    textAlign: "left",
                    color: "#2B1F15",
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 24 }} aria-hidden="true">📷</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>
                      {selected.attachments.length}{" "}
                      {t("group.hub.proofAttached") ||
                        "preuve(s) jointe(s)"}
                    </div>
                    <div style={{ fontSize: 11, color: "#8B6F47", marginTop: 2 }}>
                      {t("group.hub.attachmentOpen") || "Ouvrir la pièce jointe"}
                    </div>
                  </div>
                  <span style={{ fontSize: 16, color: "#8B6F47" }}>›</span>
                </button>
              )}

              <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                <button
                  type="button"
                  // V220.E — Reste sur /expenses (au lieu de naviguer vers
                  // le hub /). La page expenses gère déjà ?action=add-expense
                  // + editId via DesktopAddExpenseDrawer monté en local.
                  onClick={() =>
                    router.push(
                      `/dashboard/groups/${group.id}/expenses?action=add-expense&editId=${selected.id}`,
                    )
                  }
                  style={{
                    padding: "7px 12px",
                    background: "transparent",
                    color: "#2B1F15",
                    border: "0.5px solid #D9C8A6",
                    borderRadius: 8,
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t("common.edit") || "Modifier"}
                </button>
                <button
                  type="button"
                  // V220.D — Vraie suppression au lieu du redirect bidon
                  // précédent (`?view=expenses` qui ramenait à l'ancien
                  // formulaire). Confirm dialog BMD → api.deleteExpense →
                  // toast + refresh via onChange.
                  disabled={deleting}
                  onClick={async () => {
                    const ok = await dialog.confirm(
                      t("group.hub.expenseDeleteConfirm", {
                        description: selected.description,
                      }) ||
                        `Supprimer la dépense « ${selected.description} » ? Cette action est définitive.`,
                      {
                        title:
                          t("group.hub.expenseDeleteTitle") ||
                          "Supprimer la dépense ?",
                        confirmLabel: t("common.delete") || "Supprimer",
                        cancelLabel: t("common.cancel") || "Annuler",
                        danger: true,
                      },
                    );
                    if (!ok) return;
                    setDeleting(true);
                    try {
                      await api.deleteExpense(selected.id);
                      toast.success(
                        t("group.hub.expenseDeleted") || "Dépense supprimée.",
                      );
                      // Sort de la sélection puis refetch côté parent.
                      setSelectedId(null);
                      onChange?.();
                    } catch (e) {
                      toast.error(e);
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  style={{
                    padding: "7px 12px",
                    background: "transparent",
                    color: "#9F4628",
                    border: "0.5px solid #D9C8A6",
                    borderRadius: 8,
                    fontSize: 11,
                    cursor: deleting ? "wait" : "pointer",
                    fontFamily: "inherit",
                    opacity: deleting ? 0.6 : 1,
                  }}
                >
                  {deleting
                    ? t("common.loading") || "…"
                    : t("common.delete") || "Supprimer"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ color: "#8B6F47", fontSize: 13, padding: 20, textAlign: "center" }}>
              {t("group.hub.expensesEmpty") || "Aucune dépense"}
            </div>
          )}
        </aside>
      </div>
  );
}
