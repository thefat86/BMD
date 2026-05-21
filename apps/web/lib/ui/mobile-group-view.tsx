"use client";

/**
 * <MobileGroupView> · Refonte V39 — vue groupe mobile-first banking app.
 *
 * Objectif : remplacer entièrement la vue mobile actuelle (4395 lignes de
 * page.tsx mélangées desktop+mobile responsive) par un composant autonome,
 * dépouillé, qui ressemble vraiment à une app bancaire (Revolut, N26, Lydia).
 *
 * Architecture :
 *  - Fetch propre via `useGroupView(groupId)` (hook interne)
 *  - Hero compact (1 chiffre + 1 ligne contexte, pas de bandeau encombrant)
 *  - 4 quick actions : Dépense / Tontine / Inviter / Régler
 *  - 3 onglets pills : Dépenses (par défaut) / Soldes / Activité
 *  - BottomSheets séparés pour l'ajout (importés de fichiers dédiés)
 *  - Pas de scroll horizontal de cards, pas de modal centré
 *
 * Ce composant n'est PAS responsable du shell mobile (ResponsiveShell le
 * fournit). On rend juste le contenu sous le header sticky de MobileShell.
 *
 * Tests E2E : `e2e/group-flow.spec.ts` (créer groupe → ouvrir → ajouter
 * dépense → ajouter membre → balance refresh).
 */

import { useEffect, useState, useMemo, useCallback, useRef, Fragment, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearToken, isUnauthorized } from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { useGroupEvents } from "../use-realtime";
import { usePullToRefresh } from "../use-pull-to-refresh";
import { PullIndicator } from "./pull-indicator";
import { BottomSheet } from "./bottom-sheet";
// V53.C3 — Lazy load des sheets lourds. MobileAddExpenseSheet = 1772 lignes,
// MobileAddTontineSheet = 1317 lignes, MobileInviteSheet ~600 lignes. Avant :
// tous bundlés au boot de la page groupe même si l'user ne tap jamais.
// Après : chunks séparés chargés au 1er open du sheet (~50-150 KB économisés
// sur la page initiale).
import dynamic from "next/dynamic";
const MobileAddExpenseSheet = dynamic(
  () =>
    import("./mobile-add-expense-sheet").then((m) => ({
      default: m.MobileAddExpenseSheet,
    })),
  { ssr: false },
);
const MobileInviteSheet = dynamic(
  () =>
    import("./mobile-invite-sheet").then((m) => ({
      default: m.MobileInviteSheet,
    })),
  { ssr: false },
);
const MobileAddTontineSheet = dynamic(
  () =>
    import("./mobile-add-tontine-sheet").then((m) => ({
      default: m.MobileAddTontineSheet,
    })),
  { ssr: false },
);
import { haptic } from "../platform";
import { Icon, GroupTypeIcon, type IconName } from "./icons";
import { SegmentedControl } from "./segmented-control";
import { AvatarColored, paletteForUser } from "./avatar-colored";
import {
  MobileAttachmentViewer,
  type ViewerAttachment,
} from "./mobile-attachment-viewer";
// V127 — Popup détails de dépense (lecture seule + lien pièce jointe).
import { MobileExpenseDetailSheet } from "./mobile-expense-detail-sheet";

/** Types réduits — on ne décrit que ce qu'on utilise réellement ici. */
interface Member {
  id: string;
  role: string;
  user: { id: string; displayName: string; avatar?: string | null };
}
interface Expense {
  id: string;
  description: string;
  amount: string;
  currency: string;
  /**
   * V126 — Date d'occurrence réelle de la dépense (différente de la
   * date de création en base si l'utilisateur a saisi une dépense
   * passée). Le backend la sérialise dans `serialize()` de
   * `expenses.routes.ts`. AVANT V126, l'interface attendait
   * `createdAt` qui n'existait pas → toutes les dates affichaient
   * "Invalid date".
   */
  occurredAt: string;
  paidById?: string;
  paidByName?: string;
  /**
   * V127 — Objet payeur principal sérialisé par le backend
   * (`paidBy: { id, displayName, avatar }`). On le conserve en plus de
   * `paidById/paidByName` (legacy) pour pouvoir afficher l'avatar dans
   * la popup détail (`MobileExpenseDetailSheet`).
   */
  paidBy?: {
    id: string;
    displayName: string;
    avatar?: string | null;
  } | null;
  shares?: Array<{
    userId: string;
    /** V127 — displayName fourni par le backend (plus besoin de fallback memberById). */
    displayName?: string;
    amountOwed: string;
  }>;
  /**
   * V127 — Multi-payers persistés (sprint AC-3). Présent quand la
   * dépense a été créée en mode multi-payeurs : on affiche la
   * répartition dans la popup détail.
   */
  payers?: Array<{
    userId: string;
    amount?: string | null;
    percent?: number | null;
  }>;
  /** V127 — Mode de partage exposé par le backend (EQUAL / UNEQUAL / PERCENTAGE / ITEMIZED). */
  splitMode?: string;
  /** V80.1 — true si la dépense a au moins un attachment (= reçu scanné).
   *  Le frontend affiche un badge "Reçu" mini SVG trombone dans la timeline. */
  hasReceipt?: boolean;
  /** Catégorie (Resto/Course/Transport…) — exposée par le backend.
   *  Utilisée comme fallback couleur dot si pas de payeur connu. */
  category?: string;
}
interface Balance {
  currency: string;
  balances: Array<{ userId: string; displayName: string; net: string }>;
  suggestions: Array<{
    fromUserId: string;
    fromName: string;
    toUserId: string;
    toName: string;
    amount: string;
    currency: string;
  }>;
}
interface Group {
  id: string;
  name: string;
  type?: string;
  defaultCurrency: string;
  totalSpent?: string;
  members: Member[];
  /**
   * V215.F2 — Tableau des tontines DRAFT/ACTIVE du groupe (filtré côté backend
   * à 1 max via take:1). Auparavant `tontine?: ... | null` (relation 1-to-1
   * Prisma). Depuis V215.F2 le schéma autorise plusieurs tontines par groupe
   * (l'historique reste accessible), mais une seule peut être active à la
   * fois — d'où ce tableau de taille 0 ou 1 dans le payload du hub.
   */
  tontines?: Array<{
    id: string;
    status: string;
    contributionAmount: string | null;
    currency: string;
    frequency: string;
    startDate: string;
    centralizedPot: boolean;
  }>;
}
interface ActivityEntry {
  id: string;
  kind: string;
  createdAt: string;
  message?: string | null;
  actorName?: string | null;
}

// V52.C2 — SVG remplace EMOJI : on délègue à <GroupTypeIcon /> (icon registry V52.A2)

type Tab = "expenses" | "balance" | "tontine" | "proofs" | "activity";

/**
 * Hook interne qui encapsule tout le fetching et les mutations.
 * Sépare la logique de l'UI — facilite testing et compréhension.
 */
function useGroupView(groupId: string) {
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [meRes, g, exps, bal] = await Promise.all([
        api.me(),
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.getBalance(groupId).catch(() => null),
      ]);
      setMe(meRes.user);
      setGroup(g);
      setExpenses(exps);
      setBalance(bal);
      // Activité chargée à part — moins critique, pas de blocage si plante
      api
        .listActivity(groupId)
        .then((a) => setActivities(Array.isArray(a) ? a : []))
        .catch(() => setActivities([]));
      setError(null);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [groupId, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // V84.2 — Debounce SSE : si plusieurs events arrivent dans la même
  // demi-seconde (import CSV, salve d'actions, etc.) on coalesce en 1 seul
  // refresh. Avant ce fix, 5 events = 5 × Promise.all de 4 endpoints
  // = 20 requêtes en // → mobile 4G ramait à mort.
  const refreshTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    },
    [],
  );

  // SSE : refresh auto sur events temps réel (nouvelle dépense par un membre,
  // règlement confirmé, etc.)
  useGroupEvents(groupId, (event) => {
    const triggers = [
      "expense.created",
      "expense.updated",
      "expense.deleted",
      "balance.changed",
      "settlement.created",
      "settlement.confirmed",
      "member.joined",
      "member.left",
      "tontine.activated",
    ];
    if (!triggers.includes(event.kind)) return;
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void refresh();
    }, 500);
  });

  return {
    group,
    expenses,
    balance,
    activities,
    me,
    loading,
    error,
    refresh,
  };
}

export function MobileGroupView({ groupId }: { groupId: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const dialog = useDialog();
  const { formatAmount } = useCurrency();
  const view = useGroupView(groupId);
  const { group, expenses, balance, activities, me, loading, error, refresh } =
    view;

  // Onglet actif. Par défaut Dépenses (= ce qu'attend l'utilisateur à
  // l'ouverture d'un groupe : voir le feed).
  const [tab, setTab] = useState<Tab>("expenses");

  // V201 — Kill switch Caisses Projet. On vérifie une fois au mount du
  // groupe ; tant que la valeur est `null` la tile "Caisses" n'apparaît
  // pas (évite un flash visuel quand le module est OFF).
  const [fundsEnabled, setFundsEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("../api-client")
      .then((m) => m.api.projectFundsFeatureGate())
      .then((r) => {
        if (!cancelled) setFundsEnabled(r.enabled);
      })
      .catch(() => {
        /* feature-gate down → on garde la tile cachée, fail-safe */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // BottomSheets
  const [openSheet, setOpenSheet] = useState<
    "none" | "add-expense" | "invite" | "add-tontine" | "settle"
  >("none");
  const [settleTarget, setSettleTarget] = useState<
    | null
    | {
        fromUserId: string;
        fromName: string;
        toUserId: string;
        toName: string;
        amount: string;
        currency: string;
      }
  >(null);

  // Pull-to-refresh
  const { state: pullState, bindToScrollContainer } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([
        new Promise((r) => setTimeout(r, 500)),
        refresh(),
      ]);
    },
  });
  useEffect(() => {
    bindToScrollContainer(document.body);
  }, [bindToScrollContainer]);

  // Calculs dérivés
  const myMember = useMemo(() => {
    if (!me?.id || !group?.members) return null;
    return group.members.find((m) => m.user.id === me.id) ?? null;
  }, [group, me]);

  const isAdmin = myMember?.role === "ADMIN";

  const myNet = useMemo(() => {
    if (!balance?.balances || !me?.id) return 0;
    const entry = balance.balances.find((b) => b.userId === me.id);
    return entry ? parseFloat(entry.net) : 0;
  }, [balance, me]);

  const myOwedTo = useMemo(() => {
    if (!balance?.suggestions || !me?.id) return [];
    return balance.suggestions.filter((s) => s.fromUserId === me.id);
  }, [balance, me]);

  const owedToMe = useMemo(() => {
    if (!balance?.suggestions || !me?.id) return [];
    return balance.suggestions.filter((s) => s.toUserId === me.id);
  }, [balance, me]);

  const currency = group?.defaultCurrency ?? "EUR";

  async function handleDeleteExpense(expense: Expense) {
    const confirmed = await dialog.confirm(
      expense.description ||
        t("group.deleteExpenseTitle") ||
        "Supprimer cette dépense ?",
      {
        title: t("group.deleteExpenseTitle") || "Supprimer cette dépense ?",
        confirmLabel: t("common.delete") || "Supprimer",
        cancelLabel: t("common.cancel") || "Annuler",
        variant: "danger",
      },
    );
    if (!confirmed) return;
    try {
      await api.deleteExpense(expense.id);
      haptic("success");
      toast.info(t("group.expenseDeleted") || "Dépense supprimée");
      void refresh();
    } catch (e) {
      toast.info((e as Error).message);
    }
  }

  async function handleConfirmSettle() {
    if (!settleTarget) return;
    try {
      await api.createSettlement(groupId, {
        fromUserId: settleTarget.fromUserId,
        toUserId: settleTarget.toUserId,
        amount: settleTarget.amount,
        currency: settleTarget.currency,
      });
      haptic("success");
      toast.info(t("group.settlementCreated") || "Règlement enregistré");
      setSettleTarget(null);
      setOpenSheet("none");
      void refresh();
    } catch (e) {
      toast.info((e as Error).message);
    }
  }

  // ============ RENDER ============

  if (loading && !group) {
    return <MobileGroupSkeleton />;
  }

  if (error && !group) {
    return (
      <div style={{ padding: "20px 16px", color: "var(--cream-soft)" }}>
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "rgba(217,113,74,0.10)",
            border: "1px solid rgba(217,113,74,0.30)",
            color: "#FFB89A",
            fontSize: 13,
          }}
        >
          {error}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          style={{
            marginTop: 14,
            padding: "12px 18px",
            background: "var(--saffron)",
            color: "#16111E",
            border: "none",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {t("common.retry") || "Réessayer"}
        </button>
      </div>
    );
  }

  if (!group) return null;

  // V52.C2 — SVG remplace EMOJI : GroupTypeIcon (gère TONTINE/COLOC/TRAVEL/EVENT/CLUB/PARISH/GENERIC)
  const groupTypeKey = group.type ?? "GENERIC";

  return (
    <div
      style={{
        padding: "0 16px 80px",
        // 80px de bottom-padding pour éviter que le FAB cache le contenu
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <PullIndicator {...pullState} />

      {/* V80 — HERO V45 light : card blanche, halo saffron-pale, identité groupe,
          avatar stack overlap (4 + count), solde TOI Cormorant grand vert/rouge,
          FX pill si devise membre ≠ devise groupe. Simple, lisible, original. */}
      <V45GroupHero
        group={group}
        groupId={groupId}
        groupTypeKey={groupTypeKey}
        myNet={myNet}
        currency={currency}
        members={group.members}
        meId={me?.id}
        myMemberCurrency={(myMember as any)?.user?.defaultCurrency}
        t={t}
      />

      {/* V91.D — CTA "Inviter des membres" en pleine largeur (palette V45 light,
          outline saffron). Restaure l'action invitation depuis la vue groupe
          (le FAB ouvre uniquement Ajouter dépense). Le BottomSheet
          MobileInviteSheet est déjà rendu plus bas — on n'a qu'à le déclencher.
          Visible pour tous les membres (l'admin n'est pas requis pour suggérer
          des invités ; les contrôles d'autorisation sont côté sheet/backend). */}
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setOpenSheet("invite");
        }}
        className="bmd-tap"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          width: "100%",
          padding: "13px 16px",
          minHeight: 48,
          borderRadius: 14,
          background: "var(--paper, #FFFFFF)",
          border: "1.5px solid var(--v45-saffron, #C58A2E)",
          color: "var(--v45-saffron, #C58A2E)",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: "pointer",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          boxShadow: "0 2px 8px rgba(197,138,46,0.10)",
          transition: "background 160ms ease, transform 100ms ease",
        }}
      >
        <Icon name="users" size={18} strokeWidth={2} />
        <span>{t("group.inviteMembers") || "+ Inviter des membres"}</span>
      </button>

      {/* V80 — 4 TILES 2×2 (Dépenses / Soldes / Tontine / Preuves).
          Tile active en saffron-pale, autres en blanc. Navigation principale du
          groupe. Les actions de création (Ajouter dépense) passent par le FAB
          en bas à droite ; Inviter passe par le CTA pleine-largeur ci-dessus. */}
      <V45GroupTiles
        tab={tab}
        setTab={setTab}
        expensesCount={expenses.length}
        // V128 — On passe l'objet tontine complet (résumé) pour permettre
        // à la tile d'afficher un mini-état lisible (montant + fréquence
        // + statut) au lieu d'un simple badge "+" qui disparaît
        // silencieusement après création.
        tontine={group.tontines?.[0] ?? null}
        onTontineNav={() => {
          if (group.tontines?.[0]?.id) {
            router.push(`/dashboard/groups/${groupId}/tontine`);
          } else {
            setOpenSheet("add-tontine");
          }
        }}
        onProofsNav={() => router.push(`/dashboard/groups/${groupId}/attachments`)}
        // V201 — Tile Caisses (visible si kill switch ON)
        onFundsNav={() => router.push(`/dashboard/groups/${groupId}/funds`)}
        fundsEnabled={fundsEnabled}
        formatAmount={formatAmount}
        t={t}
      />

      {/* CONTENU DE L'ONGLET */}
      {tab === "expenses" && (
        <ExpensesPane
          expenses={expenses}
          meId={me?.id}
          members={group.members}
          currency={currency}
          onAdd={() => setOpenSheet("add-expense")}
          onDelete={handleDeleteExpense}
          formatAmount={formatAmount}
          t={t}
        />
      )}
      {tab === "balance" && (
        <BalancePane
          balance={balance}
          meId={me?.id}
          currency={currency}
          owedToMe={owedToMe}
          myOwedTo={myOwedTo}
          onSettleTap={(target) => {
            setSettleTarget(target);
            setOpenSheet("settle");
          }}
          formatAmount={formatAmount}
          t={t}
        />
      )}
      {tab === "activity" && (
        <ActivityPane activities={activities} t={t} />
      )}

      {/* BOTTOM SHEETS */}
      <MobileAddExpenseSheet
        open={openSheet === "add-expense"}
        onClose={() => setOpenSheet("none")}
        groupId={groupId}
        members={group.members}
        meId={me?.id}
        defaultCurrency={currency}
        onCreated={() => {
          setOpenSheet("none");
          void refresh();
        }}
      />

      <MobileInviteSheet
        open={openSheet === "invite"}
        onClose={() => setOpenSheet("none")}
        groupId={groupId}
        groupName={group.name}
        isAdmin={isAdmin}
        onInvited={() => void refresh()}
      />

      <MobileAddTontineSheet
        open={openSheet === "add-tontine"}
        onClose={() => setOpenSheet("none")}
        groupId={groupId}
        members={group.members}
        defaultCurrency={currency}
        onCreated={() => {
          setOpenSheet("none");
          router.push(`/dashboard/groups/${groupId}/tontine`);
        }}
      />

      {settleTarget && (
        <BottomSheet
          open={openSheet === "settle"}
          onClose={() => {
            setOpenSheet("none");
            setSettleTarget(null);
          }}
          title={t("group.confirmSettle") || "Confirmer le règlement"}
        >
          <SettleConfirmContent
            target={settleTarget}
            onConfirm={handleConfirmSettle}
            onCancel={() => {
              setOpenSheet("none");
              setSettleTarget(null);
            }}
            formatAmount={formatAmount}
            t={t}
          />
        </BottomSheet>
      )}

      {/* FAB ajout dépense (renforce la priorité visuelle) */}
      <button
        type="button"
        onClick={() => setOpenSheet("add-expense")}
        aria-label={t("group.addExpense") || "Ajouter une dépense"}
        style={{
          position: "fixed",
          bottom: 88,
          right: 18,
          width: 56,
          height: 56,
          borderRadius: 28,
          background:
            "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
          border: "none",
          color: "#16111E",
          fontSize: 28,
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 10px 30px rgba(232,163,61,0.45)",
          zIndex: 50,
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        +
      </button>
    </div>
  );
}

// ============ SUB-COMPONENTS ============

function QuickTile({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "12px 4px",
        background: "rgba(244,228,193,0.04)",
        border: "1px solid rgba(244,228,193,0.08)",
        borderRadius: 14,
        color: "var(--cream)",
        cursor: "pointer",
        minHeight: 70,
        fontFamily: "inherit",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.transform = "scale(0.96)";
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          background: "rgba(232,163,61,0.14)",
          border: "1px solid rgba(232,163,61,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--saffron)",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--cream-soft)",
          letterSpacing: 0.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {label}
      </span>
    </button>
  );
}

// V185.A — `memo()` car TabPill est rendu en boucle dans la nav segmentée
// (3-4 instances par page). Sans memo, à chaque setState parent, les 4 pills
// re-render. Props primitives (booléen + string + number) → comparaison shallow
// memo() suffit. Pour que ce soit pleinement efficace, le parent doit utiliser
// useCallback sur onClick (sinon nouvelle closure à chaque render parent =
// memo() inefficace) — mais memo() reste sans surcoût quand props changent.
const TabPill = memo(function TabPill({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flex: 1,
        padding: "9px 6px",
        borderRadius: 10,
        background: active
          ? "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))"
          : "transparent",
        color: active ? "var(--night-2, #16111E)" : "var(--cream-soft)",
        fontSize: 12.5,
        fontWeight: 700,
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        letterSpacing: 0.2,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        transition: "background 0.15s ease",
      }}
    >
      <span>{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span
          style={{
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 999,
            background: active ? "rgba(22,17,30,0.18)" : "rgba(232,163,61,0.20)",
            color: active ? "#16111E" : "var(--saffron)",
            fontWeight: 800,
            minWidth: 18,
            textAlign: "center",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
});

function ExpensesPane({
  expenses,
  meId,
  members,
  currency,
  onAdd,
  onDelete,
  formatAmount,
  t,
}: {
  expenses: Expense[];
  meId?: string;
  members: Member[];
  currency: string;
  onAdd: () => void;
  onDelete: (e: Expense) => void;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  // V82.1 — TOUS les hooks DOIVENT être appelés AVANT tout early return,
  // sinon React perd l'ordre des hooks dès que `expenses` passe de 0 à >0
  // (crash "Rendered more hooks…") ET, en dev StrictMode, les setters issus
  // de useState peuvent être désynchronisés → setSelectedAttachment ne met
  // pas à jour la bonne state-cell → le viewer ne s'ouvre jamais malgré
  // le click. C'était la cause racine du bug "preuves ne s'ouvrent pas".
  // V112 — Map enrichie : displayName + avatar (pour les forfaits payants,
  // on affiche la photo du membre au lieu des initiales).
  const memberById = useMemo(() => {
    const m = new Map<string, { displayName: string; avatar: string | null }>();
    for (const mem of members) {
      m.set(mem.user.id, {
        displayName: mem.user.displayName,
        avatar: mem.user.avatar ?? null,
      });
    }
    return m;
  }, [members]);

  // V80.4 — Mode d'affichage : Liste (par jour) / Par personne / Catégorie
  const [viewMode, setViewMode] = useState<"list" | "byPayer" | "byCategory">("list");
  // V80.4 — Attachment sélectionné pour le lightbox (au tap du badge "Reçu")
  const [selectedAttachment, setSelectedAttachment] =
    useState<ViewerAttachment | null>(null);
  const [loadingAttachment, setLoadingAttachment] = useState<string | null>(null);
  // V127 — Dépense sélectionnée pour la popup détails (click row dans timeline)
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  if (expenses.length === 0) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          border: "1px dashed rgba(244,228,193,0.15)",
          borderRadius: 14,
          color: "var(--cream-soft)",
        }}
      >
        {/* V52.C2 — SVG remplace EMOJI : receipt outline 1.5 */}
        <div style={{ marginBottom: 8, color: "var(--saffron)", display: "flex", justifyContent: "center" }}>
          <Icon name="receipt" size={32} strokeWidth={1.6} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          {t("group.noExpensesYet") || "Aucune dépense pour le moment"}
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 14 }}>
          {t("group.addFirstExpense") ||
            "Ajoute la première pour démarrer le partage."}
        </div>
        <button
          type="button"
          onClick={onAdd}
          style={{
            padding: "10px 18px",
            background:
              "linear-gradient(135deg, var(--saffron), var(--terracotta))",
            color: "#16111E",
            fontWeight: 700,
            fontSize: 13,
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
          }}
        >
          {t("group.addExpense") || "+ Ajouter une dépense"}
        </button>
      </div>
    );
  }

  const sortedExpenses = useMemo(() => {
    return [...expenses].sort(
      // V126 — Trier par date d'occurrence (occurredAt) et non createdAt
      // (qui n'est pas exposé par le backend). AVANT V126, ces sorts
      // retournaient NaN sur les deux côtés → ordre indéfini visuellement.
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }, [expenses]);

  // Couleur dot V80.4 : vert MOI / saffron autres (spec V45 maquette)
  function dotColorFor(userId?: string): string {
    if (!userId) return "var(--cocoa-mute, #A99580)";
    if (userId === meId) return "var(--v45-emerald, #4F8E6E)";
    return "var(--v45-saffron, #C58A2E)";
  }

  // Groupage selon le mode actif
  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of sortedExpenses) {
      let key: string;
      if (viewMode === "byPayer") {
        key = e.paidById ?? "__unknown__";
      } else if (viewMode === "byCategory") {
        key = (e.category && e.category.trim()) || "__uncat__";
      } else {
        // V126 — Group by day basé sur occurredAt (et non createdAt absent).
        key = new Date(e.occurredAt).toDateString();
      }
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [sortedExpenses, viewMode]);

  /** Header de groupe selon le mode */
  function groupHeader(key: string, items: Expense[]) {
    if (viewMode === "byPayer") {
      const first = items[0]!;
      const memberInfo = first.paidById ? memberById.get(first.paidById) : null;
      const name =
        first.paidByName ??
        memberInfo?.displayName ??
        (t("group.unknownPayer") || "Inconnu");
      const isMe = first.paidById === meId;
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
            paddingLeft: 4,
          }}
        >
          <AvatarColored
            userId={first.paidById ?? "__"}
            initials={name}
            photoUrl={memberInfo?.avatar ?? null}
            size={24}
            paletteOverride={isMe ? "emerald" : undefined}
          />
          <span
            style={{
              fontSize: 12,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "var(--cocoa-mute, #A99580)",
              fontWeight: 700,
            }}
          >
            {isMe ? t("group.youPaid") || "Toi" : name}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--cocoa-mute, #A99580)",
              marginLeft: "auto",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {items.length}
          </span>
        </div>
      );
    }
    if (viewMode === "byCategory") {
      const label =
        key === "__uncat__"
          ? t("group.catUncategorized") || "Sans catégorie"
          : key;
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            paddingLeft: 4,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--v45-saffron, #C58A2E)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 12,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "var(--cocoa-mute, #A99580)",
              fontWeight: 700,
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--cocoa-mute, #A99580)",
              marginLeft: "auto",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {items.length}
          </span>
        </div>
      );
    }
    // Mode "list" → eyebrow date Aujourd'hui / Hier / date
    return (
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--cocoa-mute, #A99580)",
          fontWeight: 600,
          marginBottom: 10,
          paddingLeft: 4,
        }}
      >
        {dayLabel(items[0]!.occurredAt)}
      </div>
    );
  }

  // Click sur le badge "Reçu" → fetch attachments + ouvre viewer
  // V82.1 — Logs verbeux pour tracer le pipeline complet jusqu'au viewer.
  // Si le user voit "[receipt] click expense=… count=0", c'est que la
  // dépense n'a en réalité aucun attachment (hasReceipt faux positif).
  // Si "count>0" puis rien → setSelectedAttachment ne propage pas (rare,
  // souvent un bug hooks ou un Suspense parent qui réinitialise).
  async function handleReceiptClick(expense: Expense) {
    // V181 — Logs conditionnés au dev (économise CPU + IO + bruit Sentry).
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log("[receipt] click expense=", expense.id);
    }
    if (loadingAttachment) {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.log("[receipt] busy — already loading", loadingAttachment);
      }
      return;
    }
    setLoadingAttachment(expense.id);
    haptic("tap");
    try {
      const list = await api.listAttachments(expense.id);
      if (isDev) {
        // eslint-disable-next-line no-console
        console.log(
          "[receipt] listAttachments resolved count=",
          Array.isArray(list) ? list.length : "non-array",
        );
      }
      if (Array.isArray(list) && list.length > 0) {
        const a = list[0] as {
          id: string;
          fileName: string;
          mimeType: string;
          kind?: ViewerAttachment["kind"];
          transcript?: string | null;
        };
        if (isDev) {
          // eslint-disable-next-line no-console
          console.log(
            "[receipt] opening viewer attachmentId=",
            a.id,
            "mime=",
            a.mimeType,
          );
        }
        setSelectedAttachment({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          kind: a.kind,
          amount: expense.amount,
          currency: expense.currency,
          description: expense.description,
          transcript: a.transcript ?? null,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[receipt] listAttachments failed", err);
    } finally {
      setLoadingAttachment(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* V80.4 — Segments Liste / Par personne / Catégorie */}
      <SegmentedControl
        value={viewMode}
        onChange={setViewMode}
        ariaLabel={t("group.viewModeLabel") || "Mode d'affichage"}
        segments={[
          { value: "list", label: t("group.viewModeList") || "Liste" },
          { value: "byPayer", label: t("group.viewModeByPayer") || "Par personne" },
          { value: "byCategory", label: t("group.viewModeByCategory") || "Catégorie" },
        ]}
      />

      {groups.map(([gKey, items]) => (
        <section key={gKey}>
          {groupHeader(gKey, items)}

          {/* Cordon timeline 1.5px sand · dots colorés selon source */}
          <div
            style={{
              position: "relative",
              paddingLeft: 22,
              borderLeft: "1.5px solid var(--v45-line, rgba(43,31,21,0.10))",
              marginLeft: 6,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {items.map((e) => {
              const amount = parseFloat(e.amount);
              const payerName =
                e.paidByName ??
                (e.paidById ? memberById.get(e.paidById)?.displayName : null) ??
                "?";
              const isMine = e.paidById === meId;
              const dotColor = dotColorFor(e.paidById);
              return (
                <article
                  key={e.id}
                  // V127 — La row entière est cliquable → ouvre la popup
                  // détails de la dépense (description, payeurs, parts,
                  // catégorie, date, pièces jointes…). Les sous-boutons
                  // (delete, badge reçu) interceptent le click via
                  // `stopPropagation` pour conserver leur action propre.
                  onClick={() => {
                    haptic("tap");
                    setDetailExpense(e);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      haptic("tap");
                      setDetailExpense(e);
                    }
                  }}
                  aria-label={
                    t("expense.openDetail") || "Voir les détails de la dépense"
                  }
                  className="bmd-tap"
                  style={{
                    position: "relative",
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: "var(--paper, #FFFFFF)",
                    border:
                      "1px solid var(--v45-line, rgba(43,31,21,0.08))",
                    boxShadow: "0 1px 3px rgba(43,31,21,0.04)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {/* Dot timeline coloré : vert MOI / saffron autres */}
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: -27,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: dotColor,
                      border: "2px solid var(--paper, #FFFFFF)",
                      boxShadow: "0 0 0 1px var(--v45-line, rgba(43,31,21,0.10))",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--cocoa, #2B1F15)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {e.description || "(sans description)"}
                      </span>
                      {/* V80.4 — Badge "Reçu" CLIQUABLE → ouvre viewer.
                          V127 — ReceiptBadge fait déjà stopPropagation
                          en interne (cf. composant), donc le click sur le
                          badge n'ouvre pas la popup détails de la row. */}
                      {e.hasReceipt && (
                        <ReceiptBadge
                          t={t}
                          loading={loadingAttachment === e.id}
                          onClick={() => void handleReceiptClick(e)}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--cocoa-soft, #6B5B47)",
                        marginTop: 3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {isMine
                        ? t("group.youPaid") || "Toi"
                        : payerName}
                      {" · "}
                      {formatRelativeDate(e.occurredAt)}
                    </div>
                  </div>
                  <div
                    className="bmd-num"
                    style={{
                      fontFamily: "Cormorant Garamond, serif",
                      fontSize: 17,
                      fontWeight: 700,
                      color: "var(--cocoa, #2B1F15)",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {formatAmount(amount, e.currency || currency)}
                  </div>
                  {isMine && (
                    <button
                      type="button"
                      // V127 — stopPropagation pour ne pas déclencher la
                      // popup détails de dépense quand on tape la corbeille.
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onDelete(e);
                      }}
                      aria-label={t("common.delete") || "Supprimer"}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: "transparent",
                        border: "none",
                        color: "var(--cocoa-mute, #A99580)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        touchAction: "manipulation",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
                      </svg>
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {/* V80.4 — Viewer lightbox plein écran (portalisé sur body) */}
      <MobileAttachmentViewer
        attachment={selectedAttachment}
        onClose={() => setSelectedAttachment(null)}
      />

      {/* V127 — Popup détails de dépense (tap sur la row). Réutilise le
          MobileAttachmentViewer monté ci-dessus via le callback
          `onOpenAttachment` pour le lien de pièce jointe. */}
      <MobileExpenseDetailSheet
        open={detailExpense !== null}
        onClose={() => setDetailExpense(null)}
        expense={detailExpense}
        members={members}
        meId={meId}
        onOpenAttachment={(att) => {
          setSelectedAttachment(att);
          // Ferme la popup détails pour que le viewer reste seul au
          // premier plan (sinon empilement de 2 BottomSheet → UX
          // confuse au tap "retour").
          setDetailExpense(null);
        }}
        formatAmount={formatAmount}
      />
    </div>
  );
}

/**
 * V80.1 — Badge "Reçu" mini SVG trombone + texte.
 * V80.4 — Désormais CLIQUABLE → ouvre le viewer attachment.
 * V80.5 — Rendu split en deux returns explicites (button OU span) pour
 * éviter le pattern `const Comp = ...` qui n'est pas supporté par SWC/
 * Turbopack en Next 15 strict.
 *
 * Affiché à droite du titre de la dépense quand elle a au moins un
 * attachment image (reçu scanné). Style V45-light, saffron-pale.
 */
const RECEIPT_BADGE_STYLE = {
  display: "inline-flex" as const,
  alignItems: "center" as const,
  gap: 4,
  padding: "2px 7px",
  borderRadius: 999,
  background: "var(--v45-saffron-pale, #F6E8C5)",
  border: "1px solid var(--v45-saffron-soft, #E8C988)",
  color: "var(--v45-saffron, #C58A2E)",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase" as const,
  flexShrink: 0,
  fontFamily: "inherit",
};

function ReceiptBadgeIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.99 8.78l-8.49 8.49a2 2 0 0 1-2.83-2.83l8.49-8.49" />
    </svg>
  );
}

// V185.B — `memo()` : ReceiptBadge est rendu sur chaque ligne d'expense
// timeline qui a une pièce jointe. Sur un groupe avec 50+ dépenses, ça fait
// 50+ badges qui re-render à chaque setState parent (toggle pane, filtre,
// etc.). Props stables (t function pointer + onClick + loading bool) → memo()
// très efficace ici.
const ReceiptBadge = memo(function ReceiptBadge({
  t,
  onClick,
  loading,
}: {
  t: (key: string, vars?: Record<string, string>) => string;
  onClick?: () => void;
  loading?: boolean;
}) {
  const label = loading ? t("common.loading") || "…" : t("group.receipt") || "Reçu";
  const ariaLabel = t("group.hasReceipt") || "Reçu joint";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label={ariaLabel}
        disabled={loading}
        style={{
          ...RECEIPT_BADGE_STYLE,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.6 : 1,
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >
        <ReceiptBadgeIcon />
        {label}
      </button>
    );
  }

  return (
    <span aria-label={ariaLabel} style={RECEIPT_BADGE_STYLE}>
      <ReceiptBadgeIcon />
      {label}
    </span>
  );
});

function BalancePane({
  balance,
  meId,
  currency,
  owedToMe,
  myOwedTo,
  onSettleTap,
  formatAmount,
  t,
}: {
  balance: Balance | null;
  meId?: string;
  currency: string;
  owedToMe: Balance["suggestions"];
  myOwedTo: Balance["suggestions"];
  onSettleTap: (s: Balance["suggestions"][number]) => void;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  if (!balance) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "var(--cream-soft)",
        }}
      >
        {t("group.loadingBalance") || "Chargement des soldes…"}
      </div>
    );
  }

  // V52.G4 — Polish V45 écran 8 : solde global au hero du panel
  const myNet = (() => {
    if (!meId) return 0;
    const entry = balance.balances.find((b) => b.userId === meId);
    return entry ? parseFloat(entry.net) : 0;
  })();
  const heroCurrency = balance.currency || currency;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* V52.G4 — Hero solde global */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          padding: "12px 0 16px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: "var(--cocoa-mute, #A99580)",
            fontWeight: 500,
          }}
        >
          Ton solde sur ce groupe
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 38,
            fontWeight: 700,
            color:
              myNet > 0
                ? "var(--v45-emerald, #4F8E6E)"
                : myNet < 0
                  ? "var(--v45-terracotta, #9F4628)"
                  : "var(--cocoa, var(--cream))",
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {myNet > 0 ? "+" : ""}
          {formatAmount(myNet, heroCurrency)}
        </div>
      </div>

      {/* Tu dois — actions prioritaires (à régler) */}
      {myOwedTo.length > 0 && (
        <section>
          <h3
            style={{
              fontSize: 11,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 1.4,
              fontWeight: 700,
              margin: "0 0 8px 4px",
            }}
          >
            {t("group.youOwe") || "Tu dois"}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {myOwedTo.map((s, i) => (
              <button
                key={`owe-${i}`}
                type="button"
                onClick={() => onSettleTap(s)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background:
                    "linear-gradient(135deg, rgba(217,113,74,0.10), rgba(217,113,74,0.04))",
                  border: "1px solid rgba(217,113,74,0.28)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  color: "var(--cream)",
                  fontFamily: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {t("group.payTo", { name: s.toName }) || `Payer ${s.toName}`}
                  </div>
                  <div
                    style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
                  >
                    {t("group.tapToConfirm") || "Tap pour confirmer"}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#D9714A",
                    fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                  }}
                >
                  {formatAmount(s.amount, s.currency)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* On te doit */}
      {owedToMe.length > 0 && (
        <section>
          <h3
            style={{
              fontSize: 11,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 1.4,
              fontWeight: 700,
              margin: "0 0 8px 4px",
            }}
          >
            {t("group.owesYou") || "On te doit"}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {owedToMe.map((s, i) => (
              <div
                key={`recv-${i}`}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background:
                    "linear-gradient(135deg, rgba(125,197,158,0.08), rgba(125,197,158,0.02))",
                  border: "1px solid rgba(125,197,158,0.22)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {s.fromName}
                  </div>
                  <div
                    style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
                  >
                    {t("group.willPayYou") || "doit te régler"}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#7DC59E",
                    fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                  }}
                >
                  +{formatAmount(s.amount, s.currency)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Soldes individuels — table compacte */}
      <section>
        <h3
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            margin: "0 0 8px 4px",
          }}
        >
          {t("group.netByMember") || "Solde par membre"}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {balance.balances.map((b) => {
            const net = parseFloat(b.net);
            const isMe = b.userId === meId;
            return (
              <div
                key={b.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  background: "rgba(244,228,193,0.03)",
                  borderRadius: 10,
                  border: "1px solid rgba(244,228,193,0.06)",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 9,
                    background: "rgba(232,163,61,0.12)",
                    border: "1px solid rgba(232,163,61,0.25)",
                    color: "var(--saffron)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {b.displayName.charAt(0).toUpperCase()}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: "var(--cream)",
                    fontWeight: isMe ? 700 : 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {isMe ? `${b.displayName} (${t("common.you") || "toi"})` : b.displayName}
                </span>
                <span
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 14,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color:
                      net > 0
                        ? "#7DC59E"
                        : net < 0
                          ? "#D9714A"
                          : "var(--muted)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {net > 0 ? "+" : net < 0 ? "−" : ""}
                  {formatAmount(Math.abs(net), balance.currency || currency)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ActivityPane({
  activities,
  t,
}: {
  activities: ActivityEntry[];
  t: ReturnType<typeof useT>;
}) {
  if (activities.length === 0) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          color: "var(--cream-soft)",
          fontSize: 13,
        }}
      >
        {t("group.noActivity") || "Pas encore d'activité dans ce groupe."}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {activities.slice(0, 30).map((a) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            gap: 10,
            padding: "10px 12px",
            background: "rgba(244,228,193,0.03)",
            borderRadius: 10,
            border: "1px solid rgba(244,228,193,0.06)",
          }}
        >
          {/* V52.C2 — SVG remplace EMOJI : icône outline 1.5 selon kind */}
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--saffron)",
              flexShrink: 0,
            }}
          >
            <Icon name={activityKindIconName(a.kind)} size={14} strokeWidth={1.6} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "var(--cream)" }}>
              {a.message ?? a.kind}
            </div>
            <div
              style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}
            >
              {formatRelativeDate(a.createdAt)}
              {a.actorName ? ` · ${a.actorName}` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SettleConfirmContent({
  target,
  onConfirm,
  onCancel,
  formatAmount,
  t,
}: {
  target: {
    fromName: string;
    toName: string;
    amount: string;
    currency: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          padding: "20px 16px",
          background:
            "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(181,70,46,0.05))",
          border: "1px solid rgba(232,163,61,0.30)",
          borderRadius: 14,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: "var(--cream-soft)",
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          {target.fromName} <strong>→</strong> {target.toName}
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 36,
            fontWeight: 700,
            color: "var(--cream)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {formatAmount(target.amount, target.currency)}
        </div>
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--cream-soft)",
          textAlign: "center",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {t("group.settleHint") ||
          "Confirme uniquement si l'argent a été transféré hors de l'app (Mobile Money, virement, espèces)."}
      </p>
      <button
        type="button"
        onClick={onConfirm}
        style={{
          padding: "14px 20px",
          background:
            "linear-gradient(135deg, var(--saffron), var(--terracotta))",
          color: "#16111E",
          border: "none",
          borderRadius: 14,
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          touchAction: "manipulation",
        }}
      >
        {t("group.confirmPayment") || "Confirmer le paiement"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          padding: "12px 20px",
          background: "transparent",
          color: "var(--cream-soft)",
          border: "1px solid rgba(244,228,193,0.18)",
          borderRadius: 14,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {t("common.cancel") || "Annuler"}
      </button>
    </div>
  );
}

function MobileGroupSkeleton() {
  return (
    <div
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          height: 140,
          borderRadius: 18,
          background: "rgba(244,228,193,0.04)",
          animation: "bmd-skel 1.2s infinite ease-in-out",
        }}
      />
      <div
        style={{
          height: 70,
          borderRadius: 14,
          background: "rgba(244,228,193,0.04)",
          animation: "bmd-skel 1.2s infinite ease-in-out 0.1s",
        }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 60,
            borderRadius: 12,
            background: "rgba(244,228,193,0.04)",
            animation: `bmd-skel 1.2s infinite ease-in-out ${0.2 + i * 0.06}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes bmd-skel {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

// ============ HELPERS ============

// V52.G4 — Polish V45 écran 7 : label de jour pour timeline groupée
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (sameDay) return "Aujourd'hui";
  if (isYesterday) return "Hier";
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function formatRelativeDate(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffSec = (now - then) / 1000;
    if (diffSec < 60) return "à l'instant";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h`;
    if (diffSec < 7 * 86400) return `${Math.floor(diffSec / 86400)} j`;
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

// V52.C2 — SVG remplace EMOJI : map kind → IconName (registry V52.A2)
function activityKindIconName(kind: string): IconName {
  if (kind.startsWith("EXPENSE")) return "receipt";
  if (kind.startsWith("MEMBER")) return "user";
  if (kind.startsWith("SETTLEMENT")) return "credit-card";
  if (kind.startsWith("TONTINE")) return "coins";
  if (kind.startsWith("SWAP")) return "repeat";
  if (kind.startsWith("INVITE")) return "share-2";
  if (kind.startsWith("GROUP")) return "folder";
  return "tag";
}

// ============================================================
// V80 — HERO V45 + TILES 2×2 (refonte vue détail groupe)
// ============================================================
//
// Template V45 light, simple et lisible :
//  - Card hero blanche avec halo saffron-pale en arrière-plan
//  - Identité groupe (icône type + nom + bouton settings)
//  - Avatar stack overlap (4 max + count) couleurs distinctes V45
//  - Solde TOI en Cormorant Garamond grand, vert si positif, terracotta si négatif
//  - FX pill discret si devise membre ≠ devise groupe
//  - 4 tiles 2×2 (Dépenses / Soldes / Tontine / Preuves), tile active en
//    saffron-pale, autres en blanc
//
// La règle "même esprit, design différent" mobile vs web s'applique :
// ce composant est mobile-only. Pour desktop, le rendu reste l'ancien (cf.
// page detail desktop qui n'utilise pas MobileGroupView).

function V45GroupHero({
  group,
  groupId,
  groupTypeKey,
  myNet,
  currency,
  members,
  meId,
  myMemberCurrency,
  t,
}: {
  group: { name: string; members: Member[] };
  groupId: string;
  groupTypeKey: string;
  myNet: number;
  currency: string;
  members: Member[];
  meId: string | undefined;
  myMemberCurrency: string | undefined;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  // Avatar stack : 4 premiers membres + count si > 4
  const stackMembers = members.slice(0, 4);
  const overflow = Math.max(0, members.length - 4);

  // FX pill : si l'user a une devise par défaut ≠ devise du groupe,
  // on affiche une pill discrète "EUR · 1 EUR = 655 XAF" (taux indicatif).
  const showFxPill =
    myMemberCurrency && myMemberCurrency !== currency;

  const isPositive = myNet > 0;
  const isNegative = myNet < 0;
  const balanceColor = isPositive
    ? "var(--v45-emerald, #4F8E6E)"
    : isNegative
      ? "var(--v45-terracotta, #9F4628)"
      : "var(--cocoa, #2B1F15)";

  return (
    <section
      style={{
        position: "relative",
        padding: "18px 18px 20px",
        borderRadius: 18,
        background: "var(--paper, #FFFFFF)",
        border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(43,31,21,0.04)",
      }}
    >
      {/* Halo saffron-pale en arrière-plan (touche signature V45) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -90,
          right: -90,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, var(--v45-saffron-pale, #F6E8C5) 0%, transparent 70%)",
          opacity: 0.55,
          pointerEvents: "none",
        }}
      />

      {/* Identité groupe : icône + nom + bouton settings */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            background: "var(--v45-saffron-pale, #F6E8C5)",
            border: "1px solid var(--v45-saffron-soft, #E8C988)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--v45-saffron, #C58A2E)",
            flexShrink: 0,
          }}
        >
          <GroupTypeIcon type={groupTypeKey} size={18} />
        </span>
        <h2
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 19,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            margin: 0,
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {group.name}
        </h2>
        <Link
          href={`/dashboard/groups/${groupId}/settings`}
          aria-label={t("group.settings") || "Paramètres"}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "var(--ivory, #FBF6EC)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
            color: "var(--cocoa-mute, #A99580)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            touchAction: "manipulation",
          }}
        >
          <Icon name="settings" size={16} strokeWidth={1.8} />
        </Link>
      </div>

      {/* Avatar stack overlap (4 max + count) */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {stackMembers.map((m, idx) => (
            <div
              key={m.id}
              style={{
                marginLeft: idx === 0 ? 0 : -8,
                zIndex: stackMembers.length - idx,
                // Anneau blanc autour de l'avatar pour le détacher du suivant
                padding: 2,
                borderRadius: "50%",
                background: "var(--paper, #FFFFFF)",
              }}
            >
              <AvatarColored
                userId={m.user.id}
                initials={m.user.displayName}
                photoUrl={m.user.avatar}
                size={28}
                meTag={false}
              />
            </div>
          ))}
          {overflow > 0 && (
            <div
              style={{
                marginLeft: -8,
                zIndex: 0,
                padding: 2,
                borderRadius: "50%",
                background: "var(--paper, #FFFFFF)",
              }}
            >
              <div
                aria-label={t("group.moreMembers", { count: String(overflow) }) || `+${overflow} autres`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--ivory-2, #F4ECD8)",
                  border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
                  color: "var(--cocoa-mute, #A99580)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                +{overflow}
              </div>
            </div>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            color: "var(--cocoa-mute, #A99580)",
            letterSpacing: 0.3,
          }}
        >
          {members.length} {members.length > 1 ? "membres" : "membre"}
        </span>
      </div>

      {/* Solde TOI — label discret + chiffre Cormorant grand vert/rouge */}
      <div
        style={{
          position: "relative",
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--cocoa-mute, #A99580)",
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {t("group.myBalance") || "Mon solde"}
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span
          className="bmd-num"
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 38,
            fontWeight: 600,
            lineHeight: 1,
            color: balanceColor,
            fontVariantNumeric: "tabular-nums",
            overflowWrap: "anywhere",
          }}
        >
          {isPositive ? "+" : isNegative ? "−" : ""}
          {Math.abs(myNet).toLocaleString("fr-FR", {
            minimumFractionDigits: ["XAF", "XOF"].includes(currency) ? 0 : 2,
            maximumFractionDigits: ["XAF", "XOF"].includes(currency) ? 0 : 2,
          })}
        </span>
        <span
          style={{
            fontSize: 14,
            color: "var(--v45-saffron, #C58A2E)",
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          {currency}
        </span>
        {showFxPill && (
          <span
            aria-label={t("group.fxBaseCurrency") || "Devise membre"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 9px",
              borderRadius: 999,
              background: "var(--v45-saffron-pale, #F6E8C5)",
              border: "1px solid var(--v45-saffron-soft, #E8C988)",
              color: "var(--v45-saffron, #C58A2E)",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              marginLeft: 4,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Icon name="globe" size={11} strokeWidth={2} />
            FX {myMemberCurrency}
          </span>
        )}
      </div>
      <div
        style={{
          position: "relative",
          fontSize: 12,
          color: "var(--cocoa-soft, #6B5B47)",
          marginTop: 6,
          lineHeight: 1.4,
        }}
      >
        {isPositive
          ? t("group.groupOwesYou") || "Le groupe te doit"
          : isNegative
            ? t("group.youOweTheGroup") || "Tu dois au groupe"
            : /* V142 — Phrase chaleureuse au lieu d'un "zéro" froid */
              t("group.allSettledZero") ||
              "Tu es à jour avec ce groupe ✨"}
      </div>
    </section>
  );
}

/**
 * V80 — 4 tiles 2×2 navigation. La tile active (= correspond au `tab` courant
 * pour Dépenses/Soldes) est rendue en saffron-pale. Les tiles Tontine/Preuves
 * naviguent vers d'autres pages (ne sont jamais "actives" ici).
 */
function V45GroupTiles({
  tab,
  setTab,
  expensesCount,
  tontine,
  onTontineNav,
  onProofsNav,
  onFundsNav,
  fundsEnabled,
  formatAmount,
  t,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  expensesCount: number;
  // V128 — Objet tontine complet (résumé) ou null. Permet d'afficher un
  // mini-état lisible sur la tile (ex. « 50 € · Mensuel ») au lieu du
  // simple badge "+" qui disparaissait silencieusement après création
  // et donnait l'impression que la tontine était perdue.
  // V215.F2 — On lit désormais `group.tontines?.[0]` (relation 1-to-many
  // côté Prisma, mais filtrée à 1 max par le backend) et on aplatit ici
  // en `tontine | null` pour préserver la même API pour les tiles.
  tontine: NonNullable<Group["tontines"]>[number] | null;
  onTontineNav: () => void;
  onProofsNav: () => void;
  // V201 — Tile "Caisses Projet" optionnelle. Affichée seulement si le
  // kill switch global est ON (SiteConfig.projectFundsEnabled). Quand
  // OFF, le tile disparaît proprement (pas de placeholder mort).
  onFundsNav: () => void;
  fundsEnabled: boolean;
  formatAmount: (a: number | string, c: string) => string;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  // V128 — Mini-libellé d'état tontine (montant + fréquence). Statut
  // DRAFT/ACTIVE/COMPLETED/CANCELLED traduit en libellé court. Si pas
  // de tontine, on retombe sur le badge "+" historique.
  const tontineMicroState: string | null = (() => {
    if (!tontine) return null;
    const freqMap: Record<string, string> = {
      WEEKLY: t("tontine.freqWeekly") || "Hebdo",
      BIWEEKLY: t("tontine.freqBiweekly") || "Quinz.",
      MONTHLY: t("tontine.freqMonthly") || "Mensuel",
      QUARTERLY: t("tontine.freqQuarterly") || "Trim.",
    };
    const freqLabel = freqMap[tontine.frequency] || tontine.frequency;
    const amount = tontine.contributionAmount
      ? formatAmount(tontine.contributionAmount, tontine.currency)
      : null;
    const statusMap: Record<string, string> = {
      DRAFT: t("tontine.statusDraft") || "Brouillon",
      ACTIVE: t("tontine.statusActive") || "Active",
      COMPLETED: t("tontine.statusCompleted") || "Terminée",
      CANCELLED: t("tontine.statusCancelled") || "Annulée",
    };
    const statusLabel = statusMap[tontine.status] || tontine.status;
    // Pour DRAFT/CANCELLED on met juste le statut (pas de montant attractif).
    // Pour ACTIVE/COMPLETED on met montant · fréquence (info utile cycle en cours).
    if (tontine.status === "ACTIVE" && amount) return `${amount} · ${freqLabel}`;
    if (tontine.status === "COMPLETED" && amount) return `${amount} · ${statusLabel}`;
    return statusLabel;
  })();
  const tiles: Array<{
    key: string;
    label: string;
    icon: IconName;
    active: boolean;
    badge?: string;
    subtitle?: string;
    onClick: () => void;
  }> = [
    {
      key: "expenses",
      label: t("group.tabExpenses") || "Dépenses",
      icon: "receipt",
      active: tab === "expenses",
      badge: expensesCount > 0 ? String(expensesCount) : undefined,
      onClick: () => {
        haptic("tap");
        setTab("expenses");
      },
    },
    {
      key: "balance",
      label: t("group.tabBalance") || "Soldes",
      icon: "bar-chart-2",
      active: tab === "balance",
      onClick: () => {
        haptic("tap");
        setTab("balance");
      },
    },
    {
      key: "tontine",
      label: t("group.tabTontine") || "Tontine",
      icon: "rotate-cw",
      // V128 — La tile est "active visuellement" (fond saffron) quand une
      // tontine existe — signe non-ambigu que quelque chose vit derrière.
      active: Boolean(tontine?.id),
      // V128 — Si pas de tontine : badge "+" pour inviter à créer. Sinon
      // pas de badge (le subtitle prend le relais).
      badge: tontine?.id ? undefined : t("group.tontineNew") || "+",
      subtitle: tontineMicroState ?? undefined,
      onClick: () => {
        haptic("tap");
        onTontineNav();
      },
    },
    {
      key: "proofs",
      label: t("group.tabProofs") || "Preuves",
      icon: "paperclip",
      active: false,
      onClick: () => {
        haptic("tap");
        onProofsNav();
      },
    },
    // V201 — Tile "Caisses" : visible uniquement si le module est activé
    // côté SiteConfig (kill switch). Sinon le tile n'apparaît pas et la
    // grille reste cohérente (4 tiles en 2×2).
    ...(fundsEnabled
      ? [
          {
            key: "funds",
            label: t("group.tabFunds") || "Caisses",
            // Réutilise "gift" du registry V45 (pas d'icône dédiée fund/coins
            // suffisamment distincte ; "gift" connote bien la cagnotte solidaire).
            icon: "gift" as IconName,
            active: false,
            onClick: () => {
              haptic("tap");
              onFundsNav();
            },
          },
        ]
      : []),
  ];

  return (
    <section
      role="tablist"
      aria-label={t("group.viewsLabel") || "Vues du groupe"}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
      }}
    >
      {tiles.map((tile) => (
        <button
          key={tile.key}
          type="button"
          role="tab"
          aria-selected={tile.active}
          onClick={tile.onClick}
          className="bmd-tap"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 14,
            minHeight: 92,
            padding: "14px 14px 12px",
            borderRadius: 16,
            background: tile.active
              ? "var(--v45-saffron-pale, #F6E8C5)"
              : "var(--paper, #FFFFFF)",
            border: tile.active
              ? "1px solid var(--v45-saffron-soft, #E8C988)"
              : "1px solid var(--v45-line, rgba(43,31,21,0.08))",
            color: "var(--cocoa, #2B1F15)",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            transition: "background 160ms ease, border-color 160ms ease",
            boxShadow: tile.active
              ? "0 2px 8px rgba(197,138,46,0.12)"
              : "0 1px 3px rgba(43,31,21,0.04)",
          }}
        >
          {/* Icône + badge (top row) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: tile.active
                  ? "var(--paper, #FFFFFF)"
                  : "var(--ivory, #FBF6EC)",
                color: tile.active
                  ? "var(--v45-saffron, #C58A2E)"
                  : "var(--cocoa, #2B1F15)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={tile.icon} size={17} strokeWidth={1.9} />
            </span>
            {tile.badge && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 22,
                  height: 22,
                  padding: "0 7px",
                  borderRadius: 999,
                  background: tile.active
                    ? "var(--v45-saffron, #C58A2E)"
                    : "var(--cocoa, #2B1F15)",
                  color: tile.active
                    ? "var(--paper, #FFFFFF)"
                    : "var(--paper, #FFFFFF)",
                  fontSize: 11,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: 0.2,
                }}
              >
                {tile.badge}
              </span>
            )}
          </div>
          {/* Label + subtitle (bottom row). V128 — subtitle expose le
              mini-état de la tile (ex. tontine active : « 50 € · Mensuel »
              ou « Active » pour DRAFT). Affiché en saffron petit corps
              sous le label, fortement lisible. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 0,
              width: "100%",
            }}
          >
            <span
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 0.2,
                color: "var(--cocoa, #2B1F15)",
              }}
            >
              {tile.label}
            </span>
            {tile.subtitle && (
              <span
                className="bmd-num"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: tile.active
                    ? "var(--v45-saffron, #C58A2E)"
                    : "var(--cocoa-soft, #6B5B47)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                  maxWidth: "100%",
                }}
              >
                {tile.subtitle}
              </span>
            )}
          </div>
        </button>
      ))}
    </section>
  );
}

// ============ ICONS (SVG outlined, banking style) ============

function IconExpense() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconTontine() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  );
}
function IconInvite() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}
function IconSettle() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12l-4-4v3H3v2h14v3l4-4z" />
    </svg>
  );
}
