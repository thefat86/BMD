"use client";

/**
 * <MobileGroupsList> · V73 — Refonte "Inventaire des groupes".
 *
 * Hero innovant :
 *   Donut SVG répartition par type (à gauche) + bloc stats clés (à droite)
 *   - Solde net cumulé (somme `myNet` convertis en pivot devise)
 *   - Nombre total de groupes + détail "X tontines · Y colocs · …"
 *   - Indicateur du type dominant
 *
 * Liste des groupes en MOSAIQUE :
 *   - Grille 2 colonnes (1 sur très petit écran)
 *   - Chaque tuile : couleur du type en bandeau gauche, icône grande,
 *     nom du groupe, solde net en chiffres saffron sérif, badge nb membres
 *   - Tap = navigation vers le groupe
 *   - Glissement lift au hover/tap pour effet "card stack"
 *
 * Filtres en pills horizontales (scroll snap), comme avant mais plus
 * compacts pour laisser de la place au donut.
 *
 * Cohérence V45-light : palette ivory + saffron, icônes SVG outline,
 * police Cormorant pour les chiffres clés.
 */

import { useEffect, useMemo, useState, useCallback, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearToken, isUnauthorized } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { haptic } from "../platform";
import { Icon, type IconName } from "./icons";

interface Group {
  id: string;
  name: string;
  type: string;
  defaultCurrency: string;
  createdAt: string;
  membersCount?: number;
  memberCount?: number;
  expenseCount?: number;
  role?: string;
  myNet?: string;
}

// Palette par type — couleurs vibrantes mais lisibles sur fond clair
const TYPE_THEME: Record<
  string,
  { color: string; iconName: IconName; label: string }
> = {
  TONTINE: { color: "#E8A33D", iconName: "coins", label: "Tontine" },
  COLOC: { color: "#7DC59E", iconName: "home", label: "Coloc" },
  TRAVEL: { color: "#5B6CFF", iconName: "plane", label: "Voyage" },
  EVENT: { color: "#D9714A", iconName: "party-popper", label: "Événement" },
  CLUB: { color: "#B58FE0", iconName: "users", label: "Club" },
  PARISH: { color: "#F4C863", iconName: "users", label: "Paroisse" },
  GENERIC: { color: "#94A3B8", iconName: "folder", label: "Groupe" },
};

export function MobileGroupsListView({
  onCreate,
}: {
  onCreate?: () => void;
}) {
  const router = useRouter();
  const t = useT();
  const { formatAmount } = useCurrency();

  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | "all">("all");

  const load = useCallback(async () => {
    try {
      const r = await api.listGroups();
      setGroups(r as Group[]);
      setError(null);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (filter === "all") return groups;
    return groups.filter((g) => g.type === filter);
  }, [groups, filter]);

  // Stats agrégées
  const totalGroups = groups?.length ?? 0;
  const typeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of groups ?? []) {
      map[g.type] = (map[g.type] ?? 0) + 1;
    }
    return map;
  }, [groups]);

  // Types présents dans les groupes (triés par fréquence)
  const visibleTypes = useMemo(
    () =>
      Object.keys(typeCounts).sort(
        (a, b) => (typeCounts[b] ?? 0) - (typeCounts[a] ?? 0),
      ),
    [typeCounts],
  );

  // V73 — Agrégat solde net cumulé. Les soldes sont déjà dans la devise
  // pivot user côté backend (api.listGroups les retourne en string décimal).
  // On somme simplement les `myNet` pour donner un aperçu "argent que je
  // dois / qu'on me doit globalement". La devise affichée = devise du
  // 1er groupe (heuristique simple — le user a généralement 1 devise).
  const netTotals = useMemo(() => {
    let net = 0;
    let positive = 0;
    let negative = 0;
    for (const g of groups ?? []) {
      const v = parseFloat(g.myNet ?? "0");
      if (Number.isFinite(v)) {
        net += v;
        if (v > 0) positive += v;
        else if (v < 0) negative += v;
      }
    }
    const currency = groups?.[0]?.defaultCurrency ?? "EUR";
    return { net, positive, negative, currency };
  }, [groups]);

  const dominantType = visibleTypes[0];
  const dominantTheme = dominantType
    ? (TYPE_THEME[dominantType] ?? TYPE_THEME.GENERIC!)
    : null;

  if (!groups) return <GroupsSkeleton />;

  return (
    <div
      style={{
        padding: "4px 16px 120px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* === HERO INVENTAIRE === */}
      <HeroInventory
        totalGroups={totalGroups}
        typeCounts={typeCounts}
        netTotals={netTotals}
        dominantTheme={dominantTheme}
        formatAmount={formatAmount}
        t={t}
      />

      {/* === PILLS filtre type === */}
      {visibleTypes.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 2,
            scrollbarWidth: "none",
            margin: "0 -16px",
            padding: "2px 16px",
            scrollSnapType: "x proximity",
          }}
        >
          <FilterPill
            active={filter === "all"}
            onClick={() => {
              setFilter("all");
              haptic("tap");
            }}
            label={t("groupsList.allFilter") || "Tous"}
            badge={String(totalGroups)}
          />
          {visibleTypes.map((type) => {
            const theme = TYPE_THEME[type] ?? TYPE_THEME.GENERIC!;
            return (
              <FilterPill
                key={type}
                active={filter === type}
                onClick={() => {
                  setFilter(type);
                  haptic("tap");
                }}
                label={theme.label}
                iconName={theme.iconName}
                color={theme.color}
                badge={String(typeCounts[type] ?? 0)}
              />
            );
          })}
        </div>
      )}

      {/* === MOSAIQUE DE GROUPES === */}
      {filteredGroups.length === 0 ? (
        <EmptyState onCreate={onCreate} t={t} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 10,
          }}
        >
          {filteredGroups.map((g, idx) => (
            <GroupTile
              key={g.id}
              group={g}
              formatAmount={formatAmount}
              t={t}
              animDelay={idx * 30}
            />
          ))}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(217,113,74,0.10)",
            border: "1px solid rgba(217,113,74,0.30)",
            color: "#9F2A24",
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}

      {/* FAB création (placé au-dessus du bottom-nav pour ne pas être caché) */}
      <button
        type="button"
        onClick={onCreate}
        aria-label={t("groupsList.createGroup") || "Créer un groupe"}
        style={{
          position: "fixed",
          bottom: 96,
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
          boxShadow:
            "0 12px 30px rgba(232,163,61,0.50), 0 4px 10px rgba(0,0,0,0.20)",
          zIndex: 49,
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

      <style jsx>{`
        @keyframes bmd-tile-enter {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

// ============ HERO INVENTAIRE ============

/**
 * Hero : donut SVG des types (à gauche) + 3 KPI compacts (à droite).
 * Cohérent avec les autres pages V45-light (palette ivory + saffron).
 */
function HeroInventory({
  totalGroups,
  typeCounts,
  netTotals,
  dominantTheme,
  formatAmount,
  t,
}: {
  totalGroups: number;
  typeCounts: Record<string, number>;
  netTotals: { net: number; positive: number; negative: number; currency: string };
  dominantTheme: { color: string; iconName: IconName; label: string } | null;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  const netColor =
    netTotals.net > 0
      ? "#1F7A57"
      : netTotals.net < 0
        ? "#9F2A24"
        : "var(--ink)";
  const netLabel =
    netTotals.net > 0
      ? t("groupsList.youAreOwed") || "On te doit"
      : netTotals.net < 0
        ? t("groupsList.youOwe") || "Tu dois"
        : t("groupsList.allSettled") || "Tout est réglé";

  return (
    <section
      style={{
        position: "relative",
        padding: "18px 18px 16px",
        borderRadius: 22,
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.10) 0%, rgba(232,163,61,0.04) 60%, rgba(244,228,193,0.06) 100%)",
        border: "1px solid rgba(232,163,61,0.22)",
        overflow: "hidden",
      }}
    >
      {/* Halo radial doux dans le coin haut-droit */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(232,163,61,0.18), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          gap: 16,
          alignItems: "center",
        }}
      >
        {/* Donut SVG des types — à gauche */}
        <TypeDonut
          typeCounts={typeCounts}
          totalGroups={totalGroups}
          dominantTheme={dominantTheme}
        />

        {/* Stats à droite */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--saffron)",
              letterSpacing: 1.6,
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 2,
            }}
          >
            {t("groupsList.heroLabel") || "Mes groupes"}
          </div>
          {/* Net cumulé en gros, sérif */}
          <div
            className="bmd-num"
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 24,
              fontWeight: 700,
              color: netColor,
              lineHeight: 1.05,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            aria-label={`${netLabel} ${formatAmount(Math.abs(netTotals.net), netTotals.currency)}`}
          >
            {netTotals.net > 0 && "+"}
            {netTotals.net < 0 && "−"}
            {formatAmount(Math.abs(netTotals.net), netTotals.currency)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-soft)",
              fontWeight: 500,
              marginTop: 1,
            }}
          >
            {netLabel}
          </div>

          {/* Détail : nb total + dominant */}
          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: "var(--ink)",
                padding: "3px 9px",
                borderRadius: 999,
                background: "rgba(232,163,61,0.12)",
                border: "1px solid rgba(232,163,61,0.30)",
              }}
            >
              {totalGroups}{" "}
              {totalGroups > 1
                ? t("groupsList.groupsCount") || "groupes"
                : t("groupsList.groupCount") || "groupe"}
            </span>
            {dominantTheme && totalGroups > 1 && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: dominantTheme.color,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: `${dominantTheme.color}1A`,
                  border: `1px solid ${dominantTheme.color}40`,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon
                  name={dominantTheme.iconName}
                  size={11}
                  strokeWidth={1.7}
                />
                {dominantTheme.label.toLowerCase()}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Donut SVG simple répartition par type. Affiche un cercle composé d'arcs
 * de couleur du type, avec au centre le nombre total de groupes. Si un seul
 * type : cercle plein de cette couleur.
 */
function TypeDonut({
  typeCounts,
  totalGroups,
  dominantTheme,
}: {
  typeCounts: Record<string, number>;
  totalGroups: number;
  dominantTheme: { color: string; iconName: IconName; label: string } | null;
}) {
  const SIZE = 96;
  const STROKE = 11;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const types = Object.keys(typeCounts);

  // Aucun groupe : affiche un cercle vide stylisé
  if (totalGroups === 0) {
    return (
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(232,163,61,0.20)"
          strokeWidth={STROKE}
          strokeDasharray="3 6"
        />
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 5}
          textAnchor="middle"
          fontFamily="Cormorant Garamond, serif"
          fontSize={26}
          fontWeight={700}
          fill="var(--ink)"
        >
          0
        </text>
      </svg>
    );
  }

  // Calcule chaque arc en fraction du cercle
  let offset = 0;
  const segments = types.map((type) => {
    const count = typeCounts[type] ?? 0;
    const fraction = count / totalGroups;
    const length = CIRC * fraction;
    const theme = TYPE_THEME[type] ?? TYPE_THEME.GENERIC!;
    const segment = {
      type,
      color: theme.color,
      length,
      offset,
    };
    offset += length;
    return segment;
  });

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ flexShrink: 0 }}
      role="img"
      aria-label={`${totalGroups} groupe(s) au total`}
    >
      {/* Cercle de fond ivory */}
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="rgba(232,163,61,0.10)"
        strokeWidth={STROKE}
      />
      {/* Arcs colorés par type */}
      {segments.map((s) => (
        <circle
          key={s.type}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={s.color}
          strokeWidth={STROKE}
          strokeDasharray={`${s.length} ${CIRC - s.length}`}
          strokeDashoffset={-s.offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          strokeLinecap="butt"
        />
      ))}
      {/* Nombre central */}
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 2}
        textAnchor="middle"
        fontFamily="Cormorant Garamond, serif"
        fontSize={32}
        fontWeight={700}
        fill="var(--ink, #2B1F15)"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {totalGroups}
      </text>
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 18}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        letterSpacing={1.2}
        fill={dominantTheme?.color ?? "var(--saffron)"}
        style={{ textTransform: "uppercase" }}
      >
        groupes
      </text>
    </svg>
  );
}

// ============ TUILE GROUPE (mosaïque) ============
// V175.J — memoised : re-render uniquement si les props du group changent.
// La liste filteredGroups est map()ée à chaque render parent ; sans memo
// chaque tile re-renderait inutilement (icons SVG + DOM coûteux).

const GroupTile = memo(function GroupTile({
  group,
  formatAmount,
  t,
  animDelay,
}: {
  group: Group;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
  animDelay: number;
}) {
  const theme = TYPE_THEME[group.type] ?? TYPE_THEME.GENERIC!;
  const members = group.membersCount ?? group.memberCount ?? 0;
  const net = parseFloat(group.myNet ?? "0");
  const netColor = net > 0 ? "#1F7A57" : net < 0 ? "#9F2A24" : "var(--ink-soft)";
  const netSign = net > 0 ? "+" : net < 0 ? "−" : "";

  return (
    <Link
      href={`/dashboard/groups/${group.id}`}
      prefetch
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "14px 12px 12px",
        background: "var(--paper, #FBF6EC)",
        border: "1px solid rgba(43,31,21,0.08)",
        borderRadius: 16,
        color: "var(--ink, #2B1F15)",
        textDecoration: "none",
        overflow: "hidden",
        minHeight: 132,
        animation: `bmd-tile-enter 320ms ease-out ${animDelay}ms both`,
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        boxShadow: "0 1px 2px rgba(43,31,21,0.04)",
      }}
    >
      {/* Bandeau coloré gauche (épais) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: theme.color,
        }}
      />

      {/* Halo coloré subtil en arrière-plan */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -30,
          right: -30,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.color}24, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Ligne du haut : icône + badge admin */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          marginLeft: 6,
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: `${theme.color}1F`,
            border: `1px solid ${theme.color}55`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.color,
            flexShrink: 0,
          }}
        >
          <Icon name={theme.iconName} size={17} strokeWidth={1.7} />
        </span>
        {group.role === "ADMIN" && (
          <span
            style={{
              fontSize: 8.5,
              padding: "2px 5px",
              borderRadius: 4,
              background: "rgba(232,163,61,0.22)",
              color: "#C58A2E",
              fontWeight: 800,
              letterSpacing: 0.6,
            }}
          >
            ADMIN
          </span>
        )}
      </div>

      {/* Nom du groupe */}
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          color: "var(--ink)",
          marginLeft: 6,
          lineHeight: 1.25,
          // Truncate à 2 lignes
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          minHeight: 34,
        }}
      >
        {group.name}
      </div>

      {/* Solde net en grand */}
      <div
        className="bmd-num"
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 18,
          fontWeight: 700,
          color: netColor,
          marginLeft: 6,
          marginTop: "auto",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {net === 0
          ? t("groupsList.tileSettled") || "Réglé"
          : `${netSign}${formatAmount(Math.abs(net), group.defaultCurrency)}`}
      </div>

      {/* Footer : members + chip type compact */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          marginLeft: 6,
          fontSize: 10.5,
          color: "var(--ink-soft, #6B5A4C)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          <Icon name="users" size={11} strokeWidth={1.6} />
          {members}
        </span>
        <span
          style={{
            fontWeight: 700,
            color: theme.color,
            fontSize: 9.5,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {theme.label}
        </span>
      </div>
    </Link>
  );
});

// ============ FILTER PILL ============

function FilterPill({
  active,
  onClick,
  label,
  iconName,
  color,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  iconName?: IconName;
  color?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: "7px 13px",
        background: active
          ? "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))"
          : "rgba(232,163,61,0.06)",
        color: active ? "#16111E" : "var(--ink, #2B1F15)",
        border: active
          ? "1px solid rgba(232,163,61,0.40)"
          : `1px solid ${color ? `${color}40` : "rgba(232,163,61,0.18)"}`,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        scrollSnapAlign: "start",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {iconName && (
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            color: active ? "#16111E" : color ?? "var(--ink)",
          }}
        >
          <Icon name={iconName} size={12} strokeWidth={1.7} />
        </span>
      )}
      <span>{label}</span>
      {badge && (
        <span
          style={{
            fontSize: 9.5,
            padding: "1px 5px",
            borderRadius: 6,
            background: active
              ? "rgba(22,17,30,0.18)"
              : "rgba(232,163,61,0.15)",
            color: active ? "#16111E" : "var(--saffron)",
            fontWeight: 800,
            minWidth: 14,
            textAlign: "center",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ============ EMPTY STATE ============

function EmptyState({
  onCreate,
  t,
}: {
  onCreate?: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div
      style={{
        padding: "40px 18px",
        textAlign: "center",
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.08), rgba(181,70,46,0.03))",
        border: "1px dashed rgba(232,163,61,0.30)",
        borderRadius: 20,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          margin: "0 auto 12px",
          background: "rgba(232,163,61,0.14)",
          border: "1px solid rgba(232,163,61,0.30)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--saffron)",
        }}
      >
        <Icon name="folder" size={26} strokeWidth={1.5} />
      </div>
      <h2
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          color: "var(--ink)",
          margin: "0 0 6px",
        }}
      >
        {t("groupsList.emptyTitle") || "Pas encore de groupe"}
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "var(--ink-soft, #6B5A4C)",
          margin: "0 auto 16px",
          maxWidth: 280,
          lineHeight: 1.5,
        }}
      >
        {t("groupsList.emptyBody") ||
          "Crée ton premier groupe pour partager des dépenses ou démarrer une tontine."}
      </p>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          style={{
            padding: "12px 22px",
            background:
              "linear-gradient(135deg, var(--saffron), var(--terracotta))",
            color: "#16111E",
            border: "none",
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow: "0 10px 30px rgba(232,163,61,0.30)",
          }}
        >
          {t("groupsList.createCta") || "+ Créer un groupe"}
        </button>
      )}
    </div>
  );
}

// ============ SKELETON ============

function GroupsSkeleton() {
  return (
    <div
      style={{
        padding: "4px 16px 100px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          height: 130,
          borderRadius: 22,
          background: "rgba(232,163,61,0.05)",
          animation: "bmd-gl-skel 1.2s infinite ease-in-out",
        }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 32,
              borderRadius: 999,
              background: "rgba(232,163,61,0.05)",
              animation: `bmd-gl-skel 1.2s infinite ease-in-out ${0.1 + i * 0.05}s`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 132,
              borderRadius: 16,
              background: "rgba(232,163,61,0.05)",
              animation: `bmd-gl-skel 1.2s infinite ease-in-out ${0.2 + i * 0.05}s`,
            }}
          />
        ))}
      </div>
      <style jsx>{`
        @keyframes bmd-gl-skel {
          0%,
          100% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.85;
          }
        }
      `}</style>
    </div>
  );
}
