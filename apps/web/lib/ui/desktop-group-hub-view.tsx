"use client";

/**
 * V210 — Hub central de la vue groupe (desktop web).
 * =============================================================================
 * Refonte radicale de /dashboard/groups/[id] côté desktop pour donner UNE
 * vue d'ensemble immédiate de toute la matière du groupe.
 *
 * Layout « Bento BMD » (maquette 3 validée par Fabrice 2026-05-19) :
 *
 *   1. Hero cocoa (#2B1F15) plein largeur :
 *      - Titre groupe + sous-titre (type / devise / membres)
 *      - Solde net de l'utilisateur (saffron #E8B86A sur fond cocoa)
 *      - 2 sous-soldes (« on te doit » / « tu dois »)
 *      - CTA primaire « Ajouter » (saffron) + bouton réglages icône seule
 *
 *   2. Bento asymétrique :
 *      - Grosse tuile Dépenses (col 1, rangée 1+2)
 *      - Tuile Tontine emerald (col 2+3, rangée 1)
 *      - Tuile Caisses terracotta avec stats (col 2, rangée 2)
 *      - Tuile Membres (col 3, rangée 2)
 *
 *   3. Barre discrète en bas :
 *      - Réunions (count) / Documents (count) / Activité / ⚙️ Réglages
 *
 * Le hub fait son propre fetching en parallèle (1 mount = 1 Promise.all).
 * Toutes les actions (Ajouter dépense, Inviter, scroll Activité) sont des
 * callbacks remontés au parent qui gère les panels existants — on n'a rien
 * cassé du flow legacy, on a juste un nouvel écran d'entrée.
 *
 * Branchement : voir `apps/web/app/dashboard/groups/[id]/page.tsx` qui rend
 * ce composant en premier sur desktop, sauf si ?view=expenses (mode legacy
 * pour la création/édition de dépense qui réutilise toute la machinerie
 * existante du fichier original).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { AvatarColored } from "./avatar-colored";
// V224.C — Helper « charte du groupe » (couleurs custom + logo).
import { getGroupAccent } from "../group-accent";
// V227 — Helper unifié des 3 soldes (dépenses + tontine + caisses).
import {
  computeExpensesSolde,
  computeTontineSolde,
  computeFundsSolde,
  type FundDetail,
} from "../group-soldes";

type Group = {
  id: string;
  name: string;
  type: string;
  defaultCurrency: string;
  members: Array<{
    id: string;
    userId: string;
    user: {
      id: string;
      displayName: string;
      photoUrl?: string | null;
    };
  }>;
  // V224.C — Charte custom (color + logo). Optionnel : un groupe sans charte
  // renvoie null et le helper getGroupAccent fournit les valeurs par défaut.
  theme?: {
    primaryColor?: string | null;
    accentColor?: string | null;
    logoUrl?: string | null;
  } | null;
  customLogoUrl?: string | null;
};

// V227 — Le hub reçoit la réponse brute de `api.getBalance` :
// { currency, balances[], suggestions[] }. L'ancien shape `{ net, byPerson }`
// n'était jamais alimenté → solde affiché systématiquement à 0 (bug Fabrice).
type Balance = {
  currency?: string;
  balances?: Array<{ userId: string; displayName?: string; net: string | number }>;
  suggestions?: Array<{
    fromUserId: string;
    fromName?: string;
    toUserId: string;
    toName?: string;
    amount: string | number;
    currency?: string;
  }>;
} | null;

type Expense = {
  id: string;
  description: string;
  amount: string | number;
  currency: string;
  date: string;
  paidByUser?: { id: string; displayName: string };
  category?: string;
};

type FundRow = Awaited<ReturnType<typeof api.listProjectFunds>>[number];

type DesktopGroupHubViewProps = {
  group: Group;
  balance: Balance;
  expenses: Expense[];
  me: { id: string; displayName: string } | null;
  onAddExpense: () => void;
  onOpenInvite: () => void;
  onOpenLegacyExpenses: () => void;
};

/**
 * Composant standalone — hub bento. Le parent passe les données déjà
 * fetchées (group / balance / expenses) et le hub se charge des fetchs
 * complémentaires (funds list, tontine, meetings count, feature gate).
 */
export function DesktopGroupHubView({
  group,
  balance,
  expenses,
  me,
  onAddExpense,
  onOpenInvite,
  onOpenLegacyExpenses,
}: DesktopGroupHubViewProps) {
  const router = useRouter();
  const t = useT();
  const { formatAmount } = useCurrency();

  const [funds, setFunds] = useState<FundRow[]>([]);
  const [fundsEnabled, setFundsEnabled] = useState(false);
  const [tontine, setTontine] = useState<any | null>(null);
  const [meetingsCount, setMeetingsCount] = useState<number | null>(null);
  // V227 — Détail par caisse (contributions par user) pour le solde Caisses
  // dans le hero. Chargé après la liste, en parallèle. Si une caisse échoue
  // on garde null à sa place → le helper l'ignorera.
  const [fundDetails, setFundDetails] = useState<FundDetail[]>([]);

  // Fetch parallèle de tout ce que le hub a besoin et qui n'est pas déjà
  // dans le state du parent. On reste silencieux sur les erreurs (les
  // tuiles concernées affichent un état vide propre).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [gateRes, tontineRes, meetingsRes] = await Promise.allSettled([
        api.projectFundsFeatureGate(),
        api.getTontine(group.id),
        api.listMeetings(group.id),
      ]);
      if (cancelled) return;

      const gateOk =
        gateRes.status === "fulfilled" && Boolean(gateRes.value?.enabled);
      setFundsEnabled(gateOk);

      if (tontineRes.status === "fulfilled") {
        setTontine(tontineRes.value?.tontine ?? null);
      }
      if (meetingsRes.status === "fulfilled") {
        const arr = (meetingsRes.value as any)?.meetings ?? meetingsRes.value;
        setMeetingsCount(Array.isArray(arr) ? arr.length : 0);
      }

      if (gateOk) {
        try {
          const list = await api.listProjectFunds(group.id);
          if (!cancelled) setFunds(list);
          // V227 — Fetch détail de chaque caisse pour pouvoir calculer le
          // solde Caisses du user (somme des contributions VALIDATED).
          // Promise.allSettled : si une caisse plante, les autres passent.
          if (list.length > 0) {
            const details = await Promise.allSettled(
              list.map((f) => api.getProjectFund(f.id)),
            );
            if (!cancelled) {
              setFundDetails(
                details.map((d) => (d.status === "fulfilled" ? d.value : null)),
              );
            }
          }
        } catch {
          // Feature ON mais endpoint indispo : on garde la tuile en empty state.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  // ── Stats Caisses : total, en cours, terminées, collecté ────────────
  // V210.C — La tuile Caisses doit donner une vue d'ensemble en un coup d'œil.
  const fundsStats = useMemo(() => {
    const total = funds.length;
    const active = funds.filter((f) => f.status === "ACTIVE").length;
    const closed = funds.filter((f) => f.status === "CLOSED").length;
    const draft = funds.filter((f) => f.status === "DRAFT").length;
    const totalCollected = funds.reduce(
      (sum, f) => sum + Number(f.contributed || 0),
      0,
    );
    const currency = funds[0]?.currency || group.defaultCurrency || "EUR";
    return { total, active, closed, draft, totalCollected, currency };
  }, [funds, group.defaultCurrency]);

  // ── V227 — Triplet de soldes (dépenses + tontine + caisses) ───────
  // Bug historique : on lisait `balance.net` / `balance.byPerson` qui
  // n'existent pas dans le payload réel de `api.getBalance`. Résultat :
  // solde affiché = 0 systématique. On dérive maintenant proprement via
  // le helper `group-soldes` qui parse `balance.balances[]` + suggestions.
  const meId = me?.id;
  const expensesSolde = useMemo(
    () => (meId ? computeExpensesSolde(balance, meId) : null),
    [balance, meId],
  );
  const tontineSolde = useMemo(
    () => (meId ? computeTontineSolde(tontine, meId) : null),
    [tontine, meId],
  );
  const fundsSolde = useMemo(
    () => (meId ? computeFundsSolde(fundDetails, meId) : null),
    [fundDetails, meId],
  );

  const net = expensesSolde?.net ?? 0;
  // Sous-soldes legacy gardés pour la mini-ligne « X te doit Y · tu dois Z ».
  // On recompose à partir des suggestions de règlement.
  const owedToMeTop = (balance?.suggestions ?? []).find(
    (s) => s.toUserId === meId,
  );
  const iOweTop = (balance?.suggestions ?? []).find(
    (s) => s.fromUserId === meId,
  );
  const owedToMe = (balance?.suggestions ?? [])
    .filter((s) => s.toUserId === meId)
    .reduce((acc, s) => acc + Number(s.amount || 0), 0);
  const iOwe = (balance?.suggestions ?? [])
    .filter((s) => s.fromUserId === meId)
    .reduce((acc, s) => acc + Number(s.amount || 0), 0);

  // ── Type label / icon ──────────────────────────────────────────────
  const typeLabel =
    group.type === "TONTINE"
      ? t("group.type.tontine") || "Tontine"
      : group.type === "TRAVEL"
        ? t("group.type.travel") || "Voyage"
        : group.type === "COLOC"
          ? t("group.type.coloc") || "Coloc"
          : group.type === "EVENT"
            ? t("group.type.event") || "Événement"
            : group.type === "CLUB"
              ? t("group.type.club") || "Club"
              : group.type === "PARISH"
                ? t("group.type.parish") || "Paroisse"
                : t("group.type.generic") || "Groupe";

  const recent = expenses.slice(0, 4);

  // ── Données tontine enrichies (V222.B) ──────────────────────────────
  // On distingue clairement les états :
  //   - tontine === null → empty state (rien créé, ou supprimé via V219.B)
  //   - status === DRAFT → carte « En préparation » + CTA activer
  //   - status === ACTIVE → carte enrichie (prochain tour + stats)
  //   - status === COMPLETED|CANCELLED → carte minimale (peu probable
  //     puisque la logique 1 active par groupe filtre, mais on garde un
  //     fallback gracieux).
  // V222.B : le bénéficiaire « prochain » est le turn IN_PROGRESS ; à
  // défaut, le premier PENDING (= le suivant qui va passer en cours).
  const tontineActive = tontine && tontine.status === "ACTIVE";
  const tontineDraft = tontine && tontine.status === "DRAFT";
  const tontineName = (tontine?.name as string | undefined) || null;
  const nextTurn = tontineActive
    ? tontine?.turns?.find((tr: any) => tr.status === "IN_PROGRESS")
      || tontine?.turns?.find((tr: any) => tr.status === "PENDING")
      || null
    : null;
  const memberCount = group.members.length;
  const contributionAmountNum = Number(tontine?.contributionAmount ?? 0) || 0;
  // V222.B limite assumée : contributionAmount * memberCount peut être
  // gros mais reste < Number.MAX_SAFE pour des tontines normales. On
  // arrondit pour éviter les drift FP, et formatAmount fait le reste.
  const totalPot = Math.round((contributionAmountNum * memberCount) * 100) / 100;
  const tontineCurrency = (tontine?.currency as string | undefined)
    || group.defaultCurrency
    || "EUR";
  // Date du prochain tour : scheduledDate prioritaire, sinon dueDate.
  const nextTurnDateRaw = nextTurn?.scheduledDate || nextTurn?.dueDate || null;
  const nextTurnDate = nextTurnDateRaw ? new Date(nextTurnDateRaw) : null;
  const nextTurnDateValid = nextTurnDate && !Number.isNaN(nextTurnDate.getTime());
  // Contributions confirmées sur le prochain tour (pour la mini progress).
  const nextTurnContribs = (nextTurn?.contributions ?? []) as Array<{
    status: string;
  }>;
  const confirmedCount = nextTurnContribs.filter(
    (c) => c.status === "CONFIRMED",
  ).length;
  const totalTurns = tontine?.turns?.length || 0;
  // V222.B : « turns terminés » = DISTRIBUTED (le tour a payé). On
  // gardait à tort COMPLETED dans la version V210 ; le shape réel est
  // PENDING/IN_PROGRESS/DISTRIBUTED/CANCELLED.
  const distributedTurns = tontine?.turns?.filter(
    (tr: any) => tr.status === "DISTRIBUTED",
  ).length || 0;
  // Pour le mode DRAFT : combien de membres ont confirmé (utile pour
  // afficher « X/Y prêts »).
  const draftReadyCount = memberCount; // V222.B placeholder : pas d'info
  // de confirmation côté DRAFT pour l'instant — on affiche juste X/Y où
  // Y = total des membres. Le backend ne nous donne pas encore le
  // « ready » par membre, donc on reste honnête : X = members.length.

  // Locale active pour l'Intl.DateTimeFormat (FR par défaut).
  const navLocale =
    (typeof navigator !== "undefined" && navigator.language) || "fr-FR";

  // V224.C — Charte du groupe : applique la couleur primaire sur le solde
  // positif + le badge type + affiche le logo custom à côté du nom.
  const accent = getGroupAccent(group as any);

  return (
    <div className="bmd-hub-root" style={{ padding: "0 24px 24px", maxWidth: 1280, margin: "0 auto" }}>
      {/* ============================================================== */}
      {/* HERO COCOA — le bandeau qui ancre toute la page                 */}
      {/* V224.C — Si charte custom, on remplace le gradient cocoa par un  */}
      {/* gradient teinté primaryColor → accentColor (toujours sombre).    */}
      {/* ============================================================== */}
      <section
        style={{
          background: accent.hasCustom
            ? `linear-gradient(135deg, #2B1F15 0%, ${accent.color}28 100%)`
            : "linear-gradient(135deg, #2B1F15 0%, #3A2A1D 100%)",
          color: "#F4E4C1",
          borderRadius: 18,
          padding: "26px 32px",
          marginBottom: 14,
          boxShadow: "0 1px 0 rgba(244,228,193,0.04) inset",
          borderTop: accent.hasCustom
            ? `2px solid ${accent.color}`
            : undefined,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* V224.C — Ligne logo + libellé type/devise. Le logo apparaît
                quand le groupe a `theme.logoUrl` ou `customLogoUrl` set. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              {accent.logoUrl && (
                <img
                  src={accent.logoUrl}
                  alt=""
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    objectFit: "cover",
                    background: "#FFFFFF",
                    border: "1px solid rgba(255,255,255,0.18)",
                  }}
                  onError={(e) => {
                    // Si l'URL casse (CDN down, data URL corrompue), on cache
                    // proprement l'image plutôt que d'afficher une icône broken.
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div
                style={{
                  fontSize: 10,
                  opacity: 0.55,
                  textTransform: "lowercase",
                  letterSpacing: "0.1em",
                }}
              >
                {typeLabel} · {group.defaultCurrency} · {group.members.length} {(t("group.membersCount") || "membres")}
              </div>
            </div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 500,
                color: "#FAF6EE",
                margin: 0,
                letterSpacing: "-0.3px",
              }}
            >
              {group.name}
            </h1>
            <div
              style={{
                fontSize: 11,
                opacity: 0.7,
                marginTop: 18,
                textTransform: "lowercase",
                letterSpacing: "0.04em",
              }}
            >
              {t("group.hub.yourBalance") || "tes soldes dans ce groupe"}
            </div>
            {/* V227 — 3 mini-cards : Dépenses / Tontine / Caisses. Chaque card
                a sa propre devise (le groupe peut mélanger : tontine en EUR,
                caisses en XOF). On évite ainsi le bug du chiffre unique
                incohérent quand les modules ne sont pas dans la même devise. */}
            <SoldeTriplet
              expensesSolde={expensesSolde}
              tontineSolde={tontineSolde}
              fundsSolde={fundsSolde}
              groupCurrency={group.defaultCurrency}
              accentColor={accent.hasCustom ? accent.color : null}
              t={t}
              formatAmount={formatAmount}
            />
            {(owedToMe > 0 || iOwe > 0) && (
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 10 }}>
                {owedToMeTop && (
                  <>
                    <span style={{ color: "#9BD9B8" }}>
                      {owedToMeTop.toName ?? owedToMeTop.fromName ?? ""}{" "}
                      {t("group.hub.owesYou") || "te doit"}{" "}
                      {formatAmount(
                        Number(owedToMeTop.amount || 0),
                        owedToMeTop.currency || group.defaultCurrency,
                      )}
                    </span>
                    {iOweTop && <span style={{ opacity: 0.4 }}> · </span>}
                  </>
                )}
                {iOweTop && (
                  <span style={{ color: "#F0B89B" }}>
                    {t("group.hub.youOwe") || "tu dois"}{" "}
                    {formatAmount(
                      Number(iOweTop.amount || 0),
                      iOweTop.currency || group.defaultCurrency,
                    )}{" "}
                    {t("common.to") || "à"}{" "}
                    {iOweTop.toName ?? ""}
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={onAddExpense}
              style={{
                padding: "11px 18px",
                background: "#C58A2E",
                color: "#2B1F15",
                border: "none",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t("group.hub.addExpense") || "Ajouter"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/groups/${group.id}/settings`)}
              aria-label={t("group.settings") || "Réglages"}
              title={t("group.settings") || "Réglages"}
              style={{
                padding: "11px 12px",
                background: "rgba(244,228,193,0.10)",
                color: "#F4E4C1",
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h.1A1.7 1.7 0 0010 3.1V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* BENTO ASYMÉTRIQUE                                                */}
      {/* ============================================================== */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gridTemplateRows: "auto auto",
          gap: 12,
          marginBottom: 14,
        }}
      >
        {/* ── TUILE DÉPENSES (col 1, rangée 1-2, la grosse) ─────────────── */}
        <article
          style={{
            gridColumn: "1",
            gridRow: "1 / 3",
            background: "#FFFFFF",
            border: "0.5px solid #D9C8A6",
            borderRadius: 16,
            padding: 18,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: "#F4E4C1",
                  color: "#6B4A1A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                  <line x1="9" y1="17" x2="15" y2="17" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#2B1F15" }}>
                  {t("group.hub.expenses") || "Dépenses"}
                </div>
                <div style={{ fontSize: 11, color: "#8B6F47" }}>
                  {expenses.length} {t("group.hub.entries") || "entrées"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/groups/${group.id}/expenses`)}
              style={{
                background: "transparent",
                border: "none",
                color: "#C58A2E",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("group.hub.viewAll") || "Tout voir"} ›
            </button>
          </header>

          {recent.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#8B6F47",
                fontSize: 13,
                gap: 8,
                padding: "20px 12px",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: 28 }}>📋</span>
              <span>{t("group.hub.expensesEmpty") || "Aucune dépense pour l'instant"}</span>
              <button
                type="button"
                onClick={onAddExpense}
                style={{
                  marginTop: 4,
                  padding: "8px 14px",
                  background: "#C58A2E",
                  color: "#FAF6EE",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t("group.hub.addFirstExpense") || "Ajouter la première"}
              </button>
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recent.map((e, idx) => (
                <li
                  key={e.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: idx === recent.length - 1 ? "none" : "0.5px dashed #EEE4CC",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#2B1F15", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.description}
                    </div>
                    <div style={{ fontSize: 11, color: "#8B6F47", marginTop: 1 }}>
                      {e.paidByUser?.displayName || e.paidBy?.displayName || "—"} · {(() => {
                        // V218.E — Backend retourne `occurredAt`, le code lisait
                        // `e.date` qui n'existe pas → "Invalid Date". Helper inline
                        // qui lit les 3 sources possibles + guard NaN.
                        const raw = e.occurredAt ?? e.date ?? e.createdAt;
                        if (!raw) return "—";
                        const d = new Date(raw);
                        return Number.isNaN(d.getTime())
                          ? "—"
                          : d.toLocaleDateString();
                      })()}
                    </div>
                  </div>
                  <div
                    className="bmd-num"
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: e.paidByUser?.id === me?.id ? "#1F7A57" : "#2B1F15",
                      flexShrink: 0,
                      marginLeft: 12,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatAmount(Number(e.amount), e.currency)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        {/* ── TUILE TONTINE (col 2-3, rangée 1, refonte V222.B) ──────────
            On reste sur 1 card cohérente avec le reste du bento (fond
            blanc, bordure sable, radius 14, padding 18×20). Le contenu
            change selon l'état :
              • tontine === null            → empty state + CTA Créer
              • status === DRAFT            → en préparation + CTA Activer
              • status === ACTIVE + nextTurn → header + prochain tour
                + 3 mini-stats (par personne / panier total /
                contributions reçues + progress) + CTA Voir la tontine
              • status === ACTIVE sans turn  → stats globales seules
        */}
        <article
          style={{
            gridColumn: "2 / 4",
            gridRow: "1",
            background: "#FFFFFF",
            color: "#2B1F15",
            border: "0.5px solid #D9C8A6",
            borderRadius: 14,
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* — Header : titre + nom tontine + chip status — */}
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "#F4E4C1",
                  color: "#6B4A1A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3v9l6 3" />
                </svg>
              </div>
              <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#2B1F15" }}>
                  {t("group.hub.tontine.title") || "Tontine"}
                </span>
                {tontineName && (
                  <span style={{ fontSize: 12, color: "#8B6F47", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                    · {tontineName}
                  </span>
                )}
              </div>
            </div>

            {tontine && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: tontineActive
                    ? "rgba(31,122,87,0.12)"
                    : tontineDraft
                      ? "rgba(197,138,46,0.14)"
                      : "rgba(159,70,40,0.14)",
                  color: tontineActive
                    ? "#1F7A57"
                    : tontineDraft
                      ? "#C58A2E"
                      : "#9F4628",
                  flexShrink: 0,
                }}
              >
                {tontineActive
                  ? (t("group.hub.tontine.statusActive") || "Active")
                  : tontineDraft
                    ? (t("group.hub.tontine.statusDraft") || "Brouillon")
                    : (t("group.hub.tontine.statusDone") || "Terminée")}
              </span>
            )}
          </header>

          {/* — Corps : empty / draft / active — */}
          {!tontine && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: "8px 0 2px" }}>
              <div style={{ fontSize: 12, color: "#8B6F47" }}>
                {t("group.hub.tontine.empty") || "Pas de tontine en cours"}
              </div>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/groups/${group.id}/tontine`)}
                style={{
                  padding: "8px 14px",
                  background: "#C58A2E",
                  color: "#FAF6EE",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t("group.hub.tontine.createCta") || "Créer une tontine"}
              </button>
            </div>
          )}

          {tontineDraft && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "2px 0" }}>
              <div style={{ fontSize: 12, color: "#8B6F47" }}>
                {(t("group.hub.tontine.draftStatus", {
                  ready: String(draftReadyCount),
                  total: String(memberCount),
                }) || `En préparation · ${draftReadyCount} / ${memberCount} membres confirmés`)}
              </div>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/groups/${group.id}/tontine`)}
                style={{
                  padding: "7px 13px",
                  background: "#C58A2E",
                  color: "#FAF6EE",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                {t("group.hub.tontine.activate") || "Activer"}
              </button>
            </div>
          )}

          {tontineActive && (
            <>
              {/* Prochain tour : avatar + nom + date + lieu */}
              {nextTurn ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    background: "#FAF6EE",
                    border: "0.5px solid #EEE4CC",
                    borderRadius: 12,
                  }}
                >
                  <AvatarColored
                    userId={nextTurn.beneficiary?.id || "next"}
                    initials={nextTurn.beneficiary?.displayName || "—"}
                    size={44}
                    photoUrl={nextTurn.beneficiary?.avatar || undefined}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#8B6F47", textTransform: "lowercase", letterSpacing: "0.04em" }}>
                      {t("group.hub.tontine.nextTurn") || "Prochain tour"}
                      {totalTurns > 0 && (
                        <span style={{ marginLeft: 6, color: "#A88B5A" }}>
                          · {distributedTurns + 1}/{totalTurns}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, color: "#2B1F15", marginTop: 1, display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
                      <span>
                        {t("group.hub.tontine.beneficiary") || "Bénéficiaire"} ·{" "}
                      </span>
                      <span style={{ color: "#C58A2E", fontWeight: 500 }}>
                        {nextTurn.beneficiary?.displayName || "—"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#8B6F47", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {nextTurnDateValid && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          {new Intl.DateTimeFormat(navLocale, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          }).format(nextTurnDate!)}
                        </span>
                      )}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {nextTurn.location || (t("group.hub.tontine.locationTBD") || "Lieu à confirmer")}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Mini-stats : par personne / panier total / contributions */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1.4fr",
                  gap: 8,
                }}
              >
                <MiniStat
                  label={t("group.hub.tontine.perPerson") || "Par personne"}
                  value={formatAmount(contributionAmountNum, tontineCurrency)}
                />
                <MiniStat
                  label={t("group.hub.tontine.totalPot") || "Panier total"}
                  value={formatAmount(totalPot, tontineCurrency)}
                />
                <MiniStat
                  label={t("group.hub.tontine.contributionsReceived") || "Contributions reçues"}
                  value={`${confirmedCount} / ${memberCount}`}
                  progress={memberCount > 0 ? confirmedCount / memberCount : 0}
                />
              </div>

              {/* CTA bas : Voir la tontine */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/groups/${group.id}/tontine`)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#C58A2E",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {t("group.hub.tontine.seeFull") || "Voir la tontine"} ›
                </button>
              </div>
            </>
          )}
        </article>

        {/* ── TUILE CAISSES PROJET (col 2, rangée 2, terracotta) ──────── */}
        {fundsEnabled ? (
          <article
            style={{
              gridColumn: "2",
              gridRow: "2",
              background: "#9F4628",
              color: "#FAF6EE",
              borderRadius: 16,
              padding: 16,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={() => router.push(`/dashboard/groups/${group.id}/funds`)}
          >
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12V7H5a2 2 0 010-4h14v4" />
                  <path d="M3 5v14a2 2 0 002 2h16v-5" />
                  <path d="M18 12a2 2 0 100 4h4v-4z" />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {t("group.hub.funds") || "Caisses"}
                </span>
              </div>
              <span style={{ fontSize: 11, opacity: 0.85 }}>›</span>
            </header>
            {fundsStats.total === 0 ? (
              <div style={{ fontSize: 11, opacity: 0.85, paddingTop: 4 }}>
                {t("group.hub.fundsEmpty") || "Pas encore de caisse — clique pour en créer une"}
              </div>
            ) : (
              <>
                <div className="bmd-num" style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                  {fundsStats.total}
                </div>
                <div style={{ fontSize: 10, opacity: 0.85, textTransform: "lowercase", letterSpacing: "0.04em" }}>
                  {fundsStats.total > 1
                    ? t("group.hub.fundsTotal") || "caisses au total"
                    : t("group.hub.fundsTotalSingular") || "caisse au total"}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 11 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#9BD9B8" }} />
                    {fundsStats.active} {t("group.hub.fundsActive") || "en cours"}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.85 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(244,228,193,0.6)" }} />
                    {fundsStats.closed} {t("group.hub.fundsClosed") || "terminées"}
                  </span>
                </div>
                <div style={{ fontSize: 10, opacity: 0.85, marginTop: 10, paddingTop: 8, borderTop: "0.5px solid rgba(244,228,193,0.18)" }}>
                  {t("group.hub.totalCollected") || "Collecté"} :{" "}
                  <span className="bmd-num" style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                    {formatAmount(fundsStats.totalCollected, fundsStats.currency)}
                  </span>
                </div>
              </>
            )}
          </article>
        ) : (
          <article
            style={{
              gridColumn: "2",
              gridRow: "2",
              background: "#FAF6EE",
              border: "0.5px dashed #D9C8A6",
              borderRadius: 16,
              padding: 16,
              color: "#8B6F47",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            {t("group.hub.fundsDisabled") || "Caisses projet désactivées"}
          </article>
        )}

        {/* ── TUILE MEMBRES (col 3, rangée 2) ─────────────────────────── */}
        <article
          style={{
            gridColumn: "3",
            gridRow: "2",
            background: "#FFFFFF",
            border: "0.5px solid #D9C8A6",
            borderRadius: 16,
            padding: 16,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
          }}
          onClick={() => router.push(`/dashboard/groups/${group.id}/members`)}
        >
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B4A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#2B1F15" }}>
                {t("group.hub.members") || "Membres"}
              </span>
            </div>
            {/* V215.D1 — Bouton « Inviter » primary saffron, beaucoup plus
                visible qu'avant (était un simple lien texte couleur saffron).
                Bouton plein avec icône + ouvre le DesktopInviteDrawer refondu. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenInvite();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                background: "#C58A2E",
                color: "#FAF6EE",
                border: "none",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 1px 3px rgba(159,70,40,0.20)",
                letterSpacing: "0.02em",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t("group.hub.invite") || "Inviter"}
            </button>
          </header>
          <div style={{ display: "flex", marginTop: 4 }}>
            {group.members.slice(0, 5).map((m, idx) => (
              <div
                key={m.id}
                style={{
                  marginRight: idx === group.members.slice(0, 5).length - 1 ? 0 : -8,
                  border: "2px solid #FFFFFF",
                  borderRadius: "50%",
                  zIndex: 5 - idx,
                }}
              >
                <AvatarColored
                  userId={m.user?.id || m.id}
                  initials={m.user?.displayName || ""}
                  size={28}
                  photoUrl={m.user?.photoUrl || undefined}
                />
              </div>
            ))}
            {group.members.length > 5 && (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#F4E4C1",
                  color: "#6B4A1A",
                  fontSize: 10,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #FFFFFF",
                  marginLeft: -8,
                }}
              >
                +{group.members.length - 5}
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#8B6F47", marginTop: 10 }}>
            {group.members.length} {group.members.length > 1 ? t("group.hub.peoplePlural") || "personnes" : t("group.hub.peopleSingular") || "personne"}
          </div>
        </article>
      </section>

      {/* ============================================================== */}
      {/* BARRE DISCRÈTE — Réunions / Documents / Activité / Réglages    */}
      {/* ============================================================== */}
      <nav
        aria-label={t("group.hub.secondaryNav") || "Sections secondaires"}
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <HubSecondaryTile
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
          label={t("group.hub.meetings") || "Réunions"}
          count={meetingsCount ?? undefined}
          onClick={() => router.push(`/dashboard/groups/${group.id}/meetings`)}
        />
        <HubSecondaryTile
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          )}
          label={t("group.hub.documents") || "Documents"}
          onClick={() => router.push(`/dashboard/groups/${group.id}/attachments`)}
        />
        <HubSecondaryTile
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
          )}
          label={t("group.hub.activity") || "Activité"}
          onClick={() => router.push(`/dashboard/groups/${group.id}/activity`)}
        />
        <div style={{ flex: 1 }} />
        <HubSecondaryTile
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h.1A1.7 1.7 0 0010 3.1V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
            </svg>
          )}
          label={t("group.settings") || "Réglages"}
          onClick={() => router.push(`/dashboard/groups/${group.id}/settings`)}
          iconOnly
        />
      </nav>
    </div>
  );
}

/**
 * V222.B — Mini-stat compacte pour le bloc tontine du hub.
 *
 * 1 ligne : label discret (tabular, lowercase, sable) + valeur en gros.
 * Si `progress` est fourni (0..1), on rajoute une mini barre saffron en
 * dessous (cas « Contributions reçues »). Le composant respecte la
 * grille du bloc tontine qui aligne 3 mini-stats horizontalement.
 */
function MiniStat({
  label,
  value,
  progress,
}: {
  label: string;
  value: string;
  progress?: number;
}) {
  // Clamp anti-overflow : si progress > 1 (cas edge bizarre où
  // confirmedCount > memberCount), on borne à 100% pour éviter qu'une
  // barre déborde de sa boite.
  const pct = typeof progress === "number"
    ? Math.max(0, Math.min(1, progress)) * 100
    : null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "8px 10px",
        background: "#FAF6EE",
        border: "0.5px solid #EEE4CC",
        borderRadius: 10,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#8B6F47",
          textTransform: "lowercase",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div
        className="bmd-num"
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "#2B1F15",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.2px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
      {pct !== null && (
        <div
          style={{
            height: 4,
            background: "#EEE4CC",
            borderRadius: 2,
            marginTop: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "#C58A2E",
              transition: "width 0.2s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * V227 — Triplet de mini-cards pour le hero : Dépenses / Tontine / Caisses.
 * Chaque card affiche un label, un gros montant, une mention contextuelle
 * (« 3 personnes te doivent », « 2/6 tours », etc.). Si la source n'est pas
 * dispo (pas de tontine active, pas de caisse), la card passe en grisé.
 *
 * Les couleurs viennent du hero cocoa, donc on travaille en ivory clair
 * sur fond translucide. Sage clair = créditeur, terracotta clair = débiteur.
 */
function SoldeTriplet({
  expensesSolde,
  tontineSolde,
  fundsSolde,
  groupCurrency,
  accentColor,
  t,
  formatAmount,
}: {
  expensesSolde: ReturnType<typeof computeExpensesSolde> | null;
  tontineSolde: ReturnType<typeof computeTontineSolde> | null;
  fundsSolde: ReturnType<typeof computeFundsSolde> | null;
  groupCurrency: string;
  accentColor: string | null;
  t: (k: string) => string | undefined;
  formatAmount: (amount: number, currency: string) => string;
}) {
  // ── Card Dépenses ─────────────────────────────────────────────────
  const expensesNet = expensesSolde?.net ?? 0;
  const expensesCurrency = expensesSolde?.currency || groupCurrency;
  let expensesSubtitle: string;
  if (!expensesSolde || (expensesNet === 0 && (expensesSolde.inboundCount + expensesSolde.outboundCount === 0))) {
    expensesSubtitle = t("group.hub.solde.uptoDate") || "Tu es à jour";
  } else if (expensesNet > 0) {
    const tpl = t("group.hub.solde.othersOweYou") || "{count} personnes te doivent";
    expensesSubtitle = tpl.replace("{count}", String(expensesSolde.inboundCount || 1));
  } else if (expensesNet < 0) {
    const tpl = t("group.hub.solde.youOwe") || "Tu dois à {count} personnes";
    expensesSubtitle = tpl.replace("{count}", String(expensesSolde.outboundCount || 1));
  } else {
    expensesSubtitle = t("group.hub.solde.uptoDate") || "Tu es à jour";
  }

  // ── Card Tontine ──────────────────────────────────────────────────
  const tontineIsActive = tontineSolde?.net != null;
  const tontineNet = tontineSolde?.net ?? 0;
  const tontineCur = tontineSolde?.currency || groupCurrency;
  let tontineSubtitle: string;
  if (!tontineIsActive) {
    tontineSubtitle = t("group.hub.solde.noTontine") || "Aucune tontine active";
  } else if (tontineSolde && tontineSolde.receivedTurn) {
    const tpl = t("group.hub.solde.tontineTurnsProgress") || "{current}/{total} tours";
    tontineSubtitle = tpl
      .replace("{current}", String(tontineSolde.turnsDistributed))
      .replace("{total}", String(tontineSolde.turnsTotal));
  } else if (tontineSolde) {
    tontineSubtitle =
      t("group.hub.solde.tontineNotYetReceived") || "Tu n'as pas encore reçu ton tour";
  } else {
    tontineSubtitle = t("group.hub.solde.noTontine") || "Aucune tontine active";
  }

  // ── Card Caisses ──────────────────────────────────────────────────
  const fundsNet = fundsSolde?.net ?? 0;
  const fundsCur = fundsSolde?.currency || groupCurrency;
  const fundsHasAny = Boolean(fundsSolde && fundsSolde.breakdown.length > 0);
  let fundsSubtitle: string;
  if (!fundsHasAny) {
    fundsSubtitle = t("group.hub.solde.noFunds") || "Aucune caisse";
  } else {
    const tpl = t("group.hub.solde.fundsContributions") || "{n} versements confirmés";
    fundsSubtitle = tpl.replace("{n}", String(fundsSolde?.contributionsCount ?? 0));
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 10,
        marginTop: 8,
        maxWidth: 620,
      }}
    >
      <SoldeCard
        label={t("group.hub.solde.expenses") || "Dépenses"}
        net={expensesNet}
        currency={expensesCurrency}
        subtitle={expensesSubtitle}
        disabled={false}
        accentColor={accentColor}
        formatAmount={formatAmount}
      />
      <SoldeCard
        label={t("group.hub.solde.tontine") || "Tontine"}
        net={tontineIsActive ? tontineNet : null}
        currency={tontineCur}
        subtitle={tontineSubtitle}
        disabled={!tontineIsActive}
        accentColor={accentColor}
        formatAmount={formatAmount}
      />
      <SoldeCard
        label={t("group.hub.solde.funds") || "Caisses"}
        net={fundsHasAny ? fundsNet : null}
        currency={fundsCur}
        subtitle={fundsSubtitle}
        disabled={!fundsHasAny}
        accentColor={accentColor}
        formatAmount={formatAmount}
      />
    </div>
  );
}

/**
 * V227 — Carte unitaire d'un solde (cocoa hero).
 * `disabled = true` → grisée, montant masqué, sous-titre type « Aucun ».
 * `net === null` → idem disabled.
 */
function SoldeCard({
  label,
  net,
  currency,
  subtitle,
  disabled,
  accentColor,
  formatAmount,
}: {
  label: string;
  net: number | null;
  currency: string;
  subtitle: string;
  disabled: boolean;
  accentColor: string | null;
  formatAmount: (amount: number, currency: string) => string;
}) {
  const sage = "#9BD9B8"; // créditeur (clair sur cocoa)
  const terracotta = "#F0B89B"; // débiteur (clair sur cocoa)
  const muted = "rgba(244,228,193,0.55)";
  const isPositive = typeof net === "number" && net > 0;
  const isNegative = typeof net === "number" && net < 0;
  const amountColor = disabled
    ? muted
    : isPositive
      ? sage
      : isNegative
        ? terracotta
        : "#F4E4C1";
  const borderTop = accentColor
    ? `2px solid ${accentColor}`
    : "2px solid rgba(244,228,193,0.18)";

  return (
    <div
      style={{
        background: "rgba(244,228,193,0.06)",
        border: "0.5px solid rgba(244,228,193,0.15)",
        borderTop,
        borderRadius: 11,
        padding: "12px 14px",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(244,228,193,0.6)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="bmd-num"
        style={{
          fontSize: 22,
          fontWeight: 500,
          color: amountColor,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
          letterSpacing: "-0.3px",
        }}
      >
        {net == null
          ? "—"
          : `${net > 0 ? "+ " : net < 0 ? "− " : ""}${formatAmount(Math.abs(net), currency)}`}
      </div>
      <div
        style={{
          fontSize: 11,
          color: disabled ? muted : "rgba(244,228,193,0.7)",
          marginTop: 4,
          lineHeight: 1.3,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

/**
 * Petite tuile secondaire de la barre du bas — discrète, icône + label
 * + compteur optionnel (badge ivory + cocoa).
 */
function HubSecondaryTile({
  icon,
  label,
  count,
  onClick,
  iconOnly = false,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        padding: "8px 12px",
        background: "#FAF6EE",
        border: "0.5px solid #D9C8A6",
        borderRadius: 10,
        color: "#2B1F15",
        fontSize: 12,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "inherit",
      }}
    >
      <span style={{ display: "inline-flex", color: "#8B6F47" }}>{icon}</span>
      {!iconOnly && <span>{label}</span>}
      {typeof count === "number" && count > 0 && (
        <span
          style={{
            background: "#F4E4C1",
            color: "#6B4A1A",
            padding: "1px 7px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 500,
            marginLeft: 2,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
