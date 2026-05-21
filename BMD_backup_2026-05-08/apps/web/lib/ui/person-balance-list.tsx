"use client";

/**
 * V26 · Vue **par personne** du dashboard.
 *
 * Pour chaque contrepartie avec qui l'utilisateur partage au moins un groupe,
 * affiche une carte avec :
 *  - le nom de la personne
 *  - le solde net agrégé (positif = elle te doit, négatif = tu lui dois,
 *    zéro = badge "✓ à jour")
 *  - le nombre de groupes partagés
 *
 * Au clic sur une carte → callback `onSelect(person)` qui doit ouvrir le
 * drill-down (rendu via `<PersonBalanceDetailModal>`).
 *
 * Nouveautés V30-6/7 :
 *  - Tous les libellés passent par `useT()` (i18n 9 locales avec fallback fr).
 *  - Le drawer utilise `<BottomSheet>` qui rend un slide-up natif sur mobile
 *    et un modal centré sur desktop (cohérent avec le reste de l'app).
 *  - Les montants utilisent `useLocale()` + Intl.NumberFormat pour respecter
 *    les conventions locales (séparateurs, position du symbole, RTL).
 */

import { useEffect, useState } from "react";
import { api, ApiError, isUnauthorized, clearToken } from "../api-client";
import { useRouter } from "next/navigation";
import { useMyEvents } from "../use-realtime";
import { haptic } from "../platform";
import { useT } from "../i18n/app-strings";
import { useLocale } from "../locale-provider";
import { BottomSheet } from "./bottom-sheet";

export interface PersonBalanceItem {
  counterpartyUserId: string;
  displayName: string;
  net: string;
  currency: string;
  sharedGroups: number;
  byGroup: Array<{
    groupId: string;
    groupName: string;
    net: string;
    currency: string;
    netInUserCurrency: string;
  }>;
}

export interface PersonBalanceData {
  primaryCurrency: string;
  hasConversion: boolean;
  people: PersonBalanceItem[];
}

interface Props {
  /** Callback : ouvre le drill-down avec le détail par groupe. */
  onSelect: (person: PersonBalanceItem) => void;
}

/**
 * Helper pour formater les montants selon la locale active. Utilise
 * `Intl.NumberFormat` qui gère correctement séparateurs (1 234,50 vs 1,234.50),
 * position du symbole monétaire (€100 vs 100€), nombre de décimales
 * (CFA = 0 décimales par convention) et orientation RTL pour AR/HE.
 */
function formatCurrency(
  amount: number,
  currency: string,
  localeCode: string,
): string {
  // Mapping des locales BMD vers les codes BCP-47 acceptés par Intl
  const intlLocale = mapToIntlLocale(localeCode);
  // CFA, BIF, KMF, RWF, etc. n'utilisent pas de décimales
  const noDecimals = ["XAF", "XOF", "BIF", "RWF", "KMF", "JPY", "KRW"].includes(
    currency.toUpperCase(),
  );
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency,
      minimumFractionDigits: noDecimals ? 0 : 2,
      maximumFractionDigits: noDecimals ? 0 : 2,
    }).format(amount);
  } catch {
    // Fallback si le navigateur ne reconnaît pas la devise (rare)
    return `${amount.toFixed(noDecimals ? 0 : 2)} ${currency}`;
  }
}

function mapToIntlLocale(code: string): string {
  // Quelques locales BMD ont besoin d'être mappées vers BCP-47 standard.
  // La plupart sont déjà valides (fr, en, es, etc.).
  const map: Record<string, string> = {
    "fr-cm": "fr-CM",
    "fr-ci": "fr-CI",
    pcm: "en", // Pidgin → fallback EN
    ln: "fr-CD", // Lingala → français RDC
    wo: "fr-SN", // Wolof → français Sénégal pour les nombres
    sw: "sw-KE",
    am: "am-ET",
    ha: "ha-NG",
    yo: "yo-NG",
    om: "fr-ET", // Oromo → fr fallback
    ig: "ig-NG",
    ff: "fr-SN", // Fula → fr fallback
    zu: "zu-ZA",
    ak: "fr-GH", // Akan → fr fallback
    lb: "lb-LU",
  };
  return map[code] ?? code;
}

export function PersonBalanceList({ onSelect }: Props): JSX.Element {
  const router = useRouter();
  const t = useT();
  const { code: localeCode } = useLocale();
  const [data, setData] = useState<PersonBalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    // Defensive : si le bundle est pré-V26 (cache stale), la fonction n'existe
    // pas → on rend une vue vide proprement plutôt que crasher.
    if (typeof api.getMyBalancesByPerson !== "function") {
      setData({ primaryCurrency: "EUR", hasConversion: false, people: [] });
      setError(null);
      setLoading(false);
      return;
    }
    api
      .getMyBalancesByPerson()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE — invalide la vue dès qu'un événement bouge un solde de l'utilisateur
  useMyEvents((event) => {
    const triggers = [
      "balance.changed",
      "expense.created",
      "expense.deleted",
      "settlement.created",
      "settlement.confirmed",
      "cross-settlement.confirmed",
    ];
    if (triggers.includes(event.kind)) load();
  });

  if (loading && !data) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "var(--cream-soft)",
        }}
      >
        {t("dashboard.loadingPersons")}
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(239,68,68,0.3)",
          background: "rgba(239,68,68,0.08)",
          color: "#fca5a5",
          fontSize: 13,
        }}
      >
        {t("personDetail.errorPrefix")} {error}
      </div>
    );
  }

  if (!data || data.people.length === 0) {
    return (
      <div
        style={{
          padding: "24px 18px",
          textAlign: "center",
          color: "var(--cream-soft)",
          fontSize: 14,
          lineHeight: 1.6,
          border: "1px dashed rgba(244,228,193,0.15)",
          borderRadius: 14,
        }}
      >
        {t("dashboard.noRelations")}
        <br />
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          {t("dashboard.noRelationsHint")}
        </span>
      </div>
    );
  }

  // Compteurs pour le hint en haut
  const settled = data.people.filter((p) => parseFloat(p.net) === 0).length;
  const total = data.people.length;
  const peopleCountKey =
    total === 1 ? "dashboard.peopleCountSingular" : "dashboard.peopleCount";

  return (
    <div
      style={{
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "4px 8px 10px",
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1.2,
          fontWeight: 700,
        }}
      >
        <span>{t(peopleCountKey, { count: String(total) })}</span>
        {settled > 0 && (
          <span style={{ color: "rgba(63,125,92,0.9)" }}>
            {t("dashboard.upToDateCount", { count: String(settled) })}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.people.map((p) => (
          <PersonBalanceRow
            key={p.counterpartyUserId}
            person={p}
            primaryCurrency={data.primaryCurrency}
            localeCode={localeCode}
            t={t}
            onClick={() => onSelect(p)}
          />
        ))}
      </div>
      {data.hasConversion && (
        <p
          style={{
            margin: "12px 4px 4px",
            fontSize: 11,
            color: "var(--muted)",
            opacity: 0.75,
          }}
        >
          {t("dashboard.fxConversionNote", { currency: data.primaryCurrency })}
        </p>
      )}
    </div>
  );
}

/** Une ligne de contrepartie. */
function PersonBalanceRow({
  person,
  primaryCurrency,
  localeCode,
  t,
  onClick,
}: {
  person: PersonBalanceItem;
  primaryCurrency: string;
  localeCode: string;
  t: ReturnType<typeof useT>;
  onClick: () => void;
}): JSX.Element {
  const net = parseFloat(person.net);
  const isSettled = net === 0;
  const isCreditor = net > 0;
  const isDebtor = net < 0;
  const formatted = formatCurrency(Math.abs(net), primaryCurrency, localeCode);
  const sign = isCreditor ? "+" : isDebtor ? "−" : "";
  const color = isCreditor
    ? "rgba(63,125,92,0.95)"
    : isDebtor
      ? "rgba(232,124,87,0.95)"
      : "var(--cream-soft)";

  const initials = person.displayName
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sharedKey =
    person.sharedGroups === 1
      ? "dashboard.sharedGroupsSingular"
      : "dashboard.sharedGroups";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr auto",
        alignItems: "center",
        gap: 12,
        width: "100%",
        background: "transparent",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 12,
        padding: "10px 14px",
        textAlign: "left",
        cursor: "pointer",
        color: "var(--cream)",
        fontFamily: "inherit",
        transition: "background 0.15s, border-color 0.15s",
        minHeight: 56,
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(232,163,61,0.06)";
        e.currentTarget.style.borderColor = "rgba(232,163,61,0.18)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "rgba(244,228,193,0.06)";
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.background = "rgba(232,163,61,0.10)";
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.22))",
          border: "1px solid rgba(232,163,61,0.25)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--saffron)",
          letterSpacing: 0.5,
        }}
      >
        {initials || "?"}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {person.displayName}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: 0.4,
          }}
        >
          {t(sharedKey, { count: String(person.sharedGroups) })}
        </span>
      </span>
      <span
        style={{
          textAlign: "right",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {isSettled ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(63,125,92,0.15)",
              color: "rgba(63,125,92,0.95)",
              border: "1px solid rgba(63,125,92,0.3)",
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {t("dashboard.upToDateBadge")}
          </span>
        ) : (
          <span style={{ fontWeight: 700, color, fontSize: 14 }}>
            {sign}
            {formatted}
          </span>
        )}
        <span
          aria-hidden
          style={{
            color: "var(--muted)",
            fontSize: 16,
            marginLeft: 4,
          }}
        >
          ›
        </span>
      </span>
    </button>
  );
}

/**
 * V26 + V30 · Drawer / modal de détail pour une contrepartie.
 *
 * Utilise `<BottomSheet>` qui rend automatiquement :
 *  - Sur **mobile** : slide-up depuis le bas, drag handle, swipe-down pour fermer,
 *    safe-area-inset iOS, scroll lock body — UX banking app native.
 *  - Sur **desktop** : modal centré classique avec backdrop + click-to-close.
 *
 * Les libellés passent par `useT()` (9 locales). Les montants par
 * `formatCurrency()` qui respecte la locale active pour les séparateurs et
 * les conventions de devises (CFA sans décimales, etc.).
 */
export function PersonBalanceDetailModal({
  person,
  primaryCurrency,
  onClose,
  onSettled,
}: {
  person: PersonBalanceItem | null;
  primaryCurrency: string;
  onClose: () => void;
  onSettled?: () => void;
}): JSX.Element | null {
  const t = useT();
  const { code: localeCode } = useLocale();

  // V30 — état du flow 2-temps de cross-settlement
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [pendingCrossId, setPendingCrossId] = useState<string | null>(null);
  // X7 — Sélection à la carte des groupes à inclure dans le règlement.
  // Par défaut tous les groupes non-zéro sont sélectionnés. L'utilisateur
  // peut décocher pour exclure un groupe (ex : il préfère le régler
  // séparément, ou la dette y est contestée).
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set(),
  );

  // Reset l'état quand on change de personne (ou ferme le modal)
  useEffect(() => {
    setSettling(false);
    setSettleError(null);
    setPendingCrossId(null);
    if (person) {
      // Sélectionne par défaut TOUS les groupes non-zéro
      const defaultSelection = new Set(
        person.byGroup
          .filter((g) => parseFloat(g.net) !== 0)
          .map((g) => g.groupId),
      );
      setSelectedGroupIds(defaultSelection);
    } else {
      setSelectedGroupIds(new Set());
    }
  }, [person?.counterpartyUserId, person]);

  /**
   * X7 — Toggle un groupe dans la sélection. Si on décoche un groupe, son
   * net est exclu du `totalAmount` recalculé (qui peut donc différer du net
   * global affiché en haut du drawer).
   */
  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const isOpen = !!person;

  /**
   * V30 — Crée le cross-settlement. Le sens du parent et de chaque child est
   * dérivé du signe du `net` (positif = la personne te doit, négatif = tu
   * lui dois). Les montants children sont dans la devise du groupe d'origine ;
   * le `totalAmount` est en devise utilisateur (= `primaryCurrency`).
   */
  async function handleSettleAll() {
    if (!person) return;
    // X7 — On utilise uniquement les groupes sélectionnés (par défaut
    // tous les non-zéro). L'utilisateur peut avoir décoché certains groupes
    // dans le drill-down. Le `selectedNetUserCcy` ci-dessous = net agrégé
    // SUR LES GROUPES SÉLECTIONNÉS UNIQUEMENT (peut différer de person.net).
    const selectedGroups = person.byGroup.filter(
      (g) =>
        selectedGroupIds.has(g.groupId) && parseFloat(g.net) !== 0,
    );
    if (selectedGroups.length === 0) {
      setSettleError(t("crossSettle.noGroupSelected"));
      haptic("error");
      return;
    }

    setSettling(true);
    setSettleError(null);
    try {
      const children = selectedGroups.map((g) => {
        const groupNet = parseFloat(g.net);
        return {
          groupId: g.groupId,
          direction:
            groupNet > 0
              ? ("actorReceives" as const)
              : ("actorPays" as const),
          // amount = montant absolu dans la devise du groupe (préserve la
          // précision native — pas de conversion FX qui introduirait des
          // arrondis dans le ledger)
          amount: Math.abs(groupNet).toFixed(2),
          currency: g.currency,
        };
      });

      // Recalcule le net réel en devise utilisateur sur les groupes
      // sélectionnés uniquement.
      const selectedNetUserCcy = selectedGroups.reduce(
        (acc, g) => acc + parseFloat(g.netInUserCurrency),
        0,
      );
      if (selectedNetUserCcy === 0) {
        // Cas exotique : la sélection s'annule à zéro (ex : user a coché
        // un débit + un crédit du même montant). Pas de cash à échanger.
        setSettleError(t("crossSettle.zeroNet"));
        haptic("warn");
        setSettling(false);
        return;
      }
      const netDirection: "actorPays" | "actorReceives" =
        selectedNetUserCcy > 0 ? "actorReceives" : "actorPays";
      const totalAmount = Math.abs(selectedNetUserCcy).toFixed(2);

      const r = await api.createCrossSettlement({
        counterpartyUserId: person.counterpartyUserId,
        netDirection,
        totalAmount,
        currency: primaryCurrency,
        children,
      });
      setPendingCrossId(r.id);
      haptic("success");
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : (e as Error).message ?? "Erreur";
      setSettleError(msg);
      haptic("error");
    } finally {
      setSettling(false);
    }
  }

  async function handleConfirmReception() {
    if (!pendingCrossId) return;
    setSettling(true);
    setSettleError(null);
    try {
      await api.confirmCrossSettlement(pendingCrossId);
      haptic("success");
      onSettled?.();
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : (e as Error).message ?? "Erreur";
      setSettleError(msg);
      haptic("error");
    } finally {
      setSettling(false);
    }
  }

  async function handleCancelPending() {
    if (!pendingCrossId) return;
    try {
      await api.cancelCrossSettlement(pendingCrossId);
      setPendingCrossId(null);
    } catch {
      setPendingCrossId(null);
    }
  }

  if (!person) return null;

  const net = parseFloat(person.net);
  const isSettled = net === 0;
  const formatted = formatCurrency(Math.abs(net), primaryCurrency, localeCode);
  const nonZeroGroups = person.byGroup.filter(
    (g) => parseFloat(g.net) !== 0,
  ).length;
  // X7 — Total recalculé sur les groupes SÉLECTIONNÉS uniquement (peut
  // différer du `net` global si l'utilisateur a décoché des groupes).
  const selectedNet = person.byGroup
    .filter((g) => selectedGroupIds.has(g.groupId))
    .reduce((acc, g) => acc + parseFloat(g.netInUserCurrency), 0);
  const selectedFormatted = formatCurrency(
    Math.abs(selectedNet),
    primaryCurrency,
    localeCode,
  );
  const selectedCount = selectedGroupIds.size;
  const totalNonZero = nonZeroGroups;
  const isPartialSelection =
    selectedCount > 0 && selectedCount < totalNonZero;

  const subtitleKey =
    person.sharedGroups === 1
      ? "personDetail.subtitleSingular"
      : "personDetail.subtitle";

  return (
    <BottomSheet open={isOpen} onClose={onClose} title={person.displayName}>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 12,
          color: "var(--muted)",
          letterSpacing: 0.4,
        }}
      >
        {t(subtitleKey, { count: String(person.sharedGroups) })}
      </p>

      {/* Solde global — bandeau coloré selon le sens */}
      <div
        style={{
          background: isSettled
            ? "rgba(63,125,92,0.12)"
            : net > 0
              ? "rgba(63,125,92,0.12)"
              : "rgba(232,124,87,0.12)",
          border: `1px solid ${
            isSettled
              ? "rgba(63,125,92,0.3)"
              : net > 0
                ? "rgba(63,125,92,0.3)"
                : "rgba(232,124,87,0.3)"
          }`,
          borderRadius: 12,
          padding: 14,
          textAlign: "center",
          marginBottom: 18,
        }}
      >
        {isSettled ? (
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            {t("personDetail.allSettled")}
          </p>
        ) : net > 0 ? (
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>
              {t("personDetail.someoneOwesYou", { name: person.displayName })}{" "}
            </strong>
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                color: "rgba(63,125,92,0.95)",
                fontWeight: 700,
              }}
            >
              {formatted}
            </span>
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>{t("personDetail.youOweSomeone")} </strong>
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                color: "rgba(232,124,87,0.95)",
                fontWeight: 700,
              }}
            >
              {formatted}
            </span>{" "}
            <strong>
              {t("personDetail.youOweSomeoneTo", { name: person.displayName })}
            </strong>
          </p>
        )}
      </div>

      {/* Décomposition par groupe */}
      <h4
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1.4,
          fontWeight: 700,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{t("personDetail.detailByGroup")}</span>
        {/* X7 — Hint de sélection si l'utilisateur peut cocher/décocher */}
        {!isSettled && !pendingCrossId && (
          <span
            style={{
              fontSize: 10,
              color: "var(--muted)",
              opacity: 0.7,
              textTransform: "none",
              letterSpacing: 0.3,
              fontWeight: 500,
            }}
          >
            {t("crossSettle.tickToInclude")}
          </span>
        )}
      </h4>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {person.byGroup.map((g) => {
          const groupNet = parseFloat(g.net);
          const groupNetUserCcy = parseFloat(g.netInUserCurrency);
          const isGroupSettled = groupNet === 0;
          const groupCcyDifferent = g.currency !== primaryCurrency;
          // X7 — Checkable seulement si non-settled ET pas en mode pendingConfirm
          const isCheckable = !isGroupSettled && !pendingCrossId;
          const isChecked = selectedGroupIds.has(g.groupId);
          return (
            <li
              key={g.groupId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                background:
                  isCheckable && !isChecked
                    ? "rgba(244,228,193,0.02)" // dimmer if unchecked
                    : "rgba(244,228,193,0.04)",
                borderRadius: 10,
                border: isCheckable && isChecked
                  ? "1px solid rgba(232,163,61,0.30)"
                  : "1px solid rgba(244,228,193,0.06)",
                fontSize: 13,
                gap: 8,
                opacity: isCheckable && !isChecked ? 0.6 : 1,
                transition: "all 0.15s ease",
                cursor: isCheckable ? "pointer" : "default",
              }}
              onClick={() => {
                if (isCheckable) toggleGroup(g.groupId);
              }}
            >
              {isCheckable && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleGroup(g.groupId)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t("crossSettle.includeGroup", {
                    name: g.groupName,
                  })}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: "var(--saffron, #e8a33d)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  fontWeight: 600,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g.groupName}
              </span>
              <span
                style={{
                  textAlign: "right",
                  color: isGroupSettled
                    ? "var(--cream-soft)"
                    : groupNet > 0
                      ? "rgba(63,125,92,0.95)"
                      : "rgba(232,124,87,0.95)",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {isGroupSettled ? (
                  <span style={{ fontSize: 11, opacity: 0.8 }}>
                    {t("personDetail.groupSettled")}
                  </span>
                ) : (
                  <>
                    {groupNet > 0 ? "+" : "−"}
                    {formatCurrency(
                      Math.abs(groupNet),
                      g.currency,
                      localeCode,
                    )}
                    {groupCcyDifferent && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 10,
                          opacity: 0.6,
                          marginTop: 2,
                          fontWeight: 500,
                        }}
                      >
                        ≈{" "}
                        {formatCurrency(
                          Math.abs(groupNetUserCcy),
                          primaryCurrency,
                          localeCode,
                        )}
                      </span>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {/* V30 — CTA Régler en 1 tap, flow 2-temps */}
      {!isSettled && (
        <div style={{ marginTop: 18 }}>
          {settleError && (
            <div
              role="alert"
              style={{
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.35)",
                color: "#fca5a5",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 12.5,
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              <strong>{t("personDetail.errorPrefix")}</strong> {settleError}
            </div>
          )}

          {!pendingCrossId ? (
            <>
              <button
                type="button"
                onClick={handleSettleAll}
                disabled={settling}
                style={{
                  background:
                    "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                  color: "var(--night-2, #16111E)",
                  fontWeight: 700,
                  fontSize: 14,
                  minHeight: 48,
                  border: "none",
                  borderRadius: 12,
                  width: "100%",
                  cursor: settling ? "wait" : "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "0 8px 22px rgba(181,70,46,0.25)",
                  opacity: settling ? 0.7 : 1,
                  WebkitTapHighlightColor: "transparent",
                }}
                aria-label={
                  selectedNet > 0
                    ? t("crossSettle.ctaReceive", { amount: selectedFormatted })
                    : t("crossSettle.ctaPay", { amount: selectedFormatted })
                }
              >
                {settling
                  ? t("crossSettle.creating")
                  : selectedNet > 0
                    ? t("crossSettle.ctaReceive", { amount: selectedFormatted })
                    : t("crossSettle.ctaPay", { amount: selectedFormatted })}
              </button>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 11.5,
                  color: "var(--muted)",
                  opacity: 0.85,
                  lineHeight: 1.55,
                  textAlign: "center",
                }}
              >
                {selectedNet > 0
                  ? t("crossSettle.hintReceive", {
                      name: person.displayName,
                      amount: selectedFormatted,
                    })
                  : t("crossSettle.hintPay", {
                      name: person.displayName,
                      amount: selectedFormatted,
                      count: String(selectedCount),
                    })}
                {isPartialSelection && (
                  <>
                    <br />
                    <span
                      style={{
                        color: "var(--saffron, #e8a33d)",
                        fontWeight: 600,
                      }}
                    >
                      {t("crossSettle.partialSelection", {
                        selected: String(selectedCount),
                        total: String(totalNonZero),
                      })}
                    </span>
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <div
                style={{
                  background: "rgba(232,163,61,0.08)",
                  border: "1px dashed rgba(232,163,61,0.35)",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                  fontSize: 13,
                  lineHeight: 1.55,
                }}
              >
                <strong style={{ color: "var(--saffron)" }}>
                  {t("crossSettle.created")}
                </strong>
                <br />
                {net > 0
                  ? t("crossSettle.afterReceive", {
                      name: person.displayName,
                      amount: formatted,
                      count: String(nonZeroGroups),
                    })
                  : t("crossSettle.afterPay", {
                      name: person.displayName,
                      amount: formatted,
                    })}
              </div>

              {net > 0 ? (
                <button
                  type="button"
                  onClick={handleConfirmReception}
                  disabled={settling}
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(63,125,92,0.95), rgba(45,95,70,0.95))",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 14,
                    minHeight: 48,
                    border: "none",
                    borderRadius: 12,
                    width: "100%",
                    cursor: settling ? "wait" : "pointer",
                    fontFamily: "inherit",
                    opacity: settling ? 0.7 : 1,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {settling
                    ? t("crossSettle.confirming")
                    : t("crossSettle.confirmReceiveCta", { amount: formatted })}
                </button>
              ) : (
                <p
                  style={{
                    margin: 0,
                    padding: "10px 12px",
                    background: "rgba(244,228,193,0.04)",
                    border: "1px solid rgba(244,228,193,0.06)",
                    borderRadius: 10,
                    fontSize: 12,
                    color: "var(--cream-soft)",
                    textAlign: "center",
                  }}
                >
                  {t("crossSettle.awaitingFromCounterparty", {
                    name: person.displayName,
                  })}
                </p>
              )}

              <button
                type="button"
                onClick={handleCancelPending}
                disabled={settling}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(244,228,193,0.18)",
                  color: "var(--cream-soft)",
                  borderRadius: 10,
                  padding: "8px 14px",
                  fontSize: 12,
                  cursor: settling ? "wait" : "pointer",
                  fontFamily: "inherit",
                  width: "100%",
                  marginTop: 8,
                  opacity: 0.75,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {t("crossSettle.cancel")}
              </button>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
