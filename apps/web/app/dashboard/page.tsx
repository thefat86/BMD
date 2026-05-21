"use client";

/**
 * /dashboard · Tableau de bord principal.
 *
 * Refonte spec §8 — Vues totalement séparées Mobile / Desktop :
 *  - Mobile (< 768px) : <MobileShell> + <MobileDashboard> (style app native)
 *  - Desktop (≥ 768px) : <DesktopShell> + <DesktopDashboard> (style portail)
 *
 * Les deux variantes consomment les mêmes données (api.me, api.listGroups,
 * api.getMyGlobalBalance) mais leur structure visuelle est complètement
 * différente : ce ne sont PAS deux versions responsives d'un même layout.
 *
 * La création de groupe est partagée : un modal commun (DialogProvider) est
 * piloté par le FAB mobile et par le bouton "+ Nouveau" du header desktop.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  ApiError,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../lib/api-client";
import { ResponsiveShell } from "../../lib/ui/responsive-shell";
import { MobileDashboard } from "../../lib/ui/mobile-dashboard";
import { DesktopDashboard } from "../../lib/ui/desktop-dashboard";
import { OnboardingTour } from "../../lib/ui/onboarding-tour";
// V178.C — Tour découverte spotlight au premier login (différent du
// OnboardingTour qui est une modale plein écran). Voir discovery-tour.tsx.
import {
  DiscoveryTour,
  DEFAULT_DISCOVERY_STEPS,
} from "../../lib/ui/discovery-tour";
import { NpsSurvey } from "../../lib/ui/nps-survey";
import { BottomSheet } from "../../lib/ui/bottom-sheet";
// V157 — Modal de choix Groupe / RDD pour le bouton "Nouveau" du header
import { CreateChoiceModal } from "../../lib/ui/create-choice-modal";
import { useBreakpoint } from "../../lib/use-breakpoint";
import { usePlanGate } from "../../lib/ui/plan-gate-provider";
import {
  OnboardingModal,
  shouldShowOnboarding,
} from "../../lib/ui/onboarding-modal";
import { useT } from "../../lib/i18n/app-strings";
// V73.3 — Wizard unifié : même UI partout (Dashboard, Groupes, Onboarding).
import { MobileCreateGroupSheet } from "../../lib/ui/mobile-create-group-sheet";

const TYPES = [
  { value: "TONTINE", label: "🪙 Tontine" },
  { value: "COLOC", label: "🏠 Coloc" },
  { value: "TRAVEL", label: "✈️ Voyage" },
  { value: "EVENT", label: "💍 Événement" },
  { value: "CLUB", label: "⚽ Club" },
  { value: "PARISH", label: "⛪ Paroisse" },
  { value: "GENERIC", label: "📁 Autre" },
];

export default function DashboardPage() {
  const t = useT();
  const router = useRouter();
  const planGate = usePlanGate();
  const [me, setMe] = useState<any>(null);
  const [groups, setGroups] = useState<any[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // V157 — Modal de choix Groupe / RDD pour le bouton "Nouveau" du header.
  const [showCreateChoice, setShowCreateChoice] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("TONTINE");
  // Erreur AU NIVEAU PAGE (chargement initial). Pour l'erreur de création
  // du groupe, on garde un state distinct DANS le modal pour qu'elle
  // s'affiche sous les champs et pas en arrière-plan.
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Vérifie le token + récupère le user (et trigger éventuel onboarding)
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void Promise.all([api.me(), api.listGroups()])
      .then(([m, g]) => {
        setMe(m.user);
        setGroups(g);
        if (shouldShowOnboarding(g.length > 0)) {
          setShowOnboarding(true);
        }

        // Onboarding contextuel (spec §3.1) : si un intent a été choisi
        // dans /onboarding/intent et que le user n'a pas encore de groupe,
        // on ouvre automatiquement le CreateGroupModal pré-rempli.
        try {
          const raw = localStorage.getItem("bmd_pending_intent");
          if (raw && g.length === 0) {
            const intent = JSON.parse(raw) as {
              type: string;
              nameSuggestions?: string[];
              at: string;
            };
            // Sécurité : ignore si l'intent a plus de 10 minutes
            const ageMin =
              (Date.now() - new Date(intent.at).getTime()) / 60_000;
            if (ageMin < 10 && intent.type) {
              setType(intent.type);
              if (intent.nameSuggestions?.[0]) {
                setName(intent.nameSuggestions[0]);
              }
              setShowCreate(true);
            }
            localStorage.removeItem("bmd_pending_intent");
          }
        } catch {
          /* localStorage indisponible / JSON cassé — on ignore */
        }
      })
      .catch((e) => {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError((e as Error).message);
      });
  }, [router]);

  async function createGroup() {
    setCreateError(null);
    setSubmitting(true);
    try {
      const created = await api.createGroup({
        name,
        type,
        defaultCurrency: me?.defaultCurrency,
      });
      setShowCreate(false);
      setName("");
      router.push(`/dashboard/groups/${created.id}`);
    } catch (e) {
      // Si c'est une limite de plan : on ferme le modal et on déclenche
      // le PlanGateDialog (UX standard fintech : "ton plan ne permet pas,
      // voici les options pour upgrader").
      if (planGate.handleApiError(e)) {
        setShowCreate(false);
      } else {
        // Erreur classique : affichée dans le modal lui-même (l'utilisateur
        // reste sur le formulaire et voit le message sous les champs).
        const msg =
          e instanceof ApiError
            ? e.tip
              ? `${e.message}\n${e.tip}`
              : e.message
            : (e as Error).message;
        setCreateError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function openCreate() {
    setCreateError(null);
    setShowCreate(true);
  }

  // V36 — FAB action sheet : au lieu d'ouvrir directement le modal de
  // création de groupe, le FAB ouvre maintenant un BottomSheet avec
  // 2 options : "Créer un groupe" ou "Ajouter une dépense" (qui propose
  // de choisir un groupe existant).
  const [showFabSheet, setShowFabSheet] = useState(false);
  const [showPickGroup, setShowPickGroup] = useState(false);
  function openFabSheet() {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        (navigator as any).vibrate(8);
      }
    } catch {
      /* ignore */
    }
    setShowFabSheet(true);
  }
  function chooseCreateGroup() {
    setShowFabSheet(false);
    openCreate();
  }
  function chooseAddExpense() {
    setShowFabSheet(false);
    if (!groups || groups.length === 0) {
      // Pas de groupe → on bascule vers création de groupe d'abord
      openCreate();
      return;
    }
    if (groups.length === 1) {
      // 1 seul groupe → direct
      router.push(
        `/dashboard/groups/${groups[0].id}?action=add-expense`,
      );
      return;
    }
    setShowPickGroup(true);
  }

  /**
   * Variante "type pré-rempli" — invoquée depuis l'empty state qui propose
   * 4 modèles (Tontine / Voyage / Coloc / Événement). On set le type et on
   * ouvre le modal pour que le user n'ait plus qu'à saisir le nom.
   */
  function openCreateWithType(t: string) {
    setType(t);
    setCreateError(null);
    setShowCreate(true);
  }

  // V157 — Action primaire (header desktop) : bouton "Nouveau" qui ouvre
  // le modal de choix Groupe / Reconnaissance de dette (au lieu de filer
  // directement vers la création d'un groupe). Cohérent avec les autres
  // boutons "Créer / Nouveau" du dashboard desktop (V156).
  const desktopPrimaryAction = (
    <button
      type="button"
      onClick={() => setShowCreateChoice(true)}
      style={{
        padding: "10px 18px",
        background:
          "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
        color: "#16111E",
        border: "none",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      ＋ {t("dashboard.newCta") || "Nouveau"}
    </button>
  );

  return (
    <ResponsiveShell
      // V41.3 — Plus de override FAB sur le dashboard : on laisse le shell
      // ouvrir le game-changer Quick Add (voice/scan) par défaut. La
      // création de groupe se fait depuis l'onglet Groupes (FAB dédié).
      // Props desktop
      breadcrumb={t("nav.dashboard")}
      desktopTitle={t("dashboard.greetingShort", { name: me?.displayName?.split(" ")[0] ?? "" })}
      subtitle={
        groups && groups.length > 0
          ? t(groups.length > 1 ? "dashboard.activeGroupsCount" : "dashboard.activeGroupsCountSingular", { count: String(groups.length) })
          : t("common.welcome")
      }
      primaryAction={desktopPrimaryAction}
    >
      {/* Sélection du dashboard selon le viewport. ResponsiveShell s'occupe
          déjà du wrapping mobile/desktop, donc ici on peut afficher les deux
          composants : ils sont SSR-safe, et seul celui qui correspond au
          viewport sera réellement rendu (display:none via media-query). */}
      <DashboardSwitch
        onCreate={openCreate}
        onCreateWithType={openCreateWithType}
      />

      {/* Tour guidé 4 étapes (1ère connexion uniquement) */}
      <OnboardingTour />

      {/* V178.C — Tour découverte spotlight (1ère connexion). Démarre 1.5s
          après le rendu du dashboard pour laisser l'UI se stabiliser.
          Cohabite avec OnboardingTour (key localStorage différente) — l'un
          sera retiré quand l'autre aura été validé en prod. */}
      <DiscoveryTour steps={DEFAULT_DISCOVERY_STEPS} />

      {/* Survey NPS in-app — n'apparaît que pour les users actifs > 14j
          n'ayant pas répondu depuis > 90j (spec §9.3) */}
      <NpsSurvey />

      {error && (
        <div
          style={{
            marginTop: 12,
            color: "var(--terracotta, #b54732)",
            background: "rgba(181,70,46,0.1)",
            padding: 10,
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* V73.3 — Wizard unifié partout : même UI sur Dashboard / Page Groupes
          / Onboarding. BottomSheet maquette V45 light (cards blanches, ✓
          saffron animé, inputs ivory+focus saffron, aperçu indigo).
          V73.4 — On NE passe PAS `initialType` : l'utilisateur démarre
          TOUJOURS à l'étape 1 (choix du type) pour que le flow soit
          identique partout. Le state `type` local existe pour l'ancienne
          OnboardingModal qui pré-sélectionnait — sans effet maintenant. */}
      <MobileCreateGroupSheet
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setName("");
          setCreateError(null);
        }}
        onCreate={async (data) => {
          setCreateError(null);
          setSubmitting(true);
          try {
            const created = await api.createGroup({
              name: data.name,
              // Mappe le type du wizard → enum backend
              type:
                data.type === "OTHER" ? "GENERIC" : (data.type as string),
              defaultCurrency: data.currency || me?.defaultCurrency,
              // V111 · Propage le flag « reçu fiscal » coché dans le wizard
              taxReceiptsEnabled: data.taxReceiptsEnabled,
            });
            // V91.C — Retourner le groupId pour activer l'étape 3
            // (invitations). Le sheet gère le close puis la nav. La nav
            // explicite ci-dessous reste comme fallback si le sheet ferme
            // sans passer step 3 (cas legacy ou erreur).
            setName("");
            return created.id as string;
          } catch (e) {
            // Plan gate : si limite atteinte, ferme + déclenche dialog upgrade
            if (planGate.handleApiError(e)) {
              setShowCreate(false);
              return undefined;
            }
            // Autres erreurs : on re-throw pour que le sheet l'affiche
            // dans son propre <div role="alert"> interne (V58 / V73.2).
            throw e;
          } finally {
            setSubmitting(false);
          }
        }}
      />
      {/* PlanGateDialog est rendu globalement par <PlanGateProvider> dans
          le RootLayout — pas besoin de le rendre ici. */}

      {/* Onboarding contextuel */}
      <OnboardingModal
        open={showOnboarding}
        userName={me?.displayName ?? ""}
        onClose={() => setShowOnboarding(false)}
        onChoose={(groupType) => {
          setType(groupType);
          setShowCreate(true);
          setShowOnboarding(false);
        }}
      />

      {/* === FAB action sheet : Créer un groupe / Ajouter une dépense === */}
      <BottomSheet
        open={showFabSheet}
        onClose={() => setShowFabSheet(false)}
        title={t("fab.createTitle")}
      >
        <p
          style={{
            fontSize: 13,
            color: "var(--cream-soft)",
            margin: "0 0 16px",
            lineHeight: 1.5,
          }}
        >
          {t("fab.createSubtitle")}
        </p>
        <button
          type="button"
          onClick={chooseCreateGroup}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.10)",
            borderRadius: 14,
            color: "var(--cream)",
            fontFamily: "inherit",
            cursor: "pointer",
            marginBottom: 10,
            textAlign: "left",
            touchAction: "manipulation",
            minHeight: 64,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.08))",
              border: "1px solid rgba(232,163,61,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--saffron)",
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {t("fab.createGroup")}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--cream-soft)",
                marginTop: 2,
              }}
            >
              {t("fab.createGroupHint")}
            </div>
          </div>
          <span style={{ color: "var(--saffron)", opacity: 0.6 }}>›</span>
        </button>
        <button
          type="button"
          onClick={chooseAddExpense}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.10)",
            borderRadius: 14,
            color: "var(--cream)",
            fontFamily: "inherit",
            cursor: "pointer",
            textAlign: "left",
            touchAction: "manipulation",
            minHeight: 64,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background:
                "linear-gradient(135deg, rgba(63,125,92,0.18), rgba(63,125,92,0.06))",
              border: "1px solid rgba(63,125,92,0.30)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--emerald-soft, #7DC59E)",
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {t("fab.addExpense")}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--cream-soft)",
                marginTop: 2,
              }}
            >
              {t("fab.addExpenseHint")}
            </div>
          </div>
          <span style={{ color: "var(--saffron)", opacity: 0.6 }}>›</span>
        </button>
      </BottomSheet>

      {/* === Picker de groupe (si user a plusieurs groupes pour une dépense) === */}
      <BottomSheet
        open={showPickGroup}
        onClose={() => setShowPickGroup(false)}
        title={t("fab.pickGroupTitle")}
      >
        <p
          style={{
            fontSize: 13,
            color: "var(--cream-soft)",
            margin: "0 0 16px",
            lineHeight: 1.5,
          }}
        >
          {t("fab.pickGroupHint")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(groups ?? []).map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setShowPickGroup(false);
                router.push(
                  `/dashboard/groups/${g.id}?action=add-expense`,
                );
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px",
                background: "rgba(244,228,193,0.04)",
                border: "1px solid rgba(244,228,193,0.08)",
                borderRadius: 14,
                color: "var(--cream)",
                fontFamily: "inherit",
                cursor: "pointer",
                textAlign: "left",
                touchAction: "manipulation",
                minHeight: 56,
                width: "100%",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g.name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--cream-soft)",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}
              >
                {g.defaultCurrency}
              </span>
              <span
                style={{ color: "var(--saffron)", opacity: 0.6, marginLeft: 2 }}
              >
                ›
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* V157 — Modal de choix au clic "Nouveau" du header desktop */}
      <CreateChoiceModal
        open={showCreateChoice}
        onClose={() => setShowCreateChoice(false)}
        onCreateGroup={() => {
          setShowCreateChoice(false);
          openCreate();
        }}
        onCreateDebt={() => {
          setShowCreateChoice(false);
          router.push("/dashboard/debts/new");
        }}
        t={t}
      />
    </ResponsiveShell>
  );
}

/**
 * Bascule mobile / desktop interne — utilise useBreakpoint pour ne monter
 * qu'un seul des deux dashboards. Évite un double data-fetch et un double
 * rendu d'arbre.
 *
 * Pendant le 1er render (avant que le navigateur ait évalué le media-query),
 * `ready === false` : on rend un placeholder neutre. Comme <ResponsiveShell>
 * fait déjà ce même check, le placeholder n'apparaîtra que très brièvement.
 */
function DashboardSwitch({
  onCreate,
  onCreateWithType,
}: {
  onCreate: () => void;
  onCreateWithType: (type: string) => void;
}) {
  const t = useT();
  const { isMobile, ready } = useBreakpoint();
  if (!ready) {
    return (
      <div style={{ padding: 20, color: "var(--cream-soft)" }}>{t("common.loading")}</div>
    );
  }
  if (isMobile) {
    return (
      <MobileDashboard
        onCreate={onCreate}
        onCreateWithType={onCreateWithType}
      />
    );
  }
  return (
    <DesktopDashboard
      onCreateGroup={onCreate}
      onCreateGroupWithType={onCreateWithType}
    />
  );
}

function CreateGroupModal({
  name,
  setName,
  type,
  setType,
  types,
  error,
  submitting,
  onClose,
  onSubmit,
}: {
  name: string;
  setName: (v: string) => void;
  type: string;
  setType: (v: string) => void;
  types: Array<{ value: string; label: string }>;
  /** Erreur de submit affichée à L'INTÉRIEUR du modal (pas en arrière-plan). */
  error?: string | null;
  /** Empêche le double-clic et affiche un état "création en cours". */
  submitting?: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useT();
  const disabled = !name.trim() || !!submitting;

  /** Haptic léger pour confirmer le tap sur une chip ou le CTA */
  function buzz(ms = 8) {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        (navigator as any).vibrate(ms);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <BottomSheet open onClose={onClose} title={t("group.newGroupTitle")}>
      {/* Champ NOM — design mobile-native avec focus state marqué */}
      <div style={{ marginBottom: 18, marginTop: 4 }}>
        <label
          htmlFor="cg-name"
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            fontWeight: 700,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 1.4,
          }}
        >
          {t("group.nameLabel")}
        </label>
        <input
          id="cg-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("dashboard.groupExamplesPlaceholder")}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          inputMode="text"
          maxLength={60}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !disabled) {
              e.preventDefault();
              buzz(10);
              onSubmit();
            }
          }}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 14,
            background: "rgba(244,228,193,0.05)",
            border: "1.5px solid rgba(244,228,193,0.12)",
            color: "var(--cream)",
            fontSize: 16, // 16px = no zoom iOS
            fontFamily: "inherit",
            boxSizing: "border-box",
            outline: "none",
            minHeight: 52,
            WebkitAppearance: "none",
            appearance: "none",
            transition: "border-color 0.15s ease, background 0.15s ease",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(232,163,61,0.55)";
            e.currentTarget.style.background = "rgba(232,163,61,0.07)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(244,228,193,0.12)";
            e.currentTarget.style.background = "rgba(244,228,193,0.05)";
          }}
        />
      </div>

      {/* Sélecteur TYPE — grille de chips au lieu d'un <select> natif iOS */}
      <div style={{ marginBottom: 22 }}>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            fontWeight: 700,
            marginBottom: 10,
            textTransform: "uppercase",
            letterSpacing: 1.4,
          }}
        >
          {t("group.typeLabel")}
        </label>
        <div
          role="radiogroup"
          aria-label={t("group.typeLabel")}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
            gridAutoFlow: "row",
            gap: 8,
          }}
        >
          {/* Grille adaptative : 2 colonnes sur mobile (<400px), 3-4 sur tablette */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
              gridColumn: "1 / -1",
            }}
            className="cg-type-grid"
          >
            {types.map((opt) => {
              const active = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    buzz(6);
                    setType(opt.value);
                  }}
                  style={{
                    padding: "12px 10px",
                    borderRadius: 14,
                    background: active
                      ? "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.08))"
                      : "rgba(244,228,193,0.04)",
                    border: active
                      ? "1.5px solid rgba(232,163,61,0.6)"
                      : "1.5px solid rgba(244,228,193,0.10)",
                    color: active ? "var(--cream)" : "var(--cream-soft)",
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    textAlign: "center",
                    minHeight: 52,
                    transition:
                      "background 0.15s ease, border-color 0.15s ease, transform 0.05s ease",
                    WebkitTapHighlightColor: "transparent",
                    overflowWrap: "anywhere",
                    lineHeight: 1.3,
                  }}
                  onTouchStart={(e) => {
                    e.currentTarget.style.transform = "scale(0.97)";
                  }}
                  onTouchEnd={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bandeau d'erreur in-modal — accompagne l'utilisateur sans
          qu'il ait à fermer le modal pour voir le message */}
      {error && (
        <div
          role="alert"
          style={{
            background: "rgba(217,113,74,0.12)",
            border: "1px solid rgba(217,113,74,0.4)",
            color: "#FFB89A",
            padding: "12px 14px",
            borderRadius: 12,
            fontSize: 13,
            lineHeight: 1.5,
            marginBottom: 16,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            overflowWrap: "anywhere",
          }}
        >
          <span aria-hidden style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
            ⚠️
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>{error}</span>
        </div>
      )}

      {/* CTA pill gradient avec scale-on-tap + haptic — pattern fintech */}
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          buzz(12);
          onSubmit();
        }}
        disabled={disabled}
        data-cta-active={!disabled}
        style={{
          width: "100%",
          padding: "16px",
          background: disabled
            ? "rgba(232,163,61,0.22)"
            : "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
          color: disabled ? "rgba(22,17,30,0.55)" : "#16111E",
          border: "none",
          borderRadius: 999, // pill
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: 0.2,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
          minHeight: 56,
          fontFamily: "inherit",
          boxShadow: disabled
            ? "none"
            : "0 8px 24px -8px rgba(232,163,61,0.45)",
          transition: "transform 0.05s ease, opacity 0.15s ease",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
        onTouchStart={(e) => {
          if (!disabled) e.currentTarget.style.transform = "scale(0.97)";
        }}
        onTouchEnd={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {submitting ? t("group.creating") : `✨ ${t("group.create")}`}
      </button>

      {/* Lien fermer discret en bas — alternative au swipe-down */}
      <button
        type="button"
        onClick={onClose}
        style={{
          width: "100%",
          marginTop: 10,
          padding: "12px",
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          minHeight: 40,
        }}
      >
        {t("common.cancel")}
      </button>
    </BottomSheet>
  );
}
