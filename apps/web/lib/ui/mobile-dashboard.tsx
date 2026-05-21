"use client";

/**
 * <MobileDashboard> · Vue mobile native du dashboard (spec §8.5, maquette).
 *
 * Inspirée des apps bancaires/trading :
 *  - Salutation chaleureuse en gros (Cormorant Garamond)
 *  - Carte solde principale plein écran (devise utilisateur, conversion FX)
 *  - Quick actions horizontales scrollables (icônes pleines)
 *  - Liste de groupes type "feed" verticale
 *  - CTA flottant central via le FAB de MobileShell
 */

import Link from "next/link";
import { useEffect, useRef, useState, memo } from "react";
import { api, isUnauthorized, clearToken } from "../api-client";
import { useRouter } from "next/navigation";
import { useCurrency } from "../currency-provider";
import { SubscriptionBanner } from "./subscription-banner";
import { OcrCounter } from "./ocr-counter";
import { DashboardEmptyState } from "./dashboard-empty-state";
// V52.H1 — Wizard nouveau groupe V45 branché en fallback si le parent ne
// passe pas de callback (sheet local 2-étapes type + détails).
import { MobileCreateGroupSheet } from "./mobile-create-group-sheet";
// V148.D — Sheet de choix Groupe / Reconnaissance de dette
import { CreateChoiceSheet } from "./create-choice-sheet";
// V56 — Sheet relance créanciers (IA personnalisée par tone + locale)
// V58 — Sheet inviter amis (Web Share API + copy + lien)
import dynamic from "next/dynamic";
const MobileReminderSheet = dynamic(
  () =>
    import("./mobile-reminder-sheet").then((m) => ({
      default: m.MobileReminderSheet,
    })),
  { ssr: false },
);
const MobileInviteFriendsSheet = dynamic(
  () =>
    import("./mobile-invite-friends-sheet").then((m) => ({
      default: m.MobileInviteFriendsSheet,
    })),
  { ssr: false },
);
import {
  SkeletonGroupList,
  SkeletonHeroCard,
  SkeletonStyles,
} from "./skeleton";
import { useT } from "../i18n/app-strings";
import {
  prefetchBatch,
  prewarmGroupApi,
  prewarmProfileApi,
} from "../use-prefetch";
// V52.B2 — Icon registry V45 (remplace les emojis 📊 ✨ 🎁 💳 🌍 💱 🪙 🏠 ✈️ 🎉 ⚽ ⛪ 👥 👋
// par SVG outline 1.5px stroke. Cf. AUDIT-V45-VS-PROD.md écran 2 Dashboard.)
import { Icon, type IconName } from "./icons";
import { SegmentedControl } from "./segmented-control";
import { haptic } from "../platform";
import { useMyEvents } from "../use-realtime";
import { usePullToRefresh } from "../use-pull-to-refresh";
import { PullIndicator } from "./pull-indicator";
import {
  PersonBalanceList,
  PersonBalanceDetailModal,
  type PersonBalanceItem,
} from "./person-balance-list";
import { CrossSettlementInbox } from "./cross-settlement-inbox";
// V171 — Onglets dashboard 3-states : Vue globale / Groupes / RDD
import { DashboardDebtsView } from "./dashboard-debts-view";
import { DashboardOverviewView } from "./dashboard-overview-view";

// V26 — partage la même clé localStorage que desktop-dashboard pour
// que la préférence soit cohérente entre les deux contextes.
const DASHBOARD_VIEW_KEY = "bmd_dashboard_view";
type DashboardView = "byGroup" | "byPerson";

// V171 — Onglet du dashboard : Vue globale / Groupes / RDD.
// Persistance pour qu'on retrouve le même onglet au reload.
const DASHBOARD_HUB_KEY = "bmd_dashboard_hub";
type DashboardHub = "ALL" | "GROUPS" | "DEBTS";

function loadDashboardHub(): DashboardHub {
  if (typeof window === "undefined") return "ALL";
  try {
    const v = window.localStorage.getItem(DASHBOARD_HUB_KEY);
    if (v === "GROUPS" || v === "DEBTS") return v;
  } catch {
    /* ignore */
  }
  return "ALL";
}

function saveDashboardHub(v: DashboardHub): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DASHBOARD_HUB_KEY, v);
  } catch {
    /* ignore */
  }
}

function loadDashboardView(): DashboardView {
  if (typeof window === "undefined") return "byGroup";
  try {
    const v = window.localStorage.getItem(DASHBOARD_VIEW_KEY);
    if (v === "byPerson") return "byPerson";
  } catch {
    /* ignore */
  }
  return "byGroup";
}

function saveDashboardView(v: DashboardView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DASHBOARD_VIEW_KEY, v);
  } catch {
    /* ignore */
  }
}

interface Group {
  id: string;
  name: string;
  type: string;
  defaultCurrency: string;
  membersCount: number;
  totalSpent: string;
  myNet: string;
}

interface GlobalBalance {
  net: string;
  owedToMe: string;
  iOwe: string;
  primaryCurrency: string;
  hasConversion?: boolean;
  /** V38 — détail par devise d'origine (clé = code ISO, valeur = {net,...}) */
  byCurrency?: Record<
    string,
    { net: string; owedToMe: string; iOwe: string }
  >;
  groupCount: number;
}

// V52.B2 — TYPE_VISUAL migré vers SVG outline via Icon registry.
// L'emoji est supprimé, remplacé par un `iconName` typé qui pointe vers
// le registry. Couleur conservée (utilisée comme accent du tile).
const TYPE_VISUAL: Record<string, { iconName: IconName; color: string }> = {
  TONTINE: { iconName: "coins", color: "#e8a33d" },
  COLOC: { iconName: "home", color: "#10b981" },
  TRAVEL: { iconName: "plane", color: "#5b6cff" },
  EVENT: { iconName: "party-popper", color: "#ec4899" },
  CLUB: { iconName: "users", color: "#3a2f5b" },
  PARISH: { iconName: "users", color: "#7c6e93" },
  GENERIC: { iconName: "folder", color: "#b54732" },
};

export function MobileDashboard({
  onCreate,
  onCreateWithType,
}: {
  onCreate?: () => void;
  onCreateWithType?: (type: string) => void;
} = {}) {
  const router = useRouter();
  const { code: userCurrency, formatAmount } = useCurrency();
  const t = useT();
  const greetingText = useGreeting();
  const [me, setMe] = useState<any>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [balance, setBalance] = useState<GlobalBalance | null>(null);
  const [loading, setLoading] = useState(true);
  // V55 — Lazy init depuis localStorage (évite double-render React StrictMode
  // qui pouvait écraser un tap juste après le mount). Plus de useEffect ici :
  // le state est immédiatement bon dès le 1er render côté client.
  const [view, setView] = useState<DashboardView>(() => loadDashboardView());
  // V171 — Onglet du dashboard (Vue globale / Groupes / RDD)
  const [hubTab, setHubTab] = useState<DashboardHub>(() => loadDashboardHub());
  const [selectedPerson, setSelectedPerson] =
    useState<PersonBalanceItem | null>(null);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  // V148.D — Sheet de choix "Créer" : groupe vs reconnaissance de dette
  const [createChoiceOpen, setCreateChoiceOpen] = useState(false);
  const [createSheetInitialType, setCreateSheetInitialType] = useState<
    "TONTINE" | "COLOC" | "TRAVEL" | "EVENT" | "OTHER" | undefined
  >(undefined);
  // V56 — Sheet relance créanciers
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  // V58 — Sheet inviter amis
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);

  function changeView(v: DashboardView) {
    // V56 — Early-return absolu si déjà dans le bon état. Évite re-render,
    // re-save localStorage et flash visuel du `:active` quand l'utilisateur
    // re-tape sur l'onglet déjà sélectionné.
    if (v === view) return;
    setView(v);
    saveDashboardView(v);
    haptic("tap");
  }

  // V171 — Switch d'onglet dashboard (Vue globale / Groupes / RDD)
  function changeHubTab(v: DashboardHub) {
    if (v === hubTab) return;
    setHubTab(v);
    saveDashboardHub(v);
    haptic("tap");
  }

  // Fonction de fetch réutilisée par mount initial + refresh SSE
  function fetchAll() {
    Promise.all([
      api.me(),
      api.listGroups(),
      api.getMyGlobalBalance().catch(() => null),
      // V164 — Récupère le flag ambassadeur/commercial pour afficher
      // conditionnellement le raccourci "Espace commercial" dans les shortcuts.
      api.getAmbassadorStatus().catch(() => null),
    ])
      .then(([meRes, groupsRes, balRes, ambRes]) => {
        setMe({
          ...meRes.user,
          isAmbassador: ambRes?.isAmbassador ?? false,
          isCommercialAgreed: ambRes?.isCommercialAgreed ?? false,
        });
        setGroups(groupsRes as Group[]);
        setBalance(balRes as GlobalBalance | null);
        setLoading(false);
        // Prefetch les routes des groupes au mount → navigation instantanée
        const urls = (groupsRes as Group[])
          .slice(0, 5)
          .map((g) => `/dashboard/groups/${g.id}`);
        if (urls.length > 0) prefetchBatch(urls);
      })
      .catch((e) => {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setLoading(false);
      });
  }

  // V118.D — Re-fetch au mount + quand la devise change réellement.
  //
  // Avant : à chaque changement de `userCurrency`, on relançait 3
  // fetches. Or `CurrencyProvider` traverse 2 valeurs pendant son
  // init (defaultCurrency local → puis api.me().defaultCurrency au
  // settle), ce qui causait un double-fetch dashboard au cold start.
  // On utilise un ref pour ignorer le premier changement post-mount
  // (= la propagation initiale du provider), et n'invalider que sur
  // un VRAI changement de devise utilisateur ensuite.
  const initialCurrencyRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialCurrencyRef.current === null) {
      initialCurrencyRef.current = userCurrency;
      fetchAll();
      return;
    }
    if (initialCurrencyRef.current === userCurrency) {
      return; // valeur identique (premier settle du provider) → skip
    }
    initialCurrencyRef.current = userCurrency;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, userCurrency]);

  // V58 — Prefetch agressif des routes principales au mount du dashboard.
  // Quand l'user tape sur le hero solde / stats / affiliate / plans, la page
  // est déjà cachée → navigation perçue instantanée.
  // V119.#6 — On préchauffe aussi les APIs profil (me + listGroups) en
  // idle pour que l'ouverture du profil soit instantanée (gain ~300-500 ms).
  useEffect(() => {
    try {
      router.prefetch("/dashboard/stats");
      router.prefetch("/dashboard/affiliate");
      router.prefetch("/dashboard/plans");
      router.prefetch("/dashboard/profile");
      // V175.L — Prefetch bottom-nav routes critiques (groupes + dettes).
      // Couvre la totalité des destinations du bottom-nav mobile pour offrir
      // une navigation instantanée perçue (TTI ~ 0 ms sur switch d'onglet).
      router.prefetch("/dashboard/groups");
      router.prefetch("/dashboard/debts");
      prewarmProfileApi();
    } catch {
      /* ignore — prefetch est best-effort */
    }
  }, [router]);

  // SSE temps réel : quand un membre quelque part fait une action qui
  // change ma balance (paiement, dépense, accept swap…), le serveur push
  // l'event et le dashboard se met à jour automatiquement. UX vivante.
  useMyEvents((event) => {
    const triggers = [
      "balance.changed",
      "expense.created",
      "settlement.created",
      "settlement.confirmed",
      "member.joined",
      "swap.accepted",
      "debt-transfer.accepted",
    ];
    if (triggers.includes(event.kind)) {
      fetchAll();
    }
  });

  // Pull-to-refresh natif (mobile uniquement — désactivé sur desktop par
  // détection touch dans le hook). UX standard banking app.
  const { state: pullState, bindToScrollContainer } = usePullToRefresh({
    onRefresh: async () => {
      // Délai mini 600ms pour laisser le user voir le spinner même si
      // le fetch est ultra-rapide (sinon il flashe et on a l'impression
      // que rien ne s'est passé)
      await Promise.all([
        new Promise((r) => setTimeout(r, 600)),
        new Promise<void>((resolve) => {
          fetchAll();
          resolve();
        }),
      ]);
    },
  });

  // Branche le hook au document body (le scroll racine de l'app mobile).
  // Le ResponsiveShell wrap déjà tout dans un container scrollable.
  useEffect(() => {
    bindToScrollContainer(document.body);
  }, [bindToScrollContainer]);

  if (loading) {
    return (
      <div
        style={{
          padding: "8px 16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <SkeletonStyles />
        <SkeletonHeroCard />
        <SkeletonGroupList count={3} />
      </div>
    );
  }

  const net = balance ? parseFloat(balance.net) : 0;
  const owedToMe = balance ? parseFloat(balance.owedToMe) : 0;
  const iOwe = balance ? parseFloat(balance.iOwe) : 0;
  const currency = balance?.primaryCurrency ?? "EUR";

  return (
    <div style={{ padding: "0 14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Pull-to-refresh indicator — apparaît quand l'utilisateur tire
          la liste vers le bas, disparaît au release. Mobile only. */}
      <PullIndicator {...pullState} />

      {/* Bandeau d'état d'abonnement (silencieux si ACTIVE) */}
      <SubscriptionBanner />

      {/* X4 — Inbox cross-settlements en attente. Auto-hidden si vide. */}
      <CrossSettlementInbox variant="compact" />

      {/* V171.B — SegmentedControl 3 onglets dashboard : Vue globale / Groupes / RDD.
          Persistance localStorage pour retrouver l'onglet au reload. */}
      <SegmentedControl<DashboardHub>
        value={hubTab}
        onChange={changeHubTab}
        ariaLabel={t("dashboard.hubToggleAria") || "Onglets dashboard"}
        segments={[
          { value: "ALL", label: t("dashboard.hub.all") || "Vue globale" },
          { value: "GROUPS", label: t("dashboard.hub.groups") || "Groupes" },
          { value: "DEBTS", label: t("dashboard.hub.debts") || "RDD" },
        ]}
      />

      {/* V171.C — Vue globale (overview combiné groupes + RDD) */}
      {hubTab === "ALL" && (
        <DashboardOverviewView
          balance={balance}
          groupCount={groups.length}
        />
      )}

      {/* V171.D — Vue dédiée RDD */}
      {hubTab === "DEBTS" && (
        <DashboardDebtsView
          onCreate={() => router.push("/dashboard/debts/new")}
        />
      )}

      {/* === Vue Groupes (mode classique, le rendu historique du dashboard) === */}
      {hubTab === "GROUPS" && (
        <>
      {/* V54 — Hero solde V45-LIGHT (palette claire imposée par défaut,
          peu importe le thème global) avec salutation FUSIONNÉE dedans pour
          combler le vide en haut + densifier sur 1 écran.
          Couleurs hardcodées V45 ivory/cocoa/saffron-pale → toujours light. */}
      <Link
        href="/dashboard/stats"
        prefetch={true}
        className="bmd-tap bmd-no-scale"
        onPointerDown={() => {
          try {
            router.prefetch("/dashboard/stats");
            haptic("tap");
          } catch {
            /* ignore */
          }
        }}
        style={{
          display: "block",
          textDecoration: "none",
          color: "inherit",
          background:
            "linear-gradient(135deg, #FBF6EC 0%, #F6E8C5 60%, #F4ECD8 100%)",
          borderRadius: 20,
          padding: "14px 18px 16px",
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(197,138,46,0.20)",
          boxShadow: "0 6px 20px rgba(43,31,21,0.08), 0 1px 2px rgba(43,31,21,0.06)",
        }}
      >
        {/* Halo saffron V45 — chaud mais discret sur fond clair */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(197,138,46,0.18), transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Ligne du haut : salutation à gauche + badge statut à droite.
            Compacte pour gagner de la place verticale. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                color: "#C58A2E",
                letterSpacing: 1.4,
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 2,
                lineHeight: 1,
              }}
            >
              {greetingText}
            </div>
            <h2
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 20,
                fontWeight: 700,
                color: "#2B1F15",
                margin: 0,
                lineHeight: 1.1,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {me?.displayName ? (
                <>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {me.displayName.split(" ")[0]}
                  </span>
                  <Icon
                    name="sparkles"
                    size={16}
                    color="#C58A2E"
                    strokeWidth={1.8}
                  />
                </>
              ) : (
                t("dashboard.greetingShort", { name: "" }).trim()
              )}
            </h2>
          </div>
          <div
            style={{
              fontSize: 9.5,
              color:
                net > 0
                  ? "#1F7A57"
                  : net < 0
                    ? "#9F4628"
                    : "#6B5A47",
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: 999,
              background:
                net > 0
                  ? "rgba(31,122,87,0.10)"
                  : net < 0
                    ? "rgba(159,70,40,0.10)"
                    : "rgba(43,31,21,0.06)",
              border: `1px solid ${
                net > 0
                  ? "rgba(31,122,87,0.28)"
                  : net < 0
                    ? "rgba(159,70,40,0.28)"
                    : "rgba(43,31,21,0.12)"
              }`,
              letterSpacing: 0.4,
              flexShrink: 0,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {net > 0
              ? t("dashboard.balanceCreditor")
              : net < 0
                ? t("dashboard.balanceDebtor")
                : t("dashboard.balanceBalanced")}
          </div>
        </div>

        {/* Label "mon solde" — discret */}
        <div
          style={{
            position: "relative",
            fontSize: 10,
            color: "#6B5A47",
            letterSpacing: 1.4,
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 2,
            marginTop: 4,
          }}
        >
          {t("dashboard.balance")}
        </div>

        {/* Chiffre principal — V54 .bmd-num pour police unifiée banking */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-start",
            gap: 4,
            color:
              net > 0
                ? "#1F7A57"
                : net < 0
                  ? "#9F4628"
                  : "#2B1F15",
          }}
        >
          <span
            className="bmd-num"
            style={{
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.3,
              opacity: 0.9,
            }}
          >
            {net >= 0 ? "+" : "−"}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
            }}
          >
            {(() => {
              const abs = Math.abs(net);
              const intPart = Math.floor(abs);
              const decimals = noDecimals(currency)
                ? null
                : abs.toFixed(2).split(".")[1] ?? "00";
              return (
                <>
                  <span
                    className="bmd-num bmd-hero-amount"
                    style={{
                      // Compacté : clamp 28 → 44 (avant 32 → 56) pour tenir
                      // sur 1 écran et garder de la place pour le reste.
                      fontSize: "clamp(28px, 10vw, 44px)",
                      fontWeight: 800,
                      lineHeight: 1,
                      letterSpacing: -1,
                      overflowWrap: "anywhere",
                      minWidth: 0,
                    }}
                  >
                    {intPart.toLocaleString("fr-FR")}
                  </span>
                  {decimals !== null && (
                    <span
                      className="bmd-num"
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        opacity: 0.75,
                        marginLeft: 2,
                      }}
                    >
                      ,{decimals}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
          <span
            className="bmd-num"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#C58A2E",
              marginLeft: 6,
              marginTop: 6,
              letterSpacing: 0.4,
            }}
          >
            {currency}
          </span>
        </div>

        {/* Mini-bars équilibre on me doit / je dois — visualisation
            instantanée du ratio des deux côtés. V45-light. */}
        {(owedToMe > 0 || iOwe > 0) && (
          <BalanceVisual
            owedToMe={owedToMe}
            iOwe={iOwe}
            currency={currency}
          />
        )}

        {balance?.hasConversion && (
          <div
            style={{
              position: "relative",
              marginTop: 8,
              fontSize: 9.5,
              color: "#6B5A47",
              opacity: 0.85,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon
                name="repeat"
                size={11}
                color="currentColor"
                strokeWidth={1.6}
              />
              <span>Converti dans ta devise · taux du jour</span>
            </div>
            <FxRatesHint
              byCurrency={balance.byCurrency ?? {}}
              userCurrency={currency}
            />
          </div>
        )}
      </Link>

      {/* V55 — 5 raccourcis demande Fabrice :
            1) Créer un nouveau groupe (ouvre le wizard MobileCreateGroupSheet)
            2) Parrainage
            3) Statistiques
            4) Régler ses dettes (active la vue par personne + scroll)
            5) Inviter des amis (Web Share API native) */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
          <h3
            style={{
              fontSize: 10.5,
              color: "var(--muted, #8a7b6b)",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontWeight: 700,
              margin: 0,
            }}
          >
            {t("dashboard.shortcuts")}
          </h3>
          <OcrCounter variant="badge" />
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            paddingBottom: 2,
            scrollbarWidth: "none",
          }}
        >
          {/* V165 — Ordre raccourcis demande Fabrice :
              1) Créer (groupe ou RDD) — saffron, emphasis
              2) Inviter des amis (sheet)
              3) Parrainer
              4) Régler les dettes (vue par personne + scroll)
              5) Relancer (sheet 2 onglets Groupes / RDD)
              + Espace commercial à la fin si ambassadeur/commercial agréé.
              Stats retiré des raccourcis (reste accessible bottom-nav). */}

          {/* 1) Créer */}
          <QuickAction
            onClick={() => setCreateChoiceOpen(true)}
            iconName="plus"
            label={t("dashboard.create") || "Créer"}
            color="#C58A2E"
            emphasis
          />

          {/* 2) Inviter des amis (V58 — sheet propre) */}
          <QuickAction
            onClick={() => {
              setInviteSheetOpen(true);
            }}
            iconName="share-2"
            label={t("dashboard.inviteFriends")}
            color="#7c6e93"
          />

          {/* 3) Parrainer */}
          <QuickAction
            href="/dashboard/affiliate?from=/dashboard"
            iconName="gift"
            label={t("dashboard.referrals")}
            color="#10b981"
          />

          {/* 4) Régler les dettes (active vue byPerson + scroll smooth) */}
          <QuickAction
            onClick={() => {
              changeView("byPerson");
              setTimeout(() => {
                document
                  .querySelector("[data-bmd-settle-anchor]")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 100);
            }}
            iconName="coins"
            label={t("dashboard.settleDebts")}
            color="#b54732"
          />

          {/* 5) Relancer (V165.E — sheet 2 onglets Groupes / RDD) */}
          <QuickAction
            onClick={() => {
              setReminderSheetOpen(true);
            }}
            iconName="bell"
            label={t("dashboard.remindDebtors")}
            color="#d9714a"
          />

          {/* V164 — Espace commercial (en queue, conditionnel) */}
          {(me?.isAmbassador || me?.isCommercialAgreed) && (
            <QuickAction
              href="/dashboard/commercial?from=/dashboard"
              iconName="gift"
              label={
                me?.isCommercialAgreed
                  ? t("dashboard.commercialAgreed") || "Espace commercial"
                  : t("dashboard.ambassadorSpace") || "Mon réseau"
              }
              color="#854F0B"
            />
          )}
        </div>
      </div>

      {/* Liste des groupes / Vue par personne */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <h3
            style={{
              fontSize: 11,
              color: "var(--muted, #8a7b6b)",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontWeight: 700,
              margin: 0,
            }}
          >
            {view === "byGroup"
              ? `${t("dashboard.myGroups")} (${groups.length})`
              : t("dashboard.myCounterparties")}
          </h3>
        </div>

        {/* V59 — Composant SegmentedControl réutilisable (cohérence
            visuelle + invariant XOR garanti partout dans l'app). */}
        <div style={{ marginBottom: 10 }}>
          <SegmentedControl<DashboardView>
            value={view}
            onChange={changeView}
            ariaLabel={t("dashboard.viewToggleAria")}
            segments={[
              { value: "byGroup", label: t("dashboard.viewByGroup") },
              { value: "byPerson", label: t("dashboard.viewByPerson") },
            ]}
          />
        </div>

        {view === "byPerson" ? (
          <PersonBalanceList onSelect={setSelectedPerson} />
        ) : groups.length === 0 ? (
          <DashboardEmptyState
            onCreate={() => {
              // V52.H1 — Si pas de callback parent, ouvre le sheet wizard V45.
              if (onCreate) onCreate();
              else setCreateSheetInitialType(undefined);
              setCreateSheetOpen(true);
            }}
            onCreateWithType={(type) => {
              if (onCreateWithType) onCreateWithType(type);
              else {
                setCreateSheetInitialType(
                  type as "TONTINE" | "COLOC" | "TRAVEL" | "EVENT" | "OTHER",
                );
                setCreateSheetOpen(true);
              }
            }}
          />
        ) : (
          /* V52.D5 — Carousel horizontal V45 (scroll-snap-type x mandatory).
             Cards 240px wide × auto-height pour exposer plusieurs groupes
             en un coup d'œil + swipe natural. Sur web large, le scroll
             vertical reste possible si overflow > viewport. */
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0 -16px",
              display: "flex",
              flexDirection: "row",
              gap: 12,
              overflowX: "auto",
              overflowY: "hidden",
              scrollSnapType: "x mandatory",
              paddingLeft: 16,
              paddingRight: 16,
              paddingBottom: 4,
              scrollbarWidth: "none",
            }}
          >
            {groups.map((g) => {
              const visual = TYPE_VISUAL[g.type] ?? TYPE_VISUAL.GENERIC!;
              const myNet = parseFloat(g.myNet);
              return (
                <li
                  key={g.id}
                  style={{
                    /* V52.D5 — Largeur fixe + scroll-snap pour carousel V45 */
                    minWidth: 240,
                    maxWidth: 240,
                    scrollSnapAlign: "start",
                    flexShrink: 0,
                  }}
                >
                  <Link
                    href={`/dashboard/groups/${g.id}`}
                    prefetch
                    className="bmd-tap"
                    onTouchStart={() => {
                      prewarmGroupApi(g.id);
                      haptic("tap");
                    }}
                    onMouseEnter={() => prewarmGroupApi(g.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      padding: 14,
                      background: "rgba(244,228,193,0.03)",
                      border: "1px solid rgba(244,228,193,0.06)",
                      borderRadius: 14,
                      textDecoration: "none",
                      color: "var(--cream)",
                      height: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: `linear-gradient(135deg, ${visual.color}33, ${visual.color}11)`,
                        border: `1px solid ${visual.color}55`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        color: visual.color,
                      }}
                    >
                      {/* V52.B2 — SVG outline V45 remplace l'emoji type */}
                      <Icon
                        name={visual.iconName}
                        size={22}
                        color={visual.color}
                        strokeWidth={1.6}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--cream)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {g.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--muted, #8a7b6b)",
                          marginTop: 2,
                        }}
                      >
                        {g.membersCount} {t("group.members").toLowerCase()} ·{" "}
                        {/* Z2 — Conversion FX vers la devise utilisateur */}
                        {formatAmount(g.totalSpent, g.defaultCurrency)}
                      </div>
                    </div>
                    <div
                      className="bmd-num"
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color:
                          myNet > 0
                            ? "#7DC59E"
                            : myNet < 0
                              ? "#D9714A"
                              : "var(--muted)",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {myNet > 0 ? "+" : myNet < 0 ? "−" : ""}
                      {/* Z2 — Conversion FX du myNet vers devise utilisateur */}
                      {formatAmount(
                        Math.abs(myNet).toString(),
                        g.defaultCurrency,
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
        </>
      )}

      {/* V26 — Modal drill-down par personne (overlay full-screen sur mobile) */}
      <PersonBalanceDetailModal
        person={selectedPerson}
        primaryCurrency={balance?.primaryCurrency ?? "EUR"}
        onClose={() => setSelectedPerson(null)}
      />

      {/* V56 — Sheet relance créanciers (lazy via next/dynamic) */}
      <MobileReminderSheet
        open={reminderSheetOpen}
        onClose={() => setReminderSheetOpen(false)}
      />

      {/* V58 — Sheet inviter amis (Web Share API + lien copy) */}
      <MobileInviteFriendsSheet
        open={inviteSheetOpen}
        onClose={() => setInviteSheetOpen(false)}
      />

      {/* V148.D — Sheet de choix "Créer" : groupe vs reconnaissance de dette */}
      <CreateChoiceSheet
        open={createChoiceOpen}
        onClose={() => setCreateChoiceOpen(false)}
        onPickGroup={() => {
          setCreateChoiceOpen(false);
          setCreateSheetInitialType(undefined);
          if (onCreate) onCreate();
          else setCreateSheetOpen(true);
        }}
        onPickDebt={() => {
          setCreateChoiceOpen(false);
          router.push("/dashboard/debts/new");
        }}
      />

      {/* V52.H1 — Wizard nouveau groupe V45 (fallback si pas de callback parent).
          Au submit, créé le groupe via api.createGroup puis navigue vers la fiche
          du groupe (UX : on atterrit direct dans le nouveau groupe, prêt à
          ajouter une dépense). */}
      {/* V73.4 — Pas d'initialType : l'user démarre toujours par le choix
          du type (étape 1). Flow unifié partout dans l'app. */}
      <MobileCreateGroupSheet
        open={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        onCreate={async (data) => {
          const created = await api.createGroup({
            name: data.name,
            type: data.type,
            defaultCurrency: data.currency,
            // V111 · Propage le flag reçu fiscal coché dans le wizard.
            taxReceiptsEnabled: data.taxReceiptsEnabled,
          });
          setCreateSheetOpen(false);
          setCreateSheetInitialType(undefined);
          router.push(`/dashboard/groups/${created.id}`);
        }}
      />
    </div>
  );
}

// V185.A — `memo()` : BalanceCol est rendu plusieurs fois par devise (3-5
// devises sur un user multi-currency typique). Props primitives (string +
// number + boolean) → memo() évite re-render à chaque changement de state
// parent (hero balance toggle, etc.).
const BalanceCol = memo(function BalanceCol({
  label,
  value,
  currency,
  positive,
}: {
  label: string;
  value: number;
  currency: string;
  positive?: boolean;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 12,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1.2,
          color: "var(--cream-soft)",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 20,
          fontWeight: 700,
          color: positive ? "#7DC59E" : "#D9714A",
          lineHeight: 1.1,
        }}
      >
        {value.toLocaleString("fr-FR", {
          minimumFractionDigits: noDecimals(currency) ? 0 : 2,
          maximumFractionDigits: noDecimals(currency) ? 0 : 2,
        })}{" "}
        <span style={{ fontSize: 11, opacity: 0.7 }}>{currency}</span>
      </div>
    </div>
  );
});

/**
 * V52.B2 — QuickAction accepte maintenant `iconName` (IconName du registry)
 * en plus de l'ancienne prop `emoji` pour rétrocompat. Si `iconName` est
 * fourni, on rend un SVG outline V45 ; sinon on retombe sur l'emoji.
 *
 * Migration progressive : les nouveaux appels doivent passer `iconName`.
 */
/**
 * QuickAction · pavé raccourci tactile sur le dashboard mobile.
 *
 * V55 — Supporte 2 modes :
 *  - Mode lien : prop `href` → rend un `<Link>` Next.js (prefetch auto)
 *  - Mode action : prop `onClick` → rend un `<button>` qui exécute un
 *    handler (ouverture de sheet, navigation programmatique, partage natif…)
 *
 * Exactement une des deux props doit être fournie (xor au niveau types).
 */
type QuickActionProps = {
  emoji?: string;
  iconName?: IconName;
  label: string;
  color: string;
  /** V148.D — Met le bouton en évidence (premier raccourci "Créer") */
  emphasis?: boolean;
} & (
  | { href: string; onClick?: never }
  | { onClick: () => void | Promise<void>; href?: never }
);

function QuickAction(props: QuickActionProps) {
  const { emoji, iconName, label, color, emphasis } = props;
  const router = useRouter();
  // V57 — Prefetch dès que l'utilisateur APPROCHE le bouton (pointerEnter)
  // ET au pointerDown (sécurité touchscreen). Double-couche pour avoir le
  // HTML+chunks de la page cible en cache avant même le tap.
  function prefetchTarget() {
    if ("href" in props && props.href) {
      try {
        const href = props.href.split("?")[0] ?? props.href;
        router.prefetch(href);
      } catch {
        /* ignore */
      }
    }
  }
  function onTapStart() {
    prefetchTarget();
    // V57 — Haptic feedback iOS-style instantané au touch.
    // Donne du tactile = perception "smooth" même si la nav prend 50ms.
    haptic("tap");
  }
  const shared = {
    className: "bmd-tap",
    onPointerDown: onTapStart,
    onPointerEnter: prefetchTarget,
    style: {
      display: "flex" as const,
      flexDirection: "column" as const,
      alignItems: "center" as const,
      gap: 6,
      padding: "10px 8px",
      minWidth: 76,
      // V148.D — Mode "emphasis" : fond saffron-pale + bordure saffron solide
      // pour mettre le raccourci "Créer" en avant des autres.
      background: emphasis
        ? `linear-gradient(135deg, ${color}33, ${color}1A)`
        : "rgba(244,228,193,0.03)",
      border: emphasis
        ? `1.5px solid ${color}AA`
        : "1px solid rgba(244,228,193,0.06)",
      borderRadius: 12,
      textDecoration: "none" as const,
      color: "var(--cream)",
      scrollSnapAlign: "start" as const,
      fontFamily: "inherit",
      cursor: "pointer" as const,
      transition: "background 0.12s ease, transform 0.08s ease",
    },
  };
  const inner = (
    <>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: `linear-gradient(135deg, ${color}33, ${color}11)`,
          border: `1px solid ${color}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          color,
        }}
      >
        {iconName ? (
          <Icon name={iconName} size={18} color={color} strokeWidth={1.6} />
        ) : (
          emoji
        )}
      </div>
      <span
        style={{
          fontSize: 10.5,
          // V148.D — Label en gras pour emphasis (Créer)
          fontWeight: emphasis ? 800 : 600,
          color: emphasis ? color : "var(--cream-soft)",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
    </>
  );
  if ("href" in props && props.href) {
    return (
      <Link href={props.href} prefetch={true} {...shared}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        if ("onClick" in props && props.onClick) props.onClick();
      }}
      {...shared}
    >
      {inner}
    </button>
  );
}

function useGreeting(): string {
  const t = useT();
  const h = new Date().getHours();
  if (h < 6) return t("time.night");
  if (h < 12) return t("time.morning");
  if (h < 18) return t("time.afternoon");
  return t("time.evening");
}

function noDecimals(currency: string): boolean {
  return ["XAF", "XOF", "KES", "TZS", "UGX", "RWF", "CDF"].includes(currency);
}

/**
 * Visualisation graphique de l'équilibre on-me-doit / je-dois sous le
 * gros chiffre du hero. Inspiré des barres de répartition Wise/Revolut :
 * deux barres horizontales proportionnelles, vert pour ce qu'on me doit,
 * orange pour ce que je dois. Si les deux côtés sont à 0, ne rend rien.
 */
function BalanceVisual({
  owedToMe,
  iOwe,
  currency,
}: {
  owedToMe: number;
  iOwe: number;
  currency: string;
}) {
  const t = useT();
  const total = owedToMe + iOwe;
  const owedPct = total > 0 ? (owedToMe / total) * 100 : 50;
  const owePct = total > 0 ? (iOwe / total) * 100 : 50;
  const decimals = noDecimals(currency) ? 0 : 0;
  const fmt = (n: number) =>
    n.toLocaleString("fr-FR", { maximumFractionDigits: decimals });
  // V142 — Cas spécial "tout équilibré" : remplacer "On me doit 0 / Je dois 0"
  // par une phrase personnelle et chaleureuse plutôt que des chiffres froids.
  const bothZero = owedToMe === 0 && iOwe === 0;
  if (bothZero) {
    return (
      <div
        style={{
          position: "relative",
          marginTop: 10,
          textAlign: "center",
          padding: "10px 12px",
          borderRadius: 12,
          background:
            "linear-gradient(135deg, rgba(31,122,87,0.08), rgba(197,138,46,0.06))",
          border: "1px solid rgba(31,122,87,0.18)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#1F7A57",
            lineHeight: 1.2,
          }}
        >
          {t("dashboard.allSettled") || "Tout est équilibré 🌿"}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#6B5A47",
            marginTop: 3,
            fontStyle: "italic",
          }}
        >
          {t("dashboard.allSettledHint") || "Tu es à jour avec tout le monde"}
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: "relative", marginTop: 10 }}>
      {/* 2 barres juxtaposées — V45-light (emerald + terracotta V45) */}
      <div
        style={{
          display: "flex",
          gap: 3,
          height: 5,
          marginBottom: 6,
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        {owedToMe > 0 && (
          <div
            style={{
              width: `${owedPct}%`,
              background:
                "linear-gradient(90deg, rgba(79,142,110,0.7), #1F7A57)",
              borderRadius: 999,
              transition: "width 0.4s",
            }}
          />
        )}
        {iOwe > 0 && (
          <div
            style={{
              width: `${owePct}%`,
              background:
                "linear-gradient(90deg, #9F4628, rgba(194,86,61,0.7))",
              borderRadius: 999,
              transition: "width 0.4s",
            }}
          />
        )}
      </div>
      {/* Légende */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10.5,
          color: "#6B5A47",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#1F7A57",
              flexShrink: 0,
            }}
          />
          {/* V142 — Si rien dû, phrase au lieu de "On me doit 0" */}
          {owedToMe === 0 ? (
            <span style={{ fontStyle: "italic", color: "#6B5A47" }}>
              {t("dashboard.owedToMeZero") ||
                "Personne ne te doit rien 😔"}
            </span>
          ) : (
            <span>
              {t("dashboard.owedToMe")}{" "}
              <strong className="bmd-num" style={{ color: "#1F7A57" }}>
                {fmt(owedToMe)}
              </strong>
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* V142 — Si rien dû, phrase au lieu de "Je dois 0" */}
          {iOwe === 0 ? (
            <span style={{ fontStyle: "italic", color: "#6B5A47" }}>
              {t("dashboard.iOweZero") || "Tu ne dois rien à personne 😊"}
            </span>
          ) : (
            <span>
              {t("dashboard.iOwe")}{" "}
              <strong className="bmd-num" style={{ color: "#9F4628" }}>
                {fmt(iOwe)}
              </strong>
            </span>
          )}
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#9F4628",
              flexShrink: 0,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * V38 — Affiche le(s) taux de change appliqué(s) au hero solde global.
 *
 * Quand l'utilisateur a des soldes dans plusieurs devises, on convertit tout
 * dans sa devise par défaut côté serveur. Pour la transparence (= confiance
 * banking-style), on affiche les taux utilisés ici, ex : « 1 EUR = 655,95 XOF ».
 *
 * Sources des taux :
 *  - `useCurrency().convert(1, fromCcy)` → calcule 1 unité de la devise
 *    d'origine dans la devise utilisateur en utilisant le cache FX local
 *    (chargé via /fx-rates au boot du provider).
 *
 * Limite : on n'affiche que jusqu'à 2 taux pour ne pas surcharger le hero.
 * Si l'user a plus de devises, on liste les 2 plus importantes (= dominantes
 * en valeur absolue) et on ajoute « +N autres ».
 */
function FxRatesHint({
  byCurrency,
  userCurrency,
}: {
  byCurrency: Record<string, { net: string; owedToMe: string; iOwe: string }>;
  userCurrency: string;
}): JSX.Element | null {
  const { convert } = useCurrency();
  const userCcy = userCurrency.toUpperCase();

  // Filtre les devises étrangères (différentes de la devise utilisateur) et
  // qui ont effectivement un montant non nul.
  const foreign = Object.entries(byCurrency)
    .filter(([ccy, b]) => {
      if (ccy.toUpperCase() === userCcy) return false;
      const total =
        Math.abs(parseFloat(b.owedToMe)) + Math.abs(parseFloat(b.iOwe));
      return total > 0;
    })
    .map(([ccy, b]) => ({
      ccy: ccy.toUpperCase(),
      weight: Math.abs(parseFloat(b.owedToMe)) + Math.abs(parseFloat(b.iOwe)),
    }))
    .sort((a, b) => b.weight - a.weight);

  if (foreign.length === 0) return null;

  const visible = foreign.slice(0, 2);
  const remaining = foreign.length - visible.length;

  function formatRate(rate: number, target: string): string {
    // CFA et amis : pas de décimales nécessaires (taux > 100). EUR/USD : 4
    // décimales pour lisibilité.
    const zeroDec = new Set([
      "XAF",
      "XOF",
      "BIF",
      "RWF",
      "KMF",
      "JPY",
      "KRW",
      "VND",
    ]);
    const decimals = zeroDec.has(target) ? (rate >= 100 ? 0 : 2) : 4;
    return rate.toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "4px 10px",
        fontSize: 9.5,
        letterSpacing: 0.3,
        opacity: 0.85,
      }}
    >
      {visible.map(({ ccy }) => {
        const rate = convert(1, ccy);
        if (!rate || !Number.isFinite(rate) || rate === 0) return null;
        return (
          <span key={ccy} className="bmd-num">
            1 {ccy} = {formatRate(rate, userCcy)} {userCcy}
          </span>
        );
      })}
      {remaining > 0 && (
        <span style={{ opacity: 0.7 }}>+{remaining} autres</span>
      )}
    </div>
  );
}
