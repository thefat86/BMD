"use client";

/**
 * V154.B — DesktopGroupsHubView.
 *
 * Hub web premium pour la liste de TOUS les groupes du user (style
 * portail B2B genre Wise, Pennylane). Plus riche que la grille mobile :
 *
 *  ┌──────────────────────────────────────────────┐
 *  │ KPI Row : 5 cards (Total · Actifs · Solde +  │
 *  │           · Solde − · Types)                 │
 *  ├──────────────────────────────────────────────┤
 *  │ Toolbar : recherche · filtre type · vue grid │
 *  │           /table · CTA + Nouveau groupe       │
 *  ├──────────────────────────────────────────────┤
 *  │ Vue Grid (par défaut, auto-fill 3 cols)      │
 *  │   ou Vue Table (compacte, triable)           │
 *  └──────────────────────────────────────────────┘
 *
 * Chaque card riche contient :
 *  - Bandeau type (couleur saffron/emerald/etc + icône)
 *  - Nom + meta (membres, devise)
 *  - Balance perso XL (Cormorant, signée et colorée)
 *  - Avatars membres (4 max + +N)
 *  - Activité récente (3 dernières dépenses, lazy)
 *  - Badges modules actifs (tontine, RDD, reçu fiscal)
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { api } from "../api-client";
import { prewarmGroupApi } from "../use-prefetch";
// V224.C — Helper « charte du groupe » (couleurs custom + logo perso).
import { getGroupAccent } from "../group-accent";

export interface HubGroup {
  id: string;
  name: string;
  type: string;
  defaultCurrency: string;
  membersCount: number;
  createdAt: string;
  totalSpent: string;
  myNet: string;
}

interface Props {
  groups: HubGroup[] | null;
  error: string | null;
  onCreate: () => void;
}

type ViewMode = "grid" | "table";
type TypeFilter = "ALL" | "TONTINE" | "COLOC" | "TRAVEL" | "EVENT" | "CLUB" | "PARISH" | "GENERIC";
type BalanceFilter = "ALL" | "POSITIVE" | "NEGATIVE" | "SETTLED";

const TYPE_THEME: Record<
  string,
  { color: string; bg: string; emoji: string; label: string }
> = {
  TONTINE: { color: "#854F0B", bg: "#FEF3C7", emoji: "🪙", label: "Tontine" },
  COLOC: { color: "#0F6E56", bg: "#D1FAE5", emoji: "🏠", label: "Coloc" },
  TRAVEL: { color: "#1E40AF", bg: "#DBEAFE", emoji: "✈", label: "Voyage" },
  EVENT: { color: "#9A3412", bg: "#FED7AA", emoji: "🎉", label: "Événement" },
  CLUB: { color: "#7C2D12", bg: "#FED7AA", emoji: "👥", label: "Club" },
  PARISH: { color: "#854F0B", bg: "#FEF3C7", emoji: "⛪", label: "Paroisse" },
  GENERIC: { color: "#6B5A47", bg: "#F4ECD8", emoji: "📁", label: "Groupe" },
};

export function DesktopGroupsHubView({
  groups,
  error,
  onCreate,
}: Props): JSX.Element {
  const t = useT();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const kpis = useMemo(() => computeKpis(groups ?? []), [groups]);
  const filtered = useMemo(
    () => applyFilters(groups ?? [], query, typeFilter, balanceFilter),
    [groups, query, typeFilter, balanceFilter],
  );

  if (error) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "#9F4628",
          background: "rgba(159,70,40,0.06)",
          borderRadius: 12,
        }}
      >
        {t("groups.hub.error") || "Impossible de charger les groupes."}{" "}
        <small style={{ display: "block", marginTop: 4, opacity: 0.7 }}>
          {error}
        </small>
      </div>
    );
  }

  if (groups === null) return <HubSkeleton />;
  if (groups.length === 0) return <EmptyState onCreate={onCreate} t={t} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <KpiRow kpis={kpis} t={t} />
      <Toolbar
        query={query}
        setQuery={setQuery}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        balanceFilter={balanceFilter}
        setBalanceFilter={setBalanceFilter}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onCreate={onCreate}
        t={t}
      />
      {filtered.length === 0 ? (
        <NoResults t={t} />
      ) : viewMode === "grid" ? (
        <GroupsGrid groups={filtered} t={t} />
      ) : (
        <GroupsTable groups={filtered} t={t} />
      )}
      <FooterCount filtered={filtered.length} total={groups.length} t={t} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// KPI Row
// ─────────────────────────────────────────────────────────────────────

interface Kpis {
  total: number;
  iLend: number;
  iOwe: number;
  totalSpent: number;
  currency: string;
  typeDistribution: Record<string, number>;
}

function computeKpis(groups: HubGroup[]): Kpis {
  const k: Kpis = {
    total: groups.length,
    iLend: 0,
    iOwe: 0,
    totalSpent: 0,
    currency: "EUR",
    typeDistribution: {},
  };
  for (const g of groups) {
    const net = parseFloat(g.myNet || "0");
    if (net > 0) k.iLend += net;
    if (net < 0) k.iOwe += Math.abs(net);
    k.totalSpent += parseFloat(g.totalSpent || "0");
    k.typeDistribution[g.type] = (k.typeDistribution[g.type] ?? 0) + 1;
    k.currency = g.defaultCurrency || k.currency;
  }
  return k;
}

function KpiRow({ kpis, t }: { kpis: Kpis; t: (k: string) => string }) {
  const netBalance = kpis.iLend - kpis.iOwe;
  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: kpis.currency || "EUR",
      maximumFractionDigits: 0,
    }).format(n);
  const dominantType = Object.entries(kpis.typeDistribution).sort(
    (a, b) => b[1] - a[1],
  )[0];

  const items = [
    {
      key: "total",
      label: t("groups.hub.kpiTotal") || "Mes groupes",
      value: String(kpis.total),
      accent: "#2B1F15",
      sub: t("groups.hub.kpiTotalSub") || "actifs",
    },
    {
      key: "iLend",
      label: t("groups.hub.kpiILend") || "On me doit",
      value: fmt(kpis.iLend),
      accent: "#1F7A57",
      sub: t("groups.hub.kpiILendSub") || "tous groupes",
      isMoney: true,
    },
    {
      key: "iOwe",
      label: t("groups.hub.kpiIOwe") || "Je dois",
      value: fmt(kpis.iOwe),
      accent: "#9F4628",
      sub: t("groups.hub.kpiIOweSub") || "tous groupes",
      isMoney: true,
    },
    {
      key: "net",
      label:
        netBalance >= 0
          ? t("groups.hub.kpiNetPositive") || "Solde net (+)"
          : t("groups.hub.kpiNetNegative") || "Solde net (−)",
      value: fmt(Math.abs(netBalance)),
      accent: netBalance >= 0 ? "#0F6E56" : "#9F4628",
      sub:
        netBalance >= 0
          ? t("groups.hub.kpiNetPosSub") || "à récupérer"
          : t("groups.hub.kpiNetNegSub") || "à régler",
      isMoney: true,
      highlight: Math.abs(netBalance) > 0,
    },
    {
      key: "totalSpent",
      label: t("groups.hub.kpiTotalSpent") || "Volume total",
      value: fmt(kpis.totalSpent),
      accent: "#854F0B",
      sub: t("groups.hub.kpiTotalSpentSub") || "dépenses cumulées",
      isMoney: true,
    },
    {
      key: "dominantType",
      label: t("groups.hub.kpiDominant") || "Type principal",
      value: dominantType ? TYPE_THEME[dominantType[0]]?.label ?? dominantType[0] : "—",
      accent: dominantType ? TYPE_THEME[dominantType[0]]?.color ?? "#6B5A47" : "#6B5A47",
      sub: dominantType ? `${dominantType[1]} groupe(s)` : "",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 12,
      }}
    >
      {items.map((it) => (
        <div
          key={it.key}
          style={{
            background: "#FFFFFF",
            border: it.highlight
              ? `1.5px solid ${it.accent}`
              : "1px solid rgba(43,31,21,0.10)",
            borderRadius: 14,
            padding: "14px 16px",
            boxShadow: it.highlight
              ? `0 4px 12px ${it.accent}22`
              : "0 1px 3px rgba(43,31,21,0.04)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minHeight: 92,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              color: "#6B5A47",
              fontWeight: 700,
            }}
          >
            {it.label}
          </div>
          <div
            className={it.isMoney ? "bmd-num" : undefined}
            style={{
              fontSize: it.isMoney ? 20 : 24,
              fontWeight: 700,
              color: it.accent,
              lineHeight: 1.1,
            }}
          >
            {it.value}
          </div>
          <div style={{ fontSize: 11, color: "#6B5A47", opacity: 0.85 }}>
            {it.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────────────

function Toolbar({
  query,
  setQuery,
  typeFilter,
  setTypeFilter,
  balanceFilter,
  setBalanceFilter,
  viewMode,
  setViewMode,
  onCreate,
  t,
}: {
  query: string;
  setQuery: (v: string) => void;
  typeFilter: TypeFilter;
  setTypeFilter: (v: TypeFilter) => void;
  balanceFilter: BalanceFilter;
  setBalanceFilter: (v: BalanceFilter) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  onCreate: () => void;
  t: (k: string) => string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            t("groups.hub.searchPlaceholder") ||
            "Rechercher par nom de groupe…"
          }
          style={{
            width: "100%",
            padding: "10px 14px 10px 38px",
            fontSize: 13,
            color: "#2B1F15",
            background: "#FFFFFF",
            border: "1px solid rgba(43,31,21,0.14)",
            borderRadius: 10,
            outline: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 13,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 14,
            opacity: 0.5,
          }}
        >
          🔍
        </span>
      </div>

      <select
        value={typeFilter}
        onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
        style={selectStyle}
      >
        <option value="ALL">{t("groups.hub.filterAllTypes") || "Tous types"}</option>
        <option value="TONTINE">{TYPE_THEME.TONTINE.label}</option>
        <option value="COLOC">{TYPE_THEME.COLOC.label}</option>
        <option value="TRAVEL">{TYPE_THEME.TRAVEL.label}</option>
        <option value="EVENT">{TYPE_THEME.EVENT.label}</option>
        <option value="CLUB">{TYPE_THEME.CLUB.label}</option>
        <option value="PARISH">{TYPE_THEME.PARISH.label}</option>
        <option value="GENERIC">{TYPE_THEME.GENERIC.label}</option>
      </select>

      <select
        value={balanceFilter}
        onChange={(e) => setBalanceFilter(e.target.value as BalanceFilter)}
        style={selectStyle}
      >
        <option value="ALL">{t("groups.hub.filterAllBalances") || "Tous soldes"}</option>
        <option value="POSITIVE">{t("groups.hub.filterPositive") || "On me doit"}</option>
        <option value="NEGATIVE">{t("groups.hub.filterNegative") || "Je dois"}</option>
        <option value="SETTLED">{t("groups.hub.filterSettled") || "Soldés"}</option>
      </select>

      <div
        style={{
          display: "inline-flex",
          background: "#F4ECD8",
          border: "1px solid rgba(43,31,21,0.10)",
          borderRadius: 10,
          padding: 3,
        }}
      >
        <button
          type="button"
          onClick={() => setViewMode("grid")}
          aria-pressed={viewMode === "grid"}
          style={{
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderRadius: 8,
            background: viewMode === "grid" ? "#FFFFFF" : "transparent",
            color: viewMode === "grid" ? "#854F0B" : "#6B5A47",
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow:
              viewMode === "grid"
                ? "0 1px 3px rgba(43,31,21,0.10)"
                : "none",
          }}
        >
          ▦ {t("groups.hub.viewGrid") || "Cards"}
        </button>
        <button
          type="button"
          onClick={() => setViewMode("table")}
          aria-pressed={viewMode === "table"}
          style={{
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderRadius: 8,
            background: viewMode === "table" ? "#FFFFFF" : "transparent",
            color: viewMode === "table" ? "#854F0B" : "#6B5A47",
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow:
              viewMode === "table"
                ? "0 1px 3px rgba(43,31,21,0.10)"
                : "none",
          }}
        >
          ☰ {t("groups.hub.viewTable") || "Table"}
        </button>
      </div>

      <button
        type="button"
        onClick={onCreate}
        style={{
          padding: "10px 18px",
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 10,
          border: "none",
          background: "linear-gradient(135deg, #C58A2E, #854F0B)",
          color: "#FBF6EC",
          cursor: "pointer",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(133,79,11,0.25)",
          fontFamily: "inherit",
        }}
      >
        + {t("groups.hub.createCta") || "Nouveau groupe"}
      </button>
    </div>
  );
}

const selectStyle = {
  padding: "10px 14px",
  fontSize: 13,
  color: "#2B1F15",
  background: "#FFFFFF",
  border: "1px solid rgba(43,31,21,0.14)",
  borderRadius: 10,
  cursor: "pointer",
  outline: "none",
  minWidth: 130,
  fontFamily: "inherit",
} as const;

// ─────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────

function applyFilters(
  groups: HubGroup[],
  query: string,
  type: TypeFilter,
  balance: BalanceFilter,
): HubGroup[] {
  const q = query.trim().toLowerCase();
  return groups.filter((g) => {
    if (type !== "ALL" && g.type !== type) return false;
    const net = parseFloat(g.myNet || "0");
    if (balance === "POSITIVE" && net <= 0.01) return false;
    if (balance === "NEGATIVE" && net >= -0.01) return false;
    if (balance === "SETTLED" && Math.abs(net) > 0.01) return false;
    if (q && !g.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Grid (cards riches)
// ─────────────────────────────────────────────────────────────────────

function GroupsGrid({
  groups,
  t,
}: {
  groups: HubGroup[];
  t: (k: string) => string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 16,
      }}
    >
      {groups.map((g) => (
        <RichGroupCard key={g.id} group={g} t={t} />
      ))}
    </div>
  );
}

interface MemberPreview {
  id: string;
  displayName: string;
  avatar?: string | null;
}

interface ExpensePreview {
  id: string;
  amount: number;
  currency: string;
  payerName: string;
  category?: string | null;
  description?: string | null;
  createdAt: string;
}

interface GroupDetails {
  members?: MemberPreview[];
  recentExpenses?: ExpensePreview[];
  hasTontine?: boolean;
  hasDebts?: boolean;
  taxReceiptsEnabled?: boolean;
}

function RichGroupCard({
  group,
  t,
}: {
  group: HubGroup;
  t: (k: string) => string;
}): JSX.Element {
  const theme = TYPE_THEME[group.type] || TYPE_THEME.GENERIC;
  const { formatAmount } = useCurrency();
  const net = parseFloat(group.myNet || "0");
  const isPositive = net > 0.01;
  const isNegative = net < -0.01;
  const balanceColor = isPositive
    ? "#0F6E56"
    : isNegative
      ? "#9F4628"
      : "#6B5A47";
  const balanceSign = isPositive ? "+" : isNegative ? "−" : "";

  // Charge détails à la demande (members + recent + modules)
  const [details, setDetails] = useState<GroupDetails | null>(null);
  // V224.C — Charte custom du groupe (couleurs + logo). Chargée à la
  // demande comme les autres détails. Défaut = palette BMD jusqu'à ce que
  // le fetch termine.
  const [accent, setAccent] = useState(() => getGroupAccent(null));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [detail, expenses, tontine, debts] = await Promise.all([
          api.getGroup(group.id).catch(() => null),
          api.listExpenses(group.id).catch(() => [] as any[]),
          api.getTontine(group.id).catch(() => ({ tontine: null })),
          api.listDebts().catch(() => ({ debts: [] as any[] })),
        ]);
        if (cancelled) return;
        // V224.C — Extrait la charte renvoyée par getGroupForMember
        // (theme + customLogoUrl). Si pas de custom, accent reste défaut.
        setAccent(getGroupAccent(detail));
        const members: MemberPreview[] = Array.isArray(detail?.members)
          ? detail.members.slice(0, 6).map((m: any) => ({
              id: m.user?.id ?? m.id,
              displayName: m.user?.displayName ?? m.displayName ?? "?",
              avatar: m.user?.avatar ?? null,
            }))
          : [];
        const recent: ExpensePreview[] = (Array.isArray(expenses) ? expenses : [])
          .slice(0, 3)
          .map((e: any) => ({
            id: e.id,
            amount: parseFloat(e.amount ?? "0"),
            currency: e.currency ?? group.defaultCurrency,
            payerName:
              e.payers?.[0]?.user?.displayName ?? e.payer?.displayName ?? "?",
            category: e.category ?? null,
            description: e.description ?? null,
            createdAt: e.createdAt ?? new Date().toISOString(),
          }));
        const hasTontine = !!(tontine?.tontine ?? null);
        const groupDebts = (debts?.debts ?? []).filter((d: any) =>
          // V148+ : RDD peut être attachée à un groupe ou indépendante.
          // Pour ce hub on affiche le badge si user a au moins une RDD —
          // afinement futur si l'API expose un lien groupe/RDD direct.
          true && d,
        );
        setDetails({
          members,
          recentExpenses: recent,
          hasTontine,
          hasDebts: groupDebts.length > 0 && group.type === "TONTINE",
          taxReceiptsEnabled: !!detail?.taxReceiptsEnabled,
        });
      } catch {
        if (!cancelled) setDetails({});
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [group.id, group.defaultCurrency, group.type]);

  function handlePrewarm() {
    try {
      prewarmGroupApi(group.id);
    } catch {
      /* ignore */
    }
  }

  // V224.C — Si charte custom, on prend la couleur primaire du groupe.
  // Sinon, on garde le thème par type d'origine (saffron par défaut).
  const bandColor = accent.hasCustom ? accent.color : theme.color;
  const bandBg = accent.hasCustom ? accent.surfaceTint : theme.bg;

  return (
    <Link
      href={`/dashboard/groups/${group.id}`}
      onMouseEnter={handlePrewarm}
      style={{
        display: "block",
        background: "#FFFFFF",
        // V224.C — Border accentuée si charte custom (sinon défaut subtle).
        border: accent.hasCustom
          ? `1px solid ${accent.color}40`
          : "1px solid rgba(43,31,21,0.10)",
        borderRadius: 16,
        overflow: "hidden",
        textDecoration: "none",
        color: "inherit",
        transition: "transform 0.12s ease, box-shadow 0.12s ease",
        boxShadow: "0 1px 3px rgba(43,31,21,0.04)",
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(1px)";
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 6px 20px rgba(43,31,21,0.10)";
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 1px 3px rgba(43,31,21,0.04)";
      }}
    >
      {/* Bandeau type coloré — V224.C : logo custom si présent, sinon emoji type. */}
      <div
        style={{
          padding: "12px 16px",
          background: bandBg,
          borderBottom: `1px solid ${bandColor}20`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {accent.logoUrl ? (
          <img
            src={accent.logoUrl}
            alt=""
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              objectFit: "cover",
              background: "#FFFFFF",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span style={{ fontSize: 16 }}>{theme.emoji}</span>
        )}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: bandColor,
          }}
        >
          {theme.label}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: bandColor,
            opacity: 0.7,
          }}
        >
          {group.membersCount}{" "}
          {group.membersCount === 1
            ? t("groups.hub.member") || "membre"
            : t("groups.hub.members") || "membres"}
        </span>
      </div>

      {/* Corps : nom + balance perso XL */}
      <div style={{ padding: "16px 16px 14px" }}>
        <h3
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 700,
            color: "#2B1F15",
            lineHeight: 1.25,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "Cormorant Garamond, serif",
          }}
        >
          {group.name}
        </h3>
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              color: "#6B5A47",
              fontWeight: 600,
              marginBottom: 3,
            }}
          >
            {isPositive
              ? t("groups.hub.youAreOwed") || "On me doit"
              : isNegative
                ? t("groups.hub.youOwe") || "Je dois"
                : t("groups.hub.balanceSettled") || "Tout est soldé"}
          </div>
          {Math.abs(net) > 0.01 ? (
            <div
              className="bmd-num"
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: balanceColor,
                lineHeight: 1.1,
                fontFamily: "Cormorant Garamond, serif",
              }}
            >
              {balanceSign}
              {formatAmount(Math.abs(net), group.defaultCurrency)}
            </div>
          ) : (
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "#0F6E56",
                fontFamily: "Cormorant Garamond, serif",
              }}
            >
              ✓ {t("groups.hub.allSettled") || "Aucune dette"}
            </div>
          )}
        </div>
      </div>

      {/* Avatars membres */}
      {details?.members && details.members.length > 0 && (
        <div
          style={{
            padding: "0 16px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ display: "flex" }}>
            {details.members.slice(0, 4).map((m, i) => (
              <MemberAvatar key={m.id} member={m} stackIdx={i} />
            ))}
          </div>
          {details.members.length > 4 && (
            <span style={{ fontSize: 11, color: "#6B5A47", fontWeight: 600 }}>
              +{group.membersCount - 4}
            </span>
          )}
        </div>
      )}

      {/* Activité récente */}
      {details?.recentExpenses && details.recentExpenses.length > 0 && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid rgba(43,31,21,0.06)",
            background: "#FBF6EC",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#6B5A47",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            {t("groups.hub.recentActivity") || "Activité récente"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {details.recentExpenses.map((exp) => (
              <ExpenseRow
                key={exp.id}
                expense={exp}
                groupCurrency={group.defaultCurrency}
                formatAmount={formatAmount}
              />
            ))}
          </div>
        </div>
      )}

      {/* Badges modules */}
      {(details?.hasTontine ||
        details?.hasDebts ||
        details?.taxReceiptsEnabled) && (
        <div
          style={{
            padding: "10px 16px 14px",
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            borderTop:
              details?.recentExpenses && details.recentExpenses.length > 0
                ? "none"
                : "1px solid rgba(43,31,21,0.06)",
          }}
        >
          {details.hasTontine && (
            <ModuleBadge
              icon="🪙"
              label={t("groups.hub.moduleTontine") || "Tontine"}
              color="#854F0B"
            />
          )}
          {details.hasDebts && (
            <ModuleBadge
              icon="📜"
              label={t("groups.hub.moduleDebts") || "RDD"}
              color="#0F6E56"
            />
          )}
          {details.taxReceiptsEnabled && (
            <ModuleBadge
              icon="🧾"
              label={t("groups.hub.moduleTaxReceipts") || "Reçu fiscal"}
              color="#1E40AF"
            />
          )}
        </div>
      )}
    </Link>
  );
}

function MemberAvatar({
  member,
  stackIdx,
}: {
  member: MemberPreview;
  stackIdx: number;
}) {
  const initials = member.displayName
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const colors = ["#C58A2E", "#1F7A57", "#9F4628", "#1E40AF", "#854F0B", "#0F6E56"];
  const bg = colors[stackIdx % colors.length];

  return member.avatar ? (
    <img
      src={member.avatar}
      alt=""
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        border: "2px solid #FFFFFF",
        marginLeft: stackIdx > 0 ? -8 : 0,
        objectFit: "cover",
        background: bg,
      }}
    />
  ) : (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        background: `${bg}15`,
        color: bg,
        border: "2px solid #FFFFFF",
        marginLeft: stackIdx > 0 ? -8 : 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      {initials || "?"}
    </div>
  );
}

function ExpenseRow({
  expense,
  groupCurrency,
  formatAmount,
}: {
  expense: ExpensePreview;
  groupCurrency: string;
  formatAmount: (n: number, c: string) => string;
}) {
  const date = new Date(expense.createdAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: "#2B1F15",
        lineHeight: 1.3,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}
        >
          {expense.description ||
            (expense.category ? expense.category : expense.payerName)}
        </div>
        <div style={{ fontSize: 10, color: "#6B5A47", opacity: 0.8 }}>
          {expense.payerName} · {date}
        </div>
      </div>
      <span
        className="bmd-num"
        style={{ fontWeight: 600, color: "#2B1F15", whiteSpace: "nowrap" }}
      >
        {formatAmount(expense.amount, expense.currency || groupCurrency)}
      </span>
    </div>
  );
}

function ModuleBadge({
  icon,
  label,
  color,
}: {
  icon: string;
  label: string;
  color: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 9px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.3,
        color,
        background: `${color}15`,
        border: `1px solid ${color}30`,
        borderRadius: 999,
      }}
    >
      <span style={{ fontSize: 11 }}>{icon}</span>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Table (vue compacte)
// ─────────────────────────────────────────────────────────────────────

function GroupsTable({
  groups,
  t,
}: {
  groups: HubGroup[];
  t: (k: string) => string;
}) {
  const { formatAmount } = useCurrency();
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(43,31,21,0.04)",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#F4ECD8" }}>
            <Th>{t("groups.hub.colType") || "Type"}</Th>
            <Th>{t("groups.hub.colName") || "Nom"}</Th>
            <Th align="right">{t("groups.hub.colMembers") || "Membres"}</Th>
            <Th align="right">{t("groups.hub.colSpent") || "Total dépenses"}</Th>
            <Th align="right">{t("groups.hub.colBalance") || "Mon solde"}</Th>
            <Th>{t("groups.hub.colCreated") || "Créé le"}</Th>
            <Th align="right">{""}</Th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <TableRow key={g.id} group={g} formatAmount={formatAmount} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 14px",
        fontSize: 10,
        letterSpacing: 1.1,
        textTransform: "uppercase",
        color: "#6B5A47",
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  );
}

function TableRow({
  group,
  formatAmount,
  t,
}: {
  group: HubGroup;
  formatAmount: (n: number, c: string) => string;
  t: (k: string) => string;
}) {
  const theme = TYPE_THEME[group.type] || TYPE_THEME.GENERIC;
  const net = parseFloat(group.myNet || "0");
  const isPositive = net > 0.01;
  const isNegative = net < -0.01;
  const balanceColor = isPositive
    ? "#0F6E56"
    : isNegative
      ? "#9F4628"
      : "#6B5A47";

  return (
    <tr
      style={{
        borderTop: "1px solid rgba(43,31,21,0.06)",
        transition: "background 0.1s ease",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLTableRowElement).style.background = "#FBF6EC")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLTableRowElement).style.background = "transparent")
      }
    >
      <td style={tdStyle}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 9px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            color: theme.color,
            background: theme.bg,
            borderRadius: 999,
          }}
        >
          {theme.emoji} {theme.label}
        </span>
      </td>
      <td style={tdStyle}>
        <Link
          href={`/dashboard/groups/${group.id}`}
          style={{
            fontWeight: 600,
            color: "#2B1F15",
            textDecoration: "none",
          }}
        >
          {group.name}
        </Link>
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <span className="bmd-num">{group.membersCount}</span>
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <span className="bmd-num" style={{ color: "#6B5A47" }}>
          {formatAmount(parseFloat(group.totalSpent || "0"), group.defaultCurrency)}
        </span>
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <span
          className="bmd-num"
          style={{ fontWeight: 700, color: balanceColor }}
        >
          {isPositive ? "+" : isNegative ? "−" : ""}
          {formatAmount(Math.abs(net), group.defaultCurrency)}
        </span>
      </td>
      <td style={tdStyle}>
        <span className="bmd-num" style={{ fontSize: 11, color: "#6B5A47" }}>
          {new Date(group.createdAt).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            year: "2-digit",
          })}
        </span>
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <Link
          href={`/dashboard/groups/${group.id}`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#854F0B",
            textDecoration: "none",
          }}
        >
          {t("groups.hub.open") || "Ouvrir →"}
        </Link>
      </td>
    </tr>
  );
}

const tdStyle = {
  padding: "12px 14px",
  verticalAlign: "middle",
  color: "#2B1F15",
} as const;

// ─────────────────────────────────────────────────────────────────────
// Footer / skeleton / empty
// ─────────────────────────────────────────────────────────────────────

function FooterCount({
  filtered,
  total,
  t,
}: {
  filtered: number;
  total: number;
  t: (k: string) => string;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "#6B5A47",
        textAlign: "center",
        opacity: 0.7,
      }}
    >
      {(t("groups.hub.showing") || "{n} sur {total} groupe(s)")
        .replace("{n}", String(filtered))
        .replace("{total}", String(total))}
    </div>
  );
}

function NoResults({ t }: { t: (k: string) => string }) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        color: "#6B5A47",
        background: "#FBF6EC",
        border: "1px dashed rgba(43,31,21,0.18)",
        borderRadius: 12,
      }}
    >
      {t("groups.hub.noResults") || "Aucun groupe ne correspond à tes filtres."}
    </div>
  );
}

function HubSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 12,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: 92,
              background: "rgba(43,31,21,0.04)",
              borderRadius: 14,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 280,
              background: "rgba(43,31,21,0.04)",
              borderRadius: 16,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  onCreate,
  t,
}: {
  onCreate: () => void;
  t: (k: string) => string;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "80px 32px",
        background: "#FFFFFF",
        border: "1px dashed rgba(43,31,21,0.18)",
        borderRadius: 14,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "#2B1F15",
          margin: "0 0 6px",
          fontFamily: "Cormorant Garamond, serif",
        }}
      >
        {t("groups.hub.emptyTitle") || "Tu n'as pas encore de groupe"}
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "#6B5A47",
          maxWidth: 480,
          margin: "0 auto 22px",
          lineHeight: 1.5,
        }}
      >
        {t("groups.hub.emptyHint") ||
          "Crée un groupe pour partager des dépenses, organiser une tontine ou un événement avec ta famille, tes amis ou ta communauté."}
      </p>
      <button
        type="button"
        onClick={onCreate}
        style={{
          padding: "12px 24px",
          fontSize: 14,
          fontWeight: 600,
          borderRadius: 10,
          border: "none",
          background: "linear-gradient(135deg, #C58A2E, #854F0B)",
          color: "#FBF6EC",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(133,79,11,0.25)",
          fontFamily: "inherit",
        }}
      >
        + {t("groups.hub.emptyCta") || "Créer mon premier groupe"}
      </button>
    </div>
  );
}
