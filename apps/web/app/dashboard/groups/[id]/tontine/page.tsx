"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  clearToken,
  getToken,
  invalidateGenericCache,
  isUnauthorized,
} from "../../../../../lib/api-client";
import { useToast } from "../../../../../lib/ui/toast";
// V52.C2 — Icon registry V45 (remplace 📈 🎁 par SVG outline)
import { Icon } from "../../../../../lib/ui/icons";
// V37 — Lazy load BarChart pour shrink le bundle initial (recharts ~100 kB)
import dynamic from "next/dynamic";
const BarChart = dynamic(
  () =>
    import("../../../../../lib/ui/charts").then((m) => ({
      default: m.BarChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: 200,
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.06)",
          borderRadius: 14,
        }}
      />
    ),
  },
);
import { LocalContributionAmount } from "../../../../../lib/ui/local-contribution-amount";
import { useDialog } from "../../../../../lib/ui/dialog-provider";
import { ResponsiveShell } from "../../../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../../../lib/use-breakpoint";
import { useT } from "../../../../../lib/i18n/app-strings";
import { useCurrency } from "../../../../../lib/currency-provider";
import { usePullToRefresh } from "../../../../../lib/use-pull-to-refresh";
import { PullIndicator } from "../../../../../lib/ui/pull-indicator";
// V40 — Refonte mobile dédiée. Le composant est autonome, le code desktop
// reste intact pour les écrans larges.
import { MobileTontineView } from "../../../../../lib/ui/mobile-tontine-view";
// V215.F3 — Roue circulaire desktop (parité visuelle avec le mobile)
import { TontineWheel } from "../../../../../lib/ui/tontine-wheel";
// V217 — Refonte page tontine desktop : 3 onglets, layout simple, validé via maquette.
import { DesktopGroupTontineV217View } from "../../../../../lib/ui/desktop-group-tontine-v217-view";

type Status = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";

const STATUS_BADGE: Record<Status, { chip: string; label: string }> = {
  DRAFT: { chip: "chip-muted", label: "Brouillon" },
  ACTIVE: { chip: "chip-saffron", label: "🟢 Active" },
  COMPLETED: { chip: "chip-emerald", label: "✓ Terminée" },
  CANCELLED: { chip: "chip-rose", label: "Annulée" },
};

export default function TontinePage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;
  const dialog = useDialog();
  const toast = useToast();
  const { isMobile, ready: bpReady } = useBreakpoint();
  const t = useT();
  const { formatAmount } = useCurrency();

  const [group, setGroup] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [tontine, setTontine] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Création
  const [showCreate, setShowCreate] = useState(false);
  // V231 — Nom libre + devise choisie (défaut = group.defaultCurrency)
  const [tontineName, setTontineName] = useState("");
  const [tontineCurrency, setTontineCurrency] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState("250");
  const [frequency, setFrequency] =
    useState<"WEEKLY" | "BIWEEKLY" | "MONTHLY">("MONTHLY");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [orderMode, setOrderMode] =
    useState<"MANUAL" | "RANDOM" | "AUCTION">("MANUAL");
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  // V229 — Sélection des participants (sous-ensemble du groupe).
  // Par défaut tous cochés (comportement historique). L'admin peut
  // décocher ceux qui ne participent pas à la tontine.
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(
    new Set(),
  );

  async function refresh() {
    try {
      const [m, g, t] = await Promise.all([
        api.me(),
        api.getGroup(groupId),
        api.getTontine(groupId),
      ]);
      setMe(m.user);
      setGroup(g);
      setTontine(t.tontine);
      if (!t.tontine && g.members) {
        const allIds = g.members.map((mem: any) => mem.user.id);
        setManualOrder(allIds);
        // V229 — Par défaut tous les membres sont cochés comme participants
        setSelectedParticipantIds(new Set(allIds));
        // V231 — Devise par défaut = devise du groupe (modifiable)
        if (g.defaultCurrency && !tontineCurrency) {
          setTontineCurrency(g.defaultCurrency);
        }
      }
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
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

  // Pull-to-refresh natif (mobile only)
  const { state: pullState, bindToScrollContainer } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([new Promise((r) => setTimeout(r, 600)), refresh()]);
    },
  });
  useEffect(() => {
    bindToScrollContainer(document.body);
  }, [bindToScrollContainer]);

  async function createTontine() {
    setError(null);
    // V229 — Liste des participants effectifs (sous-ensemble du groupe).
    // Si tous les membres sont cochés, on n'envoie pas le champ (= tous).
    // Si certains sont décochés, on envoie la liste filtrée.
    const allIds: string[] = (group?.members ?? []).map(
      (m: any) => m.user.id,
    );
    const selected = allIds.filter((id) => selectedParticipantIds.has(id));
    if (selected.length < 2) {
      setError(
        "Sélectionne au moins 2 participants pour la tontine.",
      );
      return;
    }
    const participantUserIds =
      selected.length === allIds.length ? undefined : selected;

    // V229 — manualOrder doit correspondre à la sélection (l'admin ne peut
    // pas mettre un membre non-participant dans l'ordre). On filtre ici.
    const orderForActivation =
      orderMode === "MANUAL"
        ? manualOrder.filter((id) => selectedParticipantIds.has(id))
        : undefined;

    try {
      const created = await api.createTontine(groupId, {
        // V231 — Nom + devise libres
        name: tontineName.trim() || undefined,
        currency: tontineCurrency || undefined,
        contributionAmount,
        frequency,
        startDate: new Date(startDate).toISOString(),
        orderMode,
        notes: notes || undefined,
        participantUserIds,
      });
      await api.activateTontine(
        created.id,
        orderForActivation,
        undefined, // alreadyServedUserIds non utilisé ici
        participantUserIds, // V229 — sécurité belt-and-suspenders
      );
      // V233.A — Création tontine instantanée :
      // 1) Invalider le cache memoized (TTL 20s) pour forcer le refetch frais.
      // 2) Quitter le formulaire et rafraîchir immédiatement. Le composant
      //    DesktopGroupTontineV217View remonte avec showCreate=false et son
      //    propre useEffect re-fetche getTontine() qui retournera désormais
      //    la tontine fraîchement créée — la roue + l'onglet "En cours"
      //    s'affichent sans avoir besoin de naviguer manuellement.
      // 3) Toast de confirmation pour feedback utilisateur.
      invalidateGenericCache(`/groups/${groupId}/tontine`);
      setShowCreate(false);
      await refresh();
      toast.success(t("tontine.createdSuccess") || "Tontine créée");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function markPaid(contributionId: string) {
    setError(null);
    try {
      await api.markContributionPaid(contributionId, "Manuel");
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirm(contributionId: string) {
    setError(null);
    try {
      await api.confirmContribution(contributionId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function distribute(turnId: string) {
    setError(null);
    try {
      await api.distributeTurn(turnId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function cancel() {
    if (
      !(await dialog.confirm(
        "Annuler cette tontine ? Cette action est irréversible.",
        {
          variant: "danger",
          title: "Annuler la tontine",
          confirmLabel: "Annuler la tontine",
          cancelLabel: "Garder",
        },
      ))
    )
      return;
    try {
      await api.cancelTontine(tontine.id);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function moveOrder(idx: number, dir: -1 | 1) {
    const newOrder = [...manualOrder];
    const swap = idx + dir;
    if (swap < 0 || swap >= newOrder.length) return;
    [newOrder[idx], newOrder[swap]] = [newOrder[swap]!, newOrder[idx]!];
    setManualOrder(newOrder);
  }

  function memberName(userId: string): string {
    return (
      group?.members.find((m: any) => m.user.id === userId)?.user.displayName ??
      "?"
    );
  }

  // V40 — Bascule vers la vue mobile dédiée (anneau de rotation + carte tour).
  // Placée APRÈS tous les hooks pour respecter Rules of Hooks. Le code
  // desktop ci-dessous reste intact pour les viewports larges.
  if (bpReady && isMobile) {
    return (
      <ResponsiveShell
        breadcrumb={t("tontine.title") || "Tontine"}
        mobileTitle={t("tontine.title") || "Tontine"}
        back={{ href: `/dashboard/groups/${groupId}` }}
      >
        <MobileTontineView groupId={groupId} />
      </ResponsiveShell>
    );
  }

  if (!group) {
    return (
      <ResponsiveShell
        breadcrumb="Tontine"
        desktopTitle="Tontine"
        mobileTitle="Tontine"
        back={{ href: `/dashboard/groups/${groupId}` }}
      >
        <p className="muted" style={{ padding: 30 }}>
          Chargement…
        </p>
      </ResponsiveShell>
    );
  }

  const tontineStatusBadge = tontine ? (
    <span
      className={`chip ${STATUS_BADGE[tontine.status as Status].chip}`}
      style={{ flexShrink: 0 }}
    >
      {STATUS_BADGE[tontine.status as Status].label}
    </span>
  ) : null;

  // ═══════════════════════════════════════════════════════════════════
  // V217 — Vue desktop refondue (validée via maquette).
  // Branche prioritaire sur le rendu legacy ci-dessous : tant que
  // l'utilisateur ne demande pas la création (`showCreate`), on affiche
  // la nouvelle vue avec ses 3 onglets. Quand il clique "Créer", on bascule
  // sur le formulaire legacy (lignes 438+) qui reste inchangé.
  // Le code desktop legacy reste en place pour le mode `showCreate` et
  // sera retiré dans une future passe de cleanup une fois le wizard de
  // création refondu lui aussi.
  if (bpReady && !isMobile && !showCreate) {
    return (
      <ResponsiveShell
        breadcrumb={`Groupes › ${group.name} › ${t("tontine.title") || "Tontine"}`}
        desktopTitle={`${t("tontine.title") || "Tontine"} — ${group.name}`}
        subtitle={
          tontine
            ? `${STATUS_BADGE[tontine.status as Status].label} · ${group.defaultCurrency}`
            : `${t("tontine.noneShort") || "Aucune tontine"} · ${group.defaultCurrency}`
        }
        primaryAction={
          <Link
            href={`/dashboard/groups/${groupId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 13px",
              background: "transparent",
              border: "1px solid rgba(244,228,193,0.18)",
              borderRadius: 10,
              color: "var(--cream-soft)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ↩ {t("group.hub.backToHub") || "Retour au hub"}
          </Link>
        }
        mobileTitle="Tontine"
        back={{ href: `/dashboard/groups/${groupId}` }}
        mobileHeaderRight={tontineStatusBadge}
      >
        <div style={{ padding: 0, maxWidth: 1100, margin: "0 auto" }}>
          {/* V233.A — `key` change quand la tontine active du parent change.
              Cela force le remount du composant (et donc son useEffect de
              fetch initial) après une création, sans avoir besoin de pousser
              une prop "refreshNonce" dédiée. Tant que la tontine reste la
              même, la key est stable et il n'y a pas de remount. */}
          <DesktopGroupTontineV217View
            key={`tontine-view-${tontine?.id ?? "none"}`}
            groupId={groupId}
            group={group}
            me={me}
            onCreateClick={() => setShowCreate(true)}
          />
        </div>
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      breadcrumb={`Groupes › ${group.name} › Tontine`}
      desktopTitle={`🪙 Tontine — ${group.name}`}
      subtitle={
        tontine
          ? `${STATUS_BADGE[tontine.status as Status].label} · ${group.defaultCurrency}`
          : `Aucune tontine en cours · ${group.defaultCurrency}`
      }
      primaryAction={
        !isMobile ? (
          // V211.H — Bouton « ↩ Hub » uniforme. Le badge de statut tontine
          // reste affiché dans le contenu (pas dans le header desktop).
          <Link
            href={`/dashboard/groups/${groupId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 13px",
              background: "transparent",
              border: "1px solid rgba(244,228,193,0.18)",
              borderRadius: 10,
              color: "var(--cream-soft)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ↩ {t("group.hub.backToHub") || "Retour au hub"}
          </Link>
        ) : (
          tontineStatusBadge
        )
      }
      mobileTitle="Tontine"
      back={{ href: `/dashboard/groups/${groupId}` }}
      mobileHeaderRight={tontineStatusBadge}
    >
      <div
        style={{
          padding: isMobile ? "8px 16px 24px" : 0,
          maxWidth: isMobile ? "100%" : 1100,
          margin: "0 auto",
        }}
      >
      {/* Pull-to-refresh indicator (mobile only) */}
      {isMobile && <PullIndicator {...pullState} />}

      {/* Sous-titre mobile (le shell affiche déjà juste "Tontine") :
          on rappelle le nom du groupe pour le contexte. */}
      {isMobile && (
        <div
          style={{
            fontSize: 12,
            color: "var(--cream-soft)",
            marginBottom: 14,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {group.name}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {/* === Aucune tontine encore — empty state banking ===
          Icône SVG outlined dans halo saffron, titre Cormorant raffiné,
          CTA pill gradient. Look natif fintech (Wise/Revolut style). */}
      {!tontine && !showCreate && (
        <div
          style={{
            background: "rgba(244,228,193,0.03)",
            border: "1px solid rgba(244,228,193,0.08)",
            borderRadius: 18,
            padding: "32px 22px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              margin: "0 auto 18px",
              borderRadius: 22,
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.06))",
              border: "1px solid rgba(232,163,61,0.30)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--saffron)",
              boxShadow: "0 8px 24px -8px rgba(232,163,61,0.40)",
            }}
          >
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 12h7M12 8.5v7M9 4.5a9 9 0 016 0M9 19.5a9 9 0 006 0" />
            </svg>
          </div>
          <h2
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "var(--cream)",
            }}
          >
            Pas encore de tontine
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--cream-soft)",
              margin: "0 0 22px",
              lineHeight: 1.55,
            }}
          >
            Crée une tontine pour démarrer une épargne collective rotative
            entre les <strong>{group.members.length} membres</strong> du
            groupe.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={group.members.length < 2}
            style={{
              width: "100%",
              padding: "14px 22px",
              background:
                group.members.length < 2
                  ? "rgba(232,163,61,0.22)"
                  : "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
              color:
                group.members.length < 2
                  ? "rgba(22,17,30,0.55)"
                  : "#16111E",
              border: "none",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 0.3,
              cursor: group.members.length < 2 ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              minHeight: 54,
              boxShadow:
                group.members.length < 2
                  ? "none"
                  : "0 8px 24px -8px rgba(232,163,61,0.45)",
              touchAction: "manipulation",
            }}
          >
            ＋ Créer une tontine
          </button>
          {group.members.length < 2 && (
            <p
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginTop: 14,
                lineHeight: 1.5,
              }}
            >
              Il faut au moins 2 membres dans le groupe.
            </p>
          )}
        </div>
      )}

      {/* === V215.F1 — Form création one-page (2 colonnes desktop) ===
          Layout sans scroll vertical sur écran 1080p+. Colonne gauche : tous
          les champs (montant, fréquence, date, ordre, notes). Colonne droite :
          aperçu live de la tontine + ordre des tours (drag-and-drop si MANUAL).
          Sur mobile (déjà géré par MobileTontineView), ce code n'est pas atteint. */}
      {!tontine && showCreate && (
        <div
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 180px)",
          }}
        >
          <div
            className="card-head"
            style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)" }}
          >
            <h2 style={{ fontSize: 16, margin: 0 }}>Nouvelle tontine</h2>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setShowCreate(false)}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
              gap: 0,
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {/* === COL GAUCHE : champs paramètres ============================ */}
            <div
              style={{
                padding: "16px 18px",
                borderRight: "1px solid var(--line-soft)",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* V231 — Nom de la tontine + devise (2 colonnes compact) */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>
                    {t("tontine.create.nameLabel") || "Nom de la tontine"}
                  </label>
                  <input
                    value={tontineName}
                    onChange={(e) => setTontineName(e.target.value)}
                    placeholder={
                      t("tontine.create.namePlaceholder") ||
                      "Tontine Été 2026, etc."
                    }
                    maxLength={120}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>
                    {t("tontine.create.currencyLabel") || "Devise"}
                  </label>
                  <input
                    value={tontineCurrency ?? ""}
                    onChange={(e) =>
                      setTontineCurrency(
                        e.target.value.toUpperCase().slice(0, 3),
                      )
                    }
                    placeholder={group.defaultCurrency}
                    maxLength={3}
                    style={{ textTransform: "uppercase" }}
                  />
                </div>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: 11 }}>
                  {t("tontine.contributionPerMember", { currency: tontineCurrency ?? group.defaultCurrency })}
                </label>
                <input
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="250.00"
                  style={{ fontSize: 22, fontWeight: 700 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>{t("tontine.frequency")}</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as any)}
                  >
                    <option value="WEEKLY">{t("tontine.weekly")}</option>
                    <option value="BIWEEKLY">{t("tontine.biweekly")}</option>
                    <option value="MONTHLY">{t("tontine.frequencyMonthly")}</option>
                  </select>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>{t("tontine.startDate")}</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: 11 }}>{t("tontine.orderMode")}</label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 6,
                  }}
                >
                  {[
                    { v: "MANUAL", lbl: "✋ Choisi" },
                    { v: "RANDOM", lbl: "🎲 Au sort" },
                    { v: "AUCTION", lbl: "🪙 Hui" },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setOrderMode(opt.v as any)}
                      style={{
                        padding: "8px 6px",
                        borderRadius: 9,
                        fontSize: 12,
                        fontWeight: 600,
                        border:
                          orderMode === opt.v
                            ? "1px solid var(--saffron)"
                            : "1px solid var(--line-soft)",
                        background:
                          orderMode === opt.v
                            ? "rgba(232,163,61,0.16)"
                            : "var(--overlay-2)",
                        color:
                          orderMode === opt.v
                            ? "var(--saffron)"
                            : "var(--cream-soft)",
                        cursor: "pointer",
                        minHeight: 36,
                      }}
                    >
                      {opt.lbl}
                    </button>
                  ))}
                </div>
                {orderMode === "AUCTION" && (
                  <div
                    style={{
                      fontSize: 10,
                      lineHeight: 1.4,
                      color: "var(--cream-soft)",
                      marginTop: 6,
                      fontStyle: "italic",
                    }}
                  >
                    🪙 Les membres misent à chaque tour. La plus haute mise
                    gagne le pot (système 標會).
                  </div>
                )}
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: 11 }}>Notes (optionnel)</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: tontine annuelle…"
                />
              </div>
            </div>

            {/* === COL DROITE : aperçu live + ordre des tours ================= */}
            <div
              style={{
                padding: "16px 18px",
                background:
                  "linear-gradient(180deg, rgba(232,163,61,0.04), rgba(0,0,0,0))",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* V229 — Sélection des participants (sous-ensemble du groupe).
                  Par défaut tous les membres sont cochés ; l'admin peut
                  décocher ceux qui ne participent pas à cette tontine. */}
              {group?.members?.length > 0 && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--gold)",
                        letterSpacing: 1.4,
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}
                    >
                      {t("tontine.create.participantsLabel") || "Participants"}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--cream-soft)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {t("tontine.create.participantsCount", {
                        selected: String(selectedParticipantIds.size),
                        total: String(group.members.length),
                      }) ||
                        `${selectedParticipantIds.size} / ${group.members.length} membres`}
                    </div>
                  </div>
                  <div
                    style={{
                      background: "var(--overlay)",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 10,
                      padding: 4,
                      maxHeight: 130,
                      overflowY: "auto",
                    }}
                  >
                    {group.members.map((mem: any) => {
                      const uid = mem.user.id;
                      const checked = selectedParticipantIds.has(uid);
                      return (
                        <label
                          key={uid}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "5px 8px",
                            borderRadius: 7,
                            background: checked
                              ? "rgba(232,163,61,0.06)"
                              : "transparent",
                            marginBottom: 2,
                            cursor: "pointer",
                            opacity: checked ? 1 : 0.55,
                            transition: "opacity 0.15s ease",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(selectedParticipantIds);
                              if (e.target.checked) {
                                next.add(uid);
                              } else {
                                next.delete(uid);
                              }
                              setSelectedParticipantIds(next);
                              // V229 — Maintient la cohérence : si on
                              // décoche, on retire aussi de manualOrder.
                              if (!e.target.checked) {
                                setManualOrder((prev) =>
                                  prev.filter((id) => id !== uid),
                                );
                              } else if (!manualOrder.includes(uid)) {
                                setManualOrder((prev) => [...prev, uid]);
                              }
                            }}
                            style={{
                              accentColor: "var(--saffron, #C58A2E)",
                              cursor: "pointer",
                              width: 16,
                              height: 16,
                              flexShrink: 0,
                            }}
                          />
                          <div
                            style={{
                              flex: 1,
                              fontSize: 12,
                              color: "var(--cream)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {mem.user.displayName}
                            {mem.user.id === me?.id && (
                              <span
                                style={{
                                  color: "var(--saffron)",
                                  fontSize: 9,
                                  marginLeft: 6,
                                  letterSpacing: 1,
                                }}
                              >
                                {t("common.you") || "TOI"}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {selectedParticipantIds.size < 2 && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "#9F4628",
                        marginTop: 4,
                        fontStyle: "italic",
                      }}
                    >
                      {t("tontine.create.minParticipants") ||
                        "Minimum 2 participants requis."}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--gold)",
                    letterSpacing: 1.4,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Aperçu
                </div>
                <div
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 28,
                    fontWeight: 700,
                    color: "var(--saffron)",
                    letterSpacing: -0.5,
                  }}
                >
                  {(
                    parseFloat(contributionAmount || "0") *
                    Math.max(selectedParticipantIds.size - 1, 0)
                  ).toFixed(0)}{" "}
                  <span
                    style={{
                      fontSize: 14,
                      color: "var(--cream-soft)",
                      fontWeight: 400,
                    }}
                  >
                    {tontineCurrency || group.defaultCurrency}/tour
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--cream-soft)",
                    marginTop: 2,
                  }}
                >
                  {selectedParticipantIds.size} tours · chacun reçoit le pot une fois
                </div>
              </div>

              {/* Ordre des tours — toujours visible, drag pour MANUAL */}
              <div>
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--gold)",
                    letterSpacing: 1.4,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  {orderMode === "MANUAL"
                    ? "Ordre des tours (1er en haut)"
                    : orderMode === "RANDOM"
                      ? "Ordre tiré au sort à l'activation"
                      : "Ordre déterminé par les enchères à chaque tour"}
                </div>
                <div
                  style={{
                    background: "var(--overlay)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: 10,
                    padding: 4,
                    maxHeight: 240,
                    overflowY: "auto",
                  }}
                >
                  {manualOrder.map((userId, i) => (
                    <div
                      key={userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 8px",
                        borderRadius: 7,
                        background:
                          orderMode === "MANUAL"
                            ? "rgba(232,163,61,0.04)"
                            : "transparent",
                        marginBottom: 2,
                        opacity: orderMode === "MANUAL" ? 1 : 0.65,
                      }}
                    >
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background:
                            "linear-gradient(135deg,var(--saffron),var(--terracotta))",
                          color: "#16111e",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: 10,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          fontSize: 12,
                          color: "var(--cream)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {memberName(userId)}
                      </div>
                      {orderMode === "MANUAL" && (
                        <>
                          <button
                            type="button"
                            onClick={() => moveOrder(i, -1)}
                            disabled={i === 0}
                            className="btn-ghost btn-sm"
                            style={{
                              padding: "2px 6px",
                              opacity: i === 0 ? 0.3 : 1,
                              minHeight: 26,
                              fontSize: 11,
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveOrder(i, 1)}
                            disabled={i === manualOrder.length - 1}
                            className="btn-ghost btn-sm"
                            style={{
                              padding: "2px 6px",
                              opacity: i === manualOrder.length - 1 ? 0.3 : 1,
                              minHeight: 26,
                              fontSize: 11,
                            }}
                          >
                            ↓
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer sticky : bouton "Créer & démarrer" */}
          <div
            style={{
              padding: "12px 18px",
              borderTop: "1px solid var(--line-soft)",
              background: "var(--overlay)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 11, color: "var(--cream-soft)" }}>
              ℹ️ {group.members.length} tours ·{" "}
              {(
                parseFloat(contributionAmount || "0") *
                (group.members.length - 1)
              ).toFixed(2)}{" "}
              {group.defaultCurrency} par tour
            </div>
            <button className="btn" onClick={createTontine}>
              ✓ Créer & démarrer
            </button>
          </div>
        </div>
      )}

      {/* === Tontine existante === */}
      {tontine && (
        <>
          {/* Hero card : montant principal */}
          <div className="hero-card">
            <div className="label">{t("tontine.contributionPerRound")}</div>
            <div className="amount">
              {parseFloat(tontine.contributionAmount).toFixed(2)}
              <span className="unit">{tontine.currency}</span>
            </div>
            <div className="row" style={{ color: "var(--cream-soft)" }}>
              <span>
                {tontine.frequency === "WEEKLY"
                  ? "Hebdo"
                  : tontine.frequency === "BIWEEKLY"
                    ? "Bi-hebdo"
                    : t("tontine.frequencyMonthly")}
              </span>
              <span>·</span>
              <span>
                {t("tontine.startedOn", {
                  date: new Date(tontine.startDate).toLocaleDateString(
                    "fr-FR",
                    {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    },
                  ),
                })}
              </span>
            </div>
            {/* Stats */}
            <div className="stats">
              <div className="stat">
                <div className="v">
                  {tontine.stats.completedTurns}/{tontine.stats.totalTurns}
                </div>
                <div className="l">{t("tontine.tours")}</div>
              </div>
              <div className="stat">
                <div
                  className="v"
                  style={{ color: "var(--emerald-soft)" }}
                >
                  {tontine.stats.confirmedCount}
                </div>
                <div className="l">{t("tontine.confirmed")}</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--gold)" }}>
                  {tontine.stats.paidCount}
                </div>
                <div className="l">{t("tontine.paid")}</div>
              </div>
              <div className="stat">
                <div className="v" style={{ color: "var(--rose)" }}>
                  {tontine.stats.pendingCount}
                </div>
                <div className="l">{t("tontine.pending")}</div>
              </div>
            </div>
            {tontine.status === "ACTIVE" && (
              <button
                className="btn-ghost btn-sm btn-block"
                onClick={cancel}
                style={{ marginTop: 12 }}
              >
                {t("tontine.cancelTontine")}
              </button>
            )}
          </div>

          {/* V215.F3 — Roue circulaire : vue d'ensemble immédiate des tours.
              Reprend la logique de la vue mobile mais en compact + alignée
              au hero. Cliquer sur un siège scrolle vers le tour correspondant. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px 0 24px",
            }}
          >
            <TontineWheel
              turns={tontine.turns}
              meId={me?.id}
              size={320}
              onSelectTurn={(turnId: string) => {
                const el = document.getElementById(`turn-${turnId}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.style.outline = "2px solid var(--saffron, #E8A33D)";
                  setTimeout(() => {
                    el.style.outline = "";
                  }, 1500);
                }
              }}
            />
          </div>

          {/* Historique : gains par bénéficiaire (chart) */}
          <TontineHistoryBlock groupId={groupId} currency={tontine.currency} />

          {/* Liste des tours */}
          {tontine.turns.map((turn: any) => (
            <div
              key={turn.id}
              id={`turn-${turn.id}`}
              className="card"
              style={{ transition: "outline 0.3s ease" }}>
              <div className="card-head">
                <h2>
                  {t("tontine.tour", { n: String(turn.turnNumber) })}
                  {turn.status === "IN_PROGRESS" && (
                    <span
                      className="chip chip-saffron"
                      style={{ marginLeft: 8, fontSize: 9 }}
                    >
                      {t("tontine.inProgress")}
                    </span>
                  )}
                  {turn.status === "DISTRIBUTED" && (
                    <span
                      className="chip chip-emerald"
                      style={{ marginLeft: 8, fontSize: 9 }}
                    >
                      ✓ {t("tontine.distributed")}
                    </span>
                  )}
                </h2>
                <span className="muted" style={{ fontSize: 11 }}>
                  📅{" "}
                  {turn.scheduledDate
                    ? new Date(turn.scheduledDate).toLocaleDateString(
                        "fr-FR",
                        { day: "numeric", month: "short", year: "numeric" },
                      )
                    : new Date(turn.dueDate).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                  {turn.scheduledDate && (
                    <span
                      style={{
                        color: "var(--emerald, #10b981)",
                        marginLeft: 4,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </span>
              </div>

              {/* Bloc dates : prévu vs choisi par bénéficiaire */}
              <TurnDateBlock
                turn={turn}
                meId={me?.id}
                isAdmin={
                  group.members.find((m: any) => m.user.id === me?.id)
                    ?.role === "ADMIN"
                }
                onChanged={refresh}
              />

              {/* Hui / enchères — uniquement si la tontine est en mode AUCTION */}
              {tontine.orderMode === "AUCTION" && turn.status === "PENDING" && (
                <HuiBidsBlock
                  turnId={turn.id}
                  meId={me?.id}
                  currency={tontine.currency}
                  isAdmin={
                    group.members.find((m: any) => m.user.id === me?.id)
                      ?.role === "ADMIN"
                  }
                  onChanged={refresh}
                />
              )}


              {/* Bénéficiaire */}
              <div
                style={{
                  background:
                    "linear-gradient(135deg,rgba(232,163,61,0.12),rgba(181,70,46,0.05))",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    flexShrink: 0,
                  }}
                >
                  🎁
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--gold)",
                      letterSpacing: 1.4,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {t("tontine.beneficiary").replace(/^🎁\s*/, "")}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontFamily: "Cormorant Garamond, serif",
                      color: "var(--cream)",
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {turn.beneficiary.displayName}
                    {me?.id === turn.beneficiary.id && (
                      <span
                        style={{
                          color: "var(--saffron)",
                          fontSize: 10,
                          marginLeft: 6,
                          letterSpacing: 1,
                        }}
                      >
                        {t("tontine.huiYou")}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontFamily: "Cormorant Garamond, serif",
                    color: "var(--saffron)",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {turn.contributions.length > 0
                    ? (
                        parseFloat(turn.contributions[0].amount) *
                        turn.contributions.length
                      ).toFixed(2)
                    : "0"}{" "}
                  {tontine.currency}
                </div>
              </div>

              {/* Cotisations */}
              <div className="list">
                {turn.contributions.map((c: any) => {
                  const isMe = me?.id === c.contributor.id;
                  const canMarkPaid = isMe && c.status === "PENDING";
                  const canConfirm =
                    c.status === "PAID" &&
                    (me?.id === turn.beneficiary.id ||
                      group.members.find(
                        (m: any) => m.user.id === me?.id,
                      )?.role === "ADMIN");

                  return (
                    <div key={c.id} className="list-item">
                      <div className="icon">
                        {c.contributor.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="text">
                        <div className="name">
                          {c.contributor.displayName}
                          {isMe && (
                            <span
                              style={{
                                color: "var(--saffron)",
                                fontSize: 9,
                                marginLeft: 6,
                                letterSpacing: 1,
                              }}
                            >
                              {t("common.you")}
                            </span>
                          )}
                        </div>
                        <div className="meta">
                          {c.status === "PENDING" && t("tontine.waiting")}
                          {c.status === "PAID" && (
                            <>
                              ✓ {t("tontine.paid")}
                              {c.paymentMethod && ` · ${c.paymentMethod}`}
                            </>
                          )}
                          {c.status === "CONFIRMED" && `✓✓ ${t("tontine.confirmed")}`}
                          {c.status === "MISSED" && "✗"}
                          {/* Spec §3.4 §4.4 : équivalent dans MA devise locale */}
                          {isMe && c.status === "PENDING" && (
                            <span style={{ marginLeft: 6 }}>
                              <LocalContributionAmount
                                contributionId={c.id}
                                compact
                              />
                            </span>
                          )}
                        </div>
                      </div>
                      {!canMarkPaid && !canConfirm && (
                        <div
                          className={`amount ${c.status === "CONFIRMED" ? "amount-pos" : ""}`}
                          style={{ fontSize: 14 }}
                        >
                          {c.amount}
                        </div>
                      )}
                      {canMarkPaid && (
                        <button
                          className="btn btn-sm"
                          onClick={() => markPaid(c.id)}
                        >
                          {t("tontine.iPaid")}
                        </button>
                      )}
                      {canConfirm && (
                        <button
                          className="btn btn-sm"
                          onClick={() => confirm(c.id)}
                          style={{
                            background:
                              "linear-gradient(135deg,var(--emerald),var(--indigo-2))",
                          }}
                        >
                          ✓ Confirmer
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Distribution */}
              {turn.status === "IN_PROGRESS" &&
                turn.contributions.length > 0 &&
                turn.contributions.every(
                  (c: any) => c.status === "CONFIRMED",
                ) && (
                  <button
                    className="btn btn-block"
                    onClick={() => distribute(turn.id)}
                    style={{ marginTop: 10 }}
                  >
                    🎁 Distribuer le pot à {turn.beneficiary.displayName}
                  </button>
                )}
            </div>
          ))}
        </>
      )}
      </div>
    </ResponsiveShell>
  );
}

/**
 * Bloc qui affiche la date d'un tour de tontine et permet :
 *  - Au bénéficiaire (ou admin) de fixer/modifier la date dans une fenêtre ±15j
 *  - Aux autres membres d'accuser réception après que le bénéficiaire l'a fixée
 *  - À tous de voir qui a accusé / qui pas
 *
 * Si le tour est DISTRIBUTED ou CANCELLED, on affiche juste les dates en lecture seule.
 */
function TurnDateBlock({
  turn,
  meId,
  isAdmin,
  onChanged,
}: {
  turn: any;
  meId?: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const t = useT();
  const [showAcks, setShowAcks] = useState(false);
  const [acks, setAcks] = useState<any | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [saving, setSaving] = useState(false);

  const isBeneficiary = meId === turn.beneficiary.id;
  const canSchedule = isBeneficiary || isAdmin;
  const isFinal = turn.status === "DISTRIBUTED" || turn.status === "CANCELLED";

  // Limites ±15 jours autour de dueDate
  const due = new Date(turn.dueDate);
  const minDate = new Date(due.getTime() - 15 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const maxDate = new Date(due.getTime() + 15 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  function startEdit() {
    setDraftDate(
      (turn.scheduledDate ?? turn.dueDate).slice(0, 10),
    );
    setEditing(true);
  }

  async function saveDate() {
    if (!draftDate) return;
    setSaving(true);
    try {
      await api.scheduleTurn(turn.id, new Date(draftDate));
      toast.success(t("tontine.dateScheduledNotification"));
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function ack() {
    try {
      await api.acknowledgeTurn(turn.id);
      toast.success(t("tontine.dateConfirmed"));
      void loadAcks();
      onChanged();
    } catch (e) {
      toast.error(e);
    }
  }

  async function loadAcks() {
    try {
      const r = await api.listTurnAcks(turn.id);
      setAcks(r);
    } catch (e) {
      toast.error(e);
    }
  }

  function toggleAcks() {
    if (!showAcks && !acks) void loadAcks();
    setShowAcks(!showAcks);
  }

  const myAck = acks?.members.find((m: any) => m.userId === meId);
  const ackedCount =
    acks?.members.filter((m: any) => m.acknowledged).length ?? 0;
  const totalNonBeneficiary =
    acks?.members.filter((m: any) => !m.isBeneficiary).length ?? 0;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--line-soft, #2a2435)",
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: "var(--gold, #C9A14A)",
              letterSpacing: 1.4,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            {t("tontine.tourDate")}
          </div>
          <div style={{ marginTop: 4, color: "var(--cream, #f0e6d8)" }}>
            {turn.scheduledDate ? (
              <>
                <strong>
                  {new Date(turn.scheduledDate).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--cream-soft, #c9bfae)",
                    marginTop: 2,
                  }}
                >
                  Prévu initialement :{" "}
                  {new Date(turn.dueDate).toLocaleDateString("fr-FR")}
                </div>
              </>
            ) : (
              <>
                <strong>
                  {new Date(turn.dueDate).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--cream-soft, #c9bfae)",
                    marginTop: 2,
                    fontStyle: "italic",
                  }}
                >
                  {t("tontine.tourDateHint")}
                </div>
              </>
            )}
          </div>
        </div>
        {!isFinal && canSchedule && !editing && (
          <button
            onClick={startEdit}
            className="btn-ghost btn-sm"
            style={{
              borderColor: "var(--saffron, #E8A33D)",
              color: "var(--saffron, #E8A33D)",
              padding: "6px 12px",
              minHeight: 36,
              fontSize: 12,
            }}
          >
            {turn.scheduledDate ? `✏️ ${t("tontine.huiModify")}` : t("tontine.setDate")}
          </button>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 10 }}>
          <label
            style={{
              fontSize: 11,
              color: "var(--cream-soft, #c9bfae)",
            }}
          >
            Choisis une date entre {new Date(minDate).toLocaleDateString("fr-FR")}{" "}
            et {new Date(maxDate).toLocaleDateString("fr-FR")} :
          </label>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              min={minDate}
              max={maxDate}
              style={{
                flex: 1,
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid var(--line-soft, #2a2435)",
                borderRadius: 8,
                background: "rgba(0,0,0,0.3)",
                color: "var(--cream, #f0e6d8)",
                minWidth: 0,
              }}
            />
            <button
              onClick={saveDate}
              disabled={saving || !draftDate}
              className="btn btn-sm"
              style={{ flexShrink: 0 }}
            >
              {saving ? "…" : "✓"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="btn-ghost btn-sm"
              style={{ flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Acknowledgements */}
      {turn.scheduledDate && !isFinal && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={toggleAcks}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--saffron, #E8A33D)",
              fontSize: 11,
              padding: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {showAcks ? "▾" : "▸"} Accusés de réception
            {acks && totalNonBeneficiary > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  color:
                    ackedCount === totalNonBeneficiary
                      ? "var(--emerald, #10b981)"
                      : "var(--cream-soft, #c9bfae)",
                }}
              >
                ({ackedCount}/{totalNonBeneficiary})
              </span>
            )}
          </button>
          {showAcks && acks && (
            <div style={{ marginTop: 8 }}>
              {acks.members.map((m: any) => (
                <div
                  key={m.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 0",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      display: "inline-block",
                      textAlign: "center",
                    }}
                  >
                    {m.isBeneficiary
                      ? "🎁"
                      : m.acknowledged
                        ? "✓"
                        : "⏳"}
                  </span>
                  <span
                    style={{
                      color: m.isBeneficiary
                        ? "var(--saffron, #E8A33D)"
                        : m.acknowledged
                          ? "var(--emerald, #10b981)"
                          : "var(--cream-soft, #c9bfae)",
                    }}
                  >
                    {m.displayName}
                    {m.userId === meId && " (moi)"}
                    {m.isBeneficiary && " · bénéficiaire"}
                  </span>
                </div>
              ))}
              {/* Bouton ack pour les non-bénéficiaires */}
              {!isBeneficiary && myAck && !myAck.acknowledged && (
                <button
                  onClick={ack}
                  className="btn btn-sm btn-block"
                  style={{ marginTop: 8 }}
                >
                  ✓ J'accuse réception de la date
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Historique d'une tontine : graphique des gains cumulés par bénéficiaire
 * et liste des tours distribués.
 *
 * Chargé séparément du flux principal pour ne pas alourdir le rendu initial.
 * Visible dès qu'au moins 1 tour a été distribué — sinon retourne null.
 */
function TontineHistoryBlock({
  groupId,
  currency,
}: {
  groupId: string;
  currency: string;
}) {
  const [history, setHistory] = useState<any | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    api
      .getTontineHistory(groupId)
      .then(setHistory)
      .catch(() => setHistory(null));
  }, [groupId]);

  if (!history) return null;
  const t = history.tontines[0];
  if (!t) return null;
  const distributedTurns = t.turns.filter((x: any) => x.status === "DISTRIBUTED");
  if (distributedTurns.length === 0) return null;

  // Aggrège les gains par bénéficiaire (cumul si plusieurs tours)
  const gainsByBeneficiary: Record<string, { name: string; total: number }> = {};
  for (const turn of distributedTurns) {
    const id = turn.beneficiary.id;
    if (!gainsByBeneficiary[id]) {
      gainsByBeneficiary[id] = {
        name: turn.beneficiary.displayName,
        total: 0,
      };
    }
    gainsByBeneficiary[id].total += parseFloat(turn.totalReceived);
  }
  const data = Object.values(gainsByBeneficiary).map((b) => ({
    label: b.name.split(" ")[0],
    value: Math.round(b.total),
  }));

  return (
    <div className="card">
      <div className="card-head">
        <h2 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {/* V52.C2 — SVG bar-chart-2 remplace 📈 */}
          <Icon name="bar-chart-2" size={20} color="currentColor" strokeWidth={1.6} />
          Historique des gains
        </h2>
        <button
          className="btn-ghost btn-sm"
          onClick={() => setShow(!show)}
          style={{ padding: "6px 12px" }}
        >
          {show ? "Masquer" : `${distributedTurns.length} tour${distributedTurns.length > 1 ? "s" : ""} ▾`}
        </button>
      </div>
      {show && (
        <>
          <div
            style={{
              fontSize: 11,
              color: "var(--cream-soft, #c9bfae)",
              marginBottom: 12,
            }}
          >
            Cumul des montants reçus depuis le début de la tontine
          </div>

          <BarChart
            data={data}
            height={180}
            valueFormat={(n) => n.toFixed(0)}
            unit={currency}
          />

          <div
            className="section-title"
            style={{
              marginTop: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* V52.C2 — SVG trophy remplace 🏆 */}
            <Icon name="trophy" size={16} color="currentColor" strokeWidth={1.6} />
            Détail des distributions
          </div>
          <div className="list">
            {distributedTurns.map((turn: any) => (
              <div key={turn.id} className="list-item">
                {/* V52.C2 — SVG gift remplace 🎁 */}
                <div className="icon" aria-hidden>
                  <Icon name="gift" size={18} color="var(--saffron)" strokeWidth={1.6} />
                </div>
                <div className="text">
                  <div className="name">
                    {t("tontine.tour", { n: String(turn.turnNumber) })} · {turn.beneficiary.displayName}
                  </div>
                  <div className="meta">
                    {turn.distributedAt
                      ? new Date(turn.distributedAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "Date inconnue"}{" "}
                    · {turn.paidCount}/{turn.contributorCount} cotisants
                  </div>
                </div>
                <div className="amount amount-pos">
                  {parseFloat(turn.totalReceived).toFixed(0)}{" "}
                  <small>{currency}</small>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// HUI / ENCHÈRES (spec §3.4)
// ============================================================
//
// Affiché uniquement pour les tontines en mode AUCTION sur les tours encore
// PENDING. Permet à chaque membre de poser/modifier sa mise, voir les autres
// mises (transparence), et à l'admin de clôturer pour désigner le gagnant.

function HuiBidsBlock({
  turnId,
  meId,
  currency,
  isAdmin,
  onChanged,
}: {
  turnId: string;
  meId: string | undefined;
  currency: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const dialog = useDialog();
  const t = useT();
  const [bids, setBids] = useState<Array<{
    id: string;
    bidderId: string;
    amount: string;
    won: boolean;
    bidder: { id: string; displayName: string; avatar: string | null };
  }> | null>(null);
  const [draftAmount, setDraftAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.listTurnBids(turnId);
      setBids(r);
      const mine = r.find((b) => b.bidderId === meId);
      if (mine && !draftAmount) setDraftAmount(mine.amount);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId, meId]);

  async function placeBid() {
    setErr(null);
    const amt = parseFloat(draftAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("Indique un montant positif (ex: 15)");
      return;
    }
    setBusy(true);
    try {
      await api.placeBid(turnId, draftAmount);
      await load();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function withdrawBid() {
    if (
      !(await dialog.confirm("Retirer ta mise sur ce tour ?", {
        variant: "warning",
        title: "Retirer ma mise",
        confirmLabel: "Retirer",
      }))
    )
      return;
    setBusy(true);
    try {
      await api.withdrawBid(turnId);
      setDraftAmount("");
      await load();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function closeBidding() {
    if (
      !(await dialog.confirm(
        t("tontine.closeBiddingHint"),
        {
          variant: "warning",
          title: t("tontine.closeBiddingTitle"),
          confirmLabel: t("tontine.huiClose"),
        },
      ))
    )
      return;
    setBusy(true);
    try {
      await api.closeBidding(turnId);
      await load();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const myBid = bids?.find((b) => b.bidderId === meId);
  const sortedBids = bids ? [...bids].sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount)) : [];

  return (
    <div
      style={{
        background: "rgba(232,163,61,0.06)",
        border: "1px solid var(--line)",
        borderLeft: "3px solid var(--saffron)",
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
      }}
    >
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
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--saffron)",
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {t("tontine.huiBids", { n: String((bids?.length ?? 0)) })} {bids?.length ?? 0} mise{(bids?.length ?? 0) > 1 ? "s" : ""}
        </h3>
        {isAdmin && (bids?.length ?? 0) > 0 && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={closeBidding}
            disabled={busy}
            style={{ padding: "4px 10px", fontSize: 11 }}
            title={t("tontine.auctionCloseTooltip")}
          >
            ${t("tontine.huiClose")}
          </button>
        )}
      </div>

      {/* Liste des mises (transparence — tout le monde voit) */}
      {sortedBids.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "0 0 10px 0",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {sortedBids.map((b, i) => (
            <li
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                background:
                  i === 0
                    ? "rgba(232,163,61,0.14)"
                    : "rgba(255,255,255,0.03)",
                border:
                  i === 0
                    ? "1px solid rgba(232,163,61,0.4)"
                    : "1px solid transparent",
                fontSize: 12,
              }}
            >
              <span style={{ width: 16, color: "var(--muted)" }}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
              </span>
              <span
                style={{
                  flex: 1,
                  color: "var(--cream)",
                  fontWeight: b.bidderId === meId ? 700 : 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {b.bidder.displayName}
                {b.bidderId === meId && (
                  <span
                    style={{
                      color: "var(--saffron)",
                      fontSize: 9,
                      marginLeft: 6,
                    }}
                  >
                    TOI
                  </span>
                )}
              </span>
              <span
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontWeight: 700,
                  color: i === 0 ? "var(--saffron)" : "var(--cream)",
                }}
              >
                {parseFloat(b.amount).toFixed(0)} {currency}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Formulaire de mise */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "stretch",
        }}
      >
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={draftAmount}
          onChange={(e) => setDraftAmount(e.target.value)}
          placeholder={myBid ? "Modifier ma mise…" : "Ma mise…"}
          style={{
            flex: 1,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--line-soft)",
            background: "var(--overlay-2)",
            color: "var(--cream)",
            fontSize: 13,
          }}
        />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            color: "var(--muted)",
            fontSize: 12,
            padding: "0 4px",
          }}
        >
          {currency}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={placeBid}
          disabled={busy || !draftAmount}
          style={{ padding: "6px 14px", fontSize: 12 }}
        >
          {myBid ? t("tontine.huiModify") : t("tontine.huiBid")}
        </button>
        {myBid && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={withdrawBid}
            disabled={busy}
            style={{ padding: "6px 10px", fontSize: 11 }}
            title="Retirer ma mise"
          >
            ✕
          </button>
        )}
      </div>

      {err && (
        <p
          style={{
            color: "#fca5a5",
            fontSize: 12,
            margin: "8px 0 0",
          }}
        >
          {err}
        </p>
      )}

      {(bids?.length ?? 0) === 0 && (
        <p
          style={{
            color: "var(--muted)",
            fontSize: 11,
            margin: "8px 0 0",
            fontStyle: "italic",
          }}
        >
          Aucune mise pour l'instant — sois le premier à enchérir 🚀
        </p>
      )}
    </div>
  );
}
