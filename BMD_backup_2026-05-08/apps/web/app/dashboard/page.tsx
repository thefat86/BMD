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
import { NpsSurvey } from "../../lib/ui/nps-survey";
import { BottomSheet } from "../../lib/ui/bottom-sheet";
import { useBreakpoint } from "../../lib/use-breakpoint";
import { usePlanGate } from "../../lib/ui/plan-gate-provider";
import {
  OnboardingModal,
  shouldShowOnboarding,
} from "../../lib/ui/onboarding-modal";
import { useT } from "../../lib/i18n/app-strings";

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

  // Action primaire (header desktop)
  const desktopPrimaryAction = (
    <button
      type="button"
      onClick={openCreate}
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
      {t("dashboard.newGroupCta")}
    </button>
  );

  return (
    <ResponsiveShell
      // Props mobile
      onFabClick={openCreate}
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

      {/* Modal création groupe : l'erreur de submit s'affiche À L'INTÉRIEUR */}
      {showCreate && (
        <CreateGroupModal
          name={name}
          setName={setName}
          type={type}
          setType={setType}
          types={TYPES}
          submitting={submitting}
          error={createError}
          onClose={() => {
            setShowCreate(false);
            setName("");
            setCreateError(null);
          }}
          onSubmit={createGroup}
        />
      )}
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
  return (
    <BottomSheet open onClose={onClose} title={t("group.newGroupTitle")}>
      <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: "var(--cream-soft)",
              fontWeight: 600,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}
          >
            {t("group.nameLabel")}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("dashboard.groupExamplesPlaceholder")}
            autoFocus
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(244,228,193,0.04)",
              border: "1px solid rgba(244,228,193,0.1)",
              color: "var(--cream)",
              fontSize: 14,
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: "var(--cream-soft)",
              fontWeight: 600,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}
          >
            {t("group.typeLabel")}
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(244,228,193,0.04)",
              border: "1px solid rgba(244,228,193,0.1)",
              color: "var(--cream)",
              fontSize: 14,
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          >
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
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
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 14,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
              ⚠️
            </span>
            <span style={{ flex: 1 }}>{error}</span>
          </div>
        )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!name.trim() || !!submitting}
        style={{
          width: "100%",
          padding: "14px",
          background:
            !name.trim() || submitting
              ? "rgba(232,163,61,0.3)"
              : "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
          color: "#16111E",
          border: "none",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 700,
          cursor: !name.trim() || submitting ? "not-allowed" : "pointer",
          opacity: !name.trim() || submitting ? 0.5 : 1,
          minHeight: 52, // touch target XL banking app
        }}
      >
        {submitting ? t("group.creating") : t("group.create")}
      </button>
    </BottomSheet>
  );
}
