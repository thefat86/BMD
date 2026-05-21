"use client";

/**
 * <MobileStatsView> · V99 — Stats Story mode (refonte propre).
 *
 * Format Instagram Stories : 5 cards plein écran swipeables horizontalement.
 * Spec design V45-light :
 *   1. HERO  · « Total dépensé » en chiffres Cormorant 72px cocoa profond,
 *              gradient ivory→saffron-pale, range pills 6/12/24 mois.
 *   2. CHART · Bar chart évolution avec pics highlightés saffron solide
 *              (pics = mois au-dessus de la moyenne). Tap = détail.
 *   3. CATÉGORIES · Top 6 avec icônes SVG colorées saffron/cocoa et %
 *              très lisible.
 *   4. PERSONNES · Top 6 contreparties avec net en Cormorant et avatar.
 *   5. INSIGHT IA · Card saffron-pale avec narratif calculé : trend, top cat,
 *              top personne, conseil contextuel.
 *
 * Architecture :
 *   - Progress bar segmentée en haut, sticky, saffron pour la card active.
 *   - Scroll horizontal scroll-snap, container width contained.
 *   - Pas de scroll vertical interne par card (tout doit tenir en 1 vue).
 *   - Mobile-first : font-size, padding, gaps sont tous calés pour 360-414px.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, isUnauthorized } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { Icon, type IconName } from "./icons";
import { SegmentedControl } from "./segmented-control";

type Range = 6 | 12 | 24;

interface Stats {
  currency: string;
  rangeMonths: Range;
  totalSpent: number;
  totalSettled: number;
  expenseCount: number;
  groupCount: number;
  myNet: number;
  timeline: Array<{
    period: string;
    totalSpent: number;
    myNet: number;
    expenseCount: number;
  }>;
  topCategories: Array<{
    category: string;
    totalAmount: number;
    expenseCount: number;
    percent: number;
  }>;
  topPayers: Array<{
    userId: string;
    displayName: string;
    totalPaid: number;
    totalOwed: number;
    net: number;
    expenseCount: number;
  }>;
}

// V99 — Palette restreinte saffron-centric (vs arc-en-ciel V52)
// Garde une lisibilité forte sans confettis visuels.
const CATEGORY_PALETTE: Record<string, { color: string; tint: string }> = {
  GROCERY: { color: "#C58A2E", tint: "rgba(197,138,46,0.14)" }, // saffron foncé
  RESTAURANT: { color: "#B5462E", tint: "rgba(181,70,46,0.14)" }, // terracotta
  TRANSPORT: { color: "#5B6CFF", tint: "rgba(91,108,255,0.14)" }, // indigo
  HOUSING: { color: "#7DC59E", tint: "rgba(125,197,158,0.14)" }, // emerald
  UTILITIES: { color: "#F4C863", tint: "rgba(244,200,99,0.18)" }, // gold
  HEALTH: { color: "#E47C5F", tint: "rgba(228,124,95,0.14)" }, // coral
  ENTERTAINMENT: { color: "#B58FE0", tint: "rgba(181,143,224,0.14)" }, // lavender
  TRAVEL: { color: "#3F8F65", tint: "rgba(63,143,101,0.14)" }, // forest
  GIFT: { color: "#D9714A", tint: "rgba(217,113,74,0.14)" }, // amber
  OTHER: { color: "#8A7C66", tint: "rgba(138,124,102,0.14)" }, // mocha
};

const CATEGORY_ICON: Record<string, IconName> = {
  GROCERY: "shopping-cart",
  RESTAURANT: "utensils",
  TRANSPORT: "car",
  HOUSING: "home",
  UTILITIES: "lightbulb",
  HEALTH: "pill",
  ENTERTAINMENT: "palette",
  TRAVEL: "plane",
  GIFT: "gift",
  OTHER: "tag",
};

const CATEGORY_LABEL: Record<string, string> = {
  GROCERY: "Courses",
  RESTAURANT: "Resto",
  TRANSPORT: "Transport",
  HOUSING: "Logement",
  UTILITIES: "Charges",
  HEALTH: "Santé",
  ENTERTAINMENT: "Loisirs",
  TRAVEL: "Voyage",
  GIFT: "Cadeaux",
  OTHER: "Autre",
};

const STORY_COUNT = 5;

export function MobileStatsView() {
  const router = useRouter();
  const t = useT();
  const { formatAmount } = useCurrency();

  const [range, setRange] = useState<Range>(6);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storiesRef = useRef<HTMLDivElement | null>(null);
  const [currentStory, setCurrentStory] = useState(0);

  // Detect current story from scroll position (horizontal snap)
  useEffect(() => {
    const el = storiesRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const idx = Math.round(el.scrollLeft / w);
      const clamped = Math.max(0, Math.min(STORY_COUNT - 1, idx));
      setCurrentStory((prev) => (prev === clamped ? prev : clamped));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [stats]);

  const goToStory = useCallback((idx: number) => {
    const el = storiesRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(STORY_COUNT - 1, idx));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getMyStats(range);
      setStats(r);
      setError(null);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range, router]);

  useEffect(() => {
    void load();
  }, [load]);

  // V99 — Insight IA narratif (calculé en frontend, déterministe)
  const insight = useMemo(() => stats ? computeInsight(stats) : null, [stats]);

  if (loading && !stats) return <StatsSkeleton />;
  if (error && !stats) {
    return (
      <div style={{ padding: "20px 16px" }}>
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "rgba(228,124,95,0.08)",
            border: "1px solid rgba(228,124,95,0.30)",
            color: "#C44A3E",
            fontSize: 13,
            lineHeight: 1.55,
            textAlign: "center",
          }}
        >
          ⚠️ {error}
        </div>
      </div>
    );
  }
  if (!stats) return null;

  const currency = stats.currency;
  const hasAny =
    stats.totalSpent > 0 ||
    stats.expenseCount > 0 ||
    stats.timeline.some((p) => p.totalSpent > 0);

  if (!hasAny) {
    return <EmptyStats t={t} />;
  }

  // Style commun pour toutes les cards Stories (plein écran swipeable)
  const cardBase: React.CSSProperties = {
    scrollSnapAlign: "start",
    flexShrink: 0,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: "18px 18px 24px",
    display: "flex",
    flexDirection: "column",
  };

  return (
    <div
      data-theme="v45-light"
      style={{
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* === PROGRESS BAR sticky (5 segments saffron) === */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          display: "flex",
          gap: 4,
          padding: "12px 18px 10px",
          background:
            "linear-gradient(180deg, var(--ivory, #FBF6EC) 75%, rgba(251,246,236,0))",
        }}
      >
        {Array.from({ length: STORY_COUNT }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goToStory(i)}
            aria-label={`Story ${i + 1}/${STORY_COUNT}`}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 999,
              border: "none",
              padding: 0,
              cursor: "pointer",
              background:
                i <= currentStory
                  ? "linear-gradient(90deg, #E8A33D, #C58A2E)"
                  : "rgba(43,31,21,0.10)",
              transition: "background 0.25s ease",
              touchAction: "manipulation",
            }}
          />
        ))}
      </div>

      {/* === CARDS STORIES === */}
      <div
        ref={storiesRef}
        style={{
          display: "flex",
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* V175.F — Lazy render : la card active + voisines sont rendues,
            les autres sont un placeholder gris (économie CPU initial + perf scroll). */}
        {/* CARD 1 — HERO total dépensé */}
        <div style={cardBase}>
          {isStoryActive(0, currentStory) ? (
            <HeroCard
              stats={stats}
              range={range}
              setRange={setRange}
              currency={currency}
              formatAmount={formatAmount}
              t={t}
            />
          ) : (
            <StoryPlaceholder />
          )}
        </div>

        {/* CARD 2 — Bar chart évolution avec pics saffron */}
        <div style={cardBase}>
          {isStoryActive(1, currentStory) ? (
            <TimelineCard
              timeline={stats.timeline}
              currency={currency}
              formatAmount={formatAmount}
              t={t}
            />
          ) : (
            <StoryPlaceholder />
          )}
        </div>

        {/* CARD 3 — Top catégories */}
        <div style={cardBase}>
          {isStoryActive(2, currentStory) ? (
            <CategoriesCard
              categories={stats.topCategories}
              currency={currency}
              formatAmount={formatAmount}
              t={t}
            />
          ) : (
            <StoryPlaceholder />
          )}
        </div>

        {/* CARD 4 — Top contreparties */}
        <div style={cardBase}>
          {isStoryActive(3, currentStory) ? (
            <PeopleCard
              payers={stats.topPayers}
              currency={currency}
              formatAmount={formatAmount}
              t={t}
            />
          ) : (
            <StoryPlaceholder />
          )}
        </div>

        {/* CARD 5 — Insight IA narratif (saffron-pale) */}
        <div style={cardBase}>
          {isStoryActive(4, currentStory) ? (
            <InsightCard
              insight={insight}
              stats={stats}
              currency={currency}
              formatAmount={formatAmount}
              t={t}
            />
          ) : (
            <StoryPlaceholder />
          )}
        </div>
      </div>

      {/* === Nav discrète bas (← n/5 →) === */}
      <NavFooter
        currentStory={currentStory}
        goToStory={goToStory}
        t={t}
      />

      <style jsx>{`
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

// ============================================================
// CARD 1 · HERO total dépensé
// ============================================================

function HeroCard({
  stats,
  range,
  setRange,
  currency,
  formatAmount,
  t,
}: {
  stats: Stats;
  range: Range;
  setRange: (r: Range) => void;
  currency: string;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  const myNet = stats.myNet;
  return (
    <section
      style={{
        flex: 1,
        padding: "30px 22px 26px",
        borderRadius: 22,
        background:
          "linear-gradient(160deg, var(--paper, #FFFFFF) 0%, var(--ivory, #FBF6EC) 50%, var(--v45-saffron-pale, #F6E8C5) 100%)",
        border: "1px solid var(--v45-line, rgba(43,31,21,0.06))",
        boxShadow: "0 6px 24px rgba(43,31,21,0.04)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 18,
        minHeight: 380,
      }}
    >
      {/* Halo décoratif */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -100,
          right: -80,
          width: 280,
          height: 280,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(197,138,46,0.18), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>
        <Eyebrow>
          {t("stats.totalSpentLabel") || "Total dépensé"} ·{" "}
          {range} {t("stats.monthsUnit") || "mois"}
        </Eyebrow>
        <h1
          className="bmd-num"
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: "clamp(54px, 17vw, 76px)",
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            margin: "10px 0 14px",
            overflowWrap: "anywhere",
            letterSpacing: "-0.5px",
          }}
        >
          {formatAmount(stats.totalSpent, currency)}
        </h1>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--cocoa-soft, #6B5A47)",
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          Sur {stats.expenseCount} dépense{stats.expenseCount > 1 ? "s" : ""} ·{" "}
          {stats.groupCount} groupe{stats.groupCount > 1 ? "s" : ""}
        </p>
      </div>

      {/* Mon net en gros (vert/rouge) */}
      <div
        style={{
          position: "relative",
          padding: "14px 16px",
          background: "var(--paper, #FFFFFF)",
          borderRadius: 14,
          border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              color: "var(--cocoa-soft, #6B5A47)",
            }}
          >
            {t("stats.myNet") || "Mon solde net"}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--cocoa-soft, #6B5A47)",
              marginTop: 2,
            }}
          >
            {myNet > 0
              ? "On te doit"
              : myNet < 0
                ? "Tu dois"
                : "Tout est réglé"}
          </div>
        </div>
        <div
          className="bmd-num"
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 28,
            fontWeight: 700,
            color: myNet > 0 ? "#3F8F65" : myNet < 0 ? "#C44A3E" : "var(--cocoa, #2B1F15)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {myNet > 0 ? "+" : myNet < 0 ? "−" : ""}
          {formatAmount(Math.abs(myNet), currency)}
        </div>
      </div>

      {/* Range pills 6/12/24 mois */}
      <div style={{ position: "relative" }}>
        <SegmentedControl<string>
          value={String(range)}
          onChange={(v) => setRange(Number(v) as Range)}
          ariaLabel="Période d'analyse"
          segments={[
            { value: "6", label: "6 mois" },
            { value: "12", label: "12 mois" },
            { value: "24", label: "24 mois" },
          ]}
          size="sm"
        />
      </div>
    </section>
  );
}

// ============================================================
// CARD 2 · Bar chart évolution (pics highlightés saffron)
// ============================================================

function TimelineCard({
  timeline,
  currency,
  formatAmount,
  t,
}: {
  timeline: Stats["timeline"];
  currency: string;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  // On garde les N derniers points (limite 14 pour rester lisible)
  const points = timeline.slice(-14);
  const max = Math.max(...points.map((p) => p.totalSpent), 1);
  const avg =
    points.length > 0
      ? points.reduce((s, p) => s + p.totalSpent, 0) / points.length
      : 0;
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // Par défaut, sélectionne la dernière barre non-nulle pour donner du contexte
  useEffect(() => {
    if (activeIdx !== null) return;
    const lastNonZero = [...points]
      .map((p, i) => ({ p, i }))
      .reverse()
      .find((x) => x.p.totalSpent > 0);
    if (lastNonZero) setActiveIdx(lastNonZero.i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);

  const active = activeIdx !== null ? points[activeIdx] : null;

  return (
    <section
      style={{
        flex: 1,
        padding: "22px 20px 24px",
        borderRadius: 20,
        background: "var(--paper, #FFFFFF)",
        border: "1px solid var(--v45-line, rgba(43,31,21,0.06))",
        boxShadow: "0 4px 16px rgba(43,31,21,0.03)",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: 380,
      }}
    >
      <div>
        <Eyebrow>{t("stats.timelineTitle") || "Évolution mensuelle"}</Eyebrow>
        <h2
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            fontWeight: 700,
            margin: "6px 0 0",
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.15,
          }}
        >
          Tes pics de dépenses
        </h2>
      </div>

      {/* Détail du point actif (clic) */}
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ivory, #FBF6EC)",
          borderRadius: 12,
          border: "1px solid var(--v45-line, rgba(43,31,21,0.06))",
          minHeight: 70,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            color: "var(--cocoa-soft, #6B5A47)",
          }}
        >
          {active ? formatPeriod(active.period) : "Tape une barre"}
        </div>
        <div
          className="bmd-num"
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.1,
            marginTop: 2,
          }}
        >
          {active ? formatAmount(active.totalSpent, currency) : "—"}
        </div>
        {active && active.expenseCount > 0 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--cocoa-soft, #6B5A47)",
              marginTop: 2,
            }}
          >
            {active.expenseCount} dépense
            {active.expenseCount > 1 ? "s" : ""}
            {avg > 0 && active.totalSpent > avg && (
              <span
                style={{
                  marginLeft: 6,
                  color: "#C58A2E",
                  fontWeight: 700,
                }}
              >
                · Pic !
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bars — pics highlightés saffron solide */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 5,
          height: 130,
          padding: "0 2px",
        }}
      >
        {points.map((p, i) => {
          const ratio = p.totalSpent / max;
          const isActive = activeIdx === i;
          const isPeak = avg > 0 && p.totalSpent > avg * 1.15;
          return (
            <button
              key={p.period}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`${formatPeriod(p.period)} : ${formatAmount(p.totalSpent, currency)}`}
              style={{
                flex: 1,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                touchAction: "manipulation",
                position: "relative",
              }}
            >
              {/* Marker pic */}
              {isPeak && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: -2,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "var(--v45-saffron, #C58A2E)",
                  }}
                />
              )}
              <div
                style={{
                  width: "100%",
                  height: `${Math.max(ratio * 100, 4)}%`,
                  background: isActive
                    ? "linear-gradient(180deg, #E8A33D, #C58A2E)"
                    : isPeak
                      ? "linear-gradient(180deg, #E8A33D, #C58A2E)"
                      : "rgba(43,31,21,0.10)",
                  borderRadius: "6px 6px 2px 2px",
                  transition: "background 0.18s ease",
                  boxShadow: isActive
                    ? "0 2px 8px rgba(197,138,46,0.35)"
                    : "none",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Axe X : 1er + dernier mois */}
      {points.length > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10.5,
            color: "var(--cocoa-soft, #6B5A47)",
            letterSpacing: 0.4,
            paddingTop: 2,
          }}
        >
          <span>{formatPeriod(points[0]!.period, true)}</span>
          <span>{formatPeriod(points[points.length - 1]!.period, true)}</span>
        </div>
      )}

      {avg > 0 && (
        <div
          style={{
            fontSize: 11,
            color: "var(--cocoa-soft, #6B5A47)",
            textAlign: "center",
            opacity: 0.85,
          }}
        >
          Moy. {formatAmount(avg, currency)} / mois ·{" "}
          <span style={{ color: "#C58A2E", fontWeight: 700 }}>•</span> = pic
        </div>
      )}
    </section>
  );
}

// ============================================================
// CARD 3 · Top catégories
// ============================================================

function CategoriesCard({
  categories,
  currency,
  formatAmount,
  t,
}: {
  categories: Stats["topCategories"];
  currency: string;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  if (categories.length === 0) {
    return (
      <EmptyHint
        eyebrow={t("stats.topCategoriesTitle") || "Top catégories"}
        title={t("stats.noCategoriesYet") || "Pas encore de catégories"}
        body="Ajoute quelques dépenses pour voir où passe ton argent."
      />
    );
  }
  return (
    <section
      style={{
        flex: 1,
        padding: "22px 20px 24px",
        borderRadius: 20,
        background: "var(--paper, #FFFFFF)",
        border: "1px solid var(--v45-line, rgba(43,31,21,0.06))",
        boxShadow: "0 4px 16px rgba(43,31,21,0.03)",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: 380,
      }}
    >
      <div>
        <Eyebrow>{t("stats.topCategoriesTitle") || "Top catégories"}</Eyebrow>
        <h2
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            fontWeight: 700,
            margin: "6px 0 0",
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.15,
          }}
        >
          Où va ton argent
        </h2>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {categories.slice(0, 6).map((c) => {
          const palette = CATEGORY_PALETTE[c.category] ?? CATEGORY_PALETTE.OTHER!;
          const iconName = CATEGORY_ICON[c.category] ?? "tag";
          const label = CATEGORY_LABEL[c.category] ?? c.category;
          return (
            <div
              key={c.category}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 12,
                background: "var(--ivory, #FBF6EC)",
                border: "1px solid var(--v45-line, rgba(43,31,21,0.05))",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: palette.tint,
                  color: palette.color,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={iconName} size={20} strokeWidth={1.7} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                    marginBottom: 5,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "var(--cocoa, #2B1F15)",
                    }}
                  >
                    {label}
                  </span>
                  <span
                    className="bmd-num"
                    style={{
                      fontSize: 12.5,
                      color: "var(--cocoa-soft, #6B5A47)",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatAmount(c.totalAmount, currency)}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: "rgba(43,31,21,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(c.percent, 3)}%`,
                      height: "100%",
                      background: palette.color,
                      borderRadius: 999,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
              <span
                className="bmd-num"
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 18,
                  fontWeight: 700,
                  color: palette.color,
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                  minWidth: 42,
                  textAlign: "right",
                }}
              >
                {Math.round(c.percent)}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================
// CARD 4 · Top contreparties (personnes)
// ============================================================

function PeopleCard({
  payers,
  currency,
  formatAmount,
  t,
}: {
  payers: Stats["topPayers"];
  currency: string;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  if (payers.length === 0) {
    return (
      <EmptyHint
        eyebrow={t("stats.topPayersTitle") || "Top personnes"}
        title="Personne pour l'instant"
        body="Ajoute des dépenses partagées avec tes amis ou ta famille."
      />
    );
  }
  return (
    <section
      style={{
        flex: 1,
        padding: "22px 20px 24px",
        borderRadius: 20,
        background: "var(--paper, #FFFFFF)",
        border: "1px solid var(--v45-line, rgba(43,31,21,0.06))",
        boxShadow: "0 4px 16px rgba(43,31,21,0.03)",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: 380,
      }}
    >
      <div>
        <Eyebrow>{t("stats.topPayersTitle") || "Top contreparties"}</Eyebrow>
        <h2
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            fontWeight: 700,
            margin: "6px 0 0",
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.15,
          }}
        >
          Avec qui tu partages
        </h2>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {payers.slice(0, 6).map((p) => {
          const net = p.net;
          return (
            <div
              key={p.userId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 12,
                background: "var(--ivory, #FBF6EC)",
                border: "1px solid var(--v45-line, rgba(43,31,21,0.05))",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background:
                    "linear-gradient(135deg, var(--v45-saffron-pale, #F6E8C5), rgba(232,163,61,0.30))",
                  color: "var(--v45-saffron, #C58A2E)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {p.displayName.charAt(0).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--cocoa, #2B1F15)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.displayName}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--cocoa-soft, #6B5A47)",
                    marginTop: 1,
                  }}
                >
                  {p.expenseCount} dépense{p.expenseCount > 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <span
                  className="bmd-num"
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 18,
                    fontWeight: 700,
                    color:
                      net > 0
                        ? "#3F8F65"
                        : net < 0
                          ? "#C44A3E"
                          : "var(--cocoa, #2B1F15)",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.1,
                  }}
                >
                  {net > 0 ? "+" : net < 0 ? "−" : ""}
                  {formatAmount(Math.abs(net), currency)}
                </span>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--cocoa-soft, #6B5A47)",
                    marginTop: 1,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    fontWeight: 600,
                  }}
                >
                  {net > 0 ? "te doit" : net < 0 ? "tu dois" : "réglé"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================
// CARD 5 · Insight IA narratif (saffron-pale)
// ============================================================

interface Insight {
  trendDirection: "up" | "down" | "flat";
  trendPercent: number; // 0..100
  topCategoryKey: string | null;
  topCategoryPercent: number;
  topPayerName: string | null;
  topPayerNet: number;
  avgMonthly: number;
  headline: string;
  details: string[];
  advice: string;
}

function computeInsight(stats: Stats): Insight {
  // Trend : comparer 2e moitié vs 1ère moitié de la timeline
  const tl = stats.timeline;
  const half = Math.floor(tl.length / 2);
  const firstHalf = tl.slice(0, half);
  const secondHalf = tl.slice(half);
  const firstAvg =
    firstHalf.length > 0
      ? firstHalf.reduce((s, p) => s + p.totalSpent, 0) / firstHalf.length
      : 0;
  const secondAvg =
    secondHalf.length > 0
      ? secondHalf.reduce((s, p) => s + p.totalSpent, 0) / secondHalf.length
      : 0;
  let trendDirection: "up" | "down" | "flat" = "flat";
  let trendPercent = 0;
  if (firstAvg > 0) {
    const delta = ((secondAvg - firstAvg) / firstAvg) * 100;
    trendPercent = Math.abs(Math.round(delta));
    if (Math.abs(delta) < 5) trendDirection = "flat";
    else if (delta > 0) trendDirection = "up";
    else trendDirection = "down";
  }

  const topCat = stats.topCategories[0] ?? null;
  const topPayer = stats.topPayers[0] ?? null;
  const avgMonthly = tl.length > 0 ? stats.totalSpent / tl.length : 0;

  // Headline contextuel
  let headline = "Ton aperçu";
  if (trendDirection === "down") {
    headline = `Tu dépenses ${trendPercent}% de moins`;
  } else if (trendDirection === "up") {
    headline = `Tu dépenses ${trendPercent}% de plus`;
  } else if (stats.expenseCount > 0) {
    headline = "Tu gardes un rythme stable";
  }

  // Details = phrases courtes
  const details: string[] = [];
  if (topCat) {
    const label = CATEGORY_LABEL[topCat.category] ?? topCat.category;
    details.push(
      `${Math.round(topCat.percent)}% en ${label.toLowerCase()}`,
    );
  }
  if (topPayer && Math.abs(topPayer.net) > 0) {
    if (topPayer.net > 0) {
      details.push(`${topPayer.displayName} te doit le plus`);
    } else {
      details.push(`Tu dois le plus à ${topPayer.displayName}`);
    }
  }
  if (avgMonthly > 0) {
    details.push(
      `Moy. ${formatNumberCompact(avgMonthly)} ${stats.currency} / mois`,
    );
  }

  // Advice contextuel
  let advice = "Continue à tracker tes dépenses pour mieux comprendre tes habitudes.";
  if (trendDirection === "up" && trendPercent > 20) {
    advice = "Hausse marquée ces derniers mois — regarde si une catégorie a pris trop de place.";
  } else if (trendDirection === "down" && trendPercent > 15) {
    advice = "Belle baisse — tu fais des choix conscients. Bravo 🌿";
  } else if (Math.abs(stats.myNet) > stats.totalSpent * 0.2) {
    advice =
      stats.myNet < 0
        ? "Tu dois pas mal — pense à régler avant que ça s'accumule."
        : "On te doit pas mal — n'hésite pas à relancer en douceur.";
  } else if (stats.totalSettled > 0 && stats.totalSpent > 0) {
    const settledRatio = stats.totalSettled / stats.totalSpent;
    if (settledRatio > 0.7) {
      advice = "Tu règles vite tes comptes — tes amitiés te disent merci 🙏";
    }
  }

  return {
    trendDirection,
    trendPercent,
    topCategoryKey: topCat?.category ?? null,
    topCategoryPercent: topCat?.percent ?? 0,
    topPayerName: topPayer?.displayName ?? null,
    topPayerNet: topPayer?.net ?? 0,
    avgMonthly,
    headline,
    details,
    advice,
  };
}

function formatNumberCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toString();
}

function InsightCard({
  insight,
  stats,
  currency,
  formatAmount,
  t,
}: {
  insight: Insight | null;
  stats: Stats;
  currency: string;
  formatAmount: (a: number | string, c: string) => string;
  t: ReturnType<typeof useT>;
}) {
  if (!insight) return null;
  const trendIcon =
    insight.trendDirection === "up"
      ? "↑"
      : insight.trendDirection === "down"
        ? "↓"
        : "→";
  const trendColor =
    insight.trendDirection === "up"
      ? "#C44A3E"
      : insight.trendDirection === "down"
        ? "#3F8F65"
        : "var(--cocoa, #2B1F15)";
  return (
    <section
      style={{
        flex: 1,
        padding: "26px 22px 26px",
        borderRadius: 22,
        background:
          "linear-gradient(160deg, var(--v45-saffron-pale, #F6E8C5) 0%, rgba(232,163,61,0.18) 50%, rgba(181,70,46,0.12) 100%)",
        border: "1px solid rgba(197,138,46,0.30)",
        boxShadow: "0 8px 28px rgba(197,138,46,0.18)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: 380,
      }}
    >
      {/* Halo */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -80,
          left: -60,
          width: 240,
          height: 240,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.30), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>
        <Eyebrow>{t("stats.insightsTitle") || "L'insight BMD"}</Eyebrow>
        <h2
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: "clamp(28px, 7.5vw, 34px)",
            fontWeight: 700,
            margin: "6px 0 0",
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.1,
          }}
        >
          {insight.headline}
        </h2>
        {insight.trendDirection !== "flat" && (
          <div
            style={{
              marginTop: 10,
              fontSize: 14,
              fontWeight: 700,
              color: trendColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {trendIcon} {insight.trendPercent}% vs début de période
          </div>
        )}
      </div>

      {/* Détails en bullets */}
      <div
        style={{
          position: "relative",
          padding: "16px 18px",
          background: "var(--paper, #FFFFFF)",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.6)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {insight.details.map((d, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13.5,
              color: "var(--cocoa, #2B1F15)",
              fontWeight: 500,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--v45-saffron, #C58A2E)",
                flexShrink: 0,
              }}
            />
            <span>{d}</span>
          </div>
        ))}
      </div>

      {/* Conseil IA */}
      <div
        style={{
          position: "relative",
          padding: "14px 16px",
          background: "rgba(255,255,255,0.45)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.7)",
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            color: "var(--v45-saffron, #C58A2E)",
            marginBottom: 4,
          }}
        >
          💡 Conseil
        </div>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--cocoa, #2B1F15)",
            margin: 0,
            lineHeight: 1.55,
            fontStyle: "italic",
          }}
        >
          {insight.advice}
        </p>
      </div>

      {/* Footer chip réglé */}
      {stats.totalSettled > 0 && (
        <div
          style={{
            position: "relative",
            fontSize: 11.5,
            color: "var(--cocoa-soft, #6B5A47)",
            textAlign: "center",
          }}
        >
          {formatAmount(stats.totalSettled, currency)} réglés sur la période
        </div>
      )}
    </section>
  );
}

// ============================================================
// Helpers visuels
// ============================================================

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 1.6,
        color: "var(--v45-saffron, #C58A2E)",
      }}
    >
      {children}
    </div>
  );
}

function NavFooter({
  currentStory,
  goToStory,
  t,
}: {
  currentStory: number;
  goToStory: (i: number) => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        padding: "12px 18px 8px",
      }}
    >
      <button
        type="button"
        onClick={() => goToStory(currentStory - 1)}
        disabled={currentStory === 0}
        aria-label={t("common.previous") || "Précédent"}
        style={{
          padding: "8px 14px",
          borderRadius: 999,
          background: "transparent",
          border: "1px solid rgba(43,31,21,0.10)",
          color:
            currentStory === 0
              ? "rgba(43,31,21,0.30)"
              : "var(--cocoa, #2B1F15)",
          fontSize: 13,
          fontWeight: 700,
          cursor: currentStory === 0 ? "default" : "pointer",
          opacity: currentStory === 0 ? 0.4 : 1,
          fontFamily: "inherit",
          touchAction: "manipulation",
          minWidth: 44,
        }}
      >
        ←
      </button>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: 11,
          color: "var(--cocoa-soft, #6B5A47)",
          letterSpacing: 1.2,
          fontWeight: 700,
          minWidth: 40,
          justifyContent: "center",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {currentStory + 1} / {STORY_COUNT}
      </span>
      <button
        type="button"
        onClick={() => goToStory(currentStory + 1)}
        disabled={currentStory === STORY_COUNT - 1}
        aria-label={t("common.next") || "Suivant"}
        style={{
          padding: "8px 14px",
          borderRadius: 999,
          background: "transparent",
          border: "1px solid rgba(43,31,21,0.10)",
          color:
            currentStory === STORY_COUNT - 1
              ? "rgba(43,31,21,0.30)"
              : "var(--cocoa, #2B1F15)",
          fontSize: 13,
          fontWeight: 700,
          cursor: currentStory === STORY_COUNT - 1 ? "default" : "pointer",
          opacity: currentStory === STORY_COUNT - 1 ? 0.4 : 1,
          fontFamily: "inherit",
          touchAction: "manipulation",
          minWidth: 44,
        }}
      >
        →
      </button>
    </div>
  );
}

function EmptyHint({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <section
      style={{
        flex: 1,
        padding: "30px 22px",
        borderRadius: 20,
        background: "var(--paper, #FFFFFF)",
        border: "1px dashed var(--v45-line, rgba(43,31,21,0.15))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 12,
        minHeight: 380,
      }}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          margin: 0,
          color: "var(--cocoa, #2B1F15)",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: 13.5,
          color: "var(--cocoa-soft, #6B5A47)",
          margin: 0,
          lineHeight: 1.55,
          maxWidth: 280,
        }}
      >
        {body}
      </p>
    </section>
  );
}

function EmptyStats({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <div
      data-theme="v45-light"
      style={{
        padding: "60px 22px 40px",
        textAlign: "center",
        color: "var(--cocoa-soft, #6B5A47)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          background: "var(--v45-saffron-pale, #F6E8C5)",
          color: "var(--v45-saffron, #C58A2E)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="sparkles" size={28} strokeWidth={1.8} />
      </div>
      <h2
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 24,
          fontWeight: 700,
          margin: 0,
          color: "var(--cocoa, #2B1F15)",
        }}
      >
        {t("stats.emptyTitle") || "Pas encore de stats"}
      </h2>
      <p
        style={{
          fontSize: 13.5,
          margin: 0,
          lineHeight: 1.6,
          maxWidth: 300,
        }}
      >
        {t("stats.emptyBody") ||
          "Ajoute quelques dépenses dans tes groupes pour voir tes stats prendre vie."}
      </p>
    </div>
  );
}

// ============================================================
// Helpers data
// ============================================================

function formatPeriod(period: string, short = false): string {
  const parts = period.split("-");
  if (parts.length < 2) return period;
  const monthIdx = (parseInt(parts[1]!, 10) || 1) - 1;
  const months = short
    ? ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"]
    : ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const year = parts[0]!.slice(2);
  return short ? `${months[monthIdx]} '${year}` : `${months[monthIdx]} 20${year}`;
}

// ============================================================
// Skeleton de chargement
// ============================================================

function StatsSkeleton() {
  return (
    <div
      data-theme="v45-light"
      style={{
        padding: "20px 18px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 6,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 999,
              background: "rgba(43,31,21,0.08)",
            }}
          />
        ))}
      </div>
      <div
        style={{
          minHeight: 380,
          borderRadius: 22,
          background: "rgba(43,31,21,0.04)",
          animation: "bmd-st-skel 1.2s infinite ease-in-out",
        }}
      />
      <style jsx>{`
        @keyframes bmd-st-skel {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

// V175.F — Helper lazy render : on rend la story active + ses voisines
// immédiates. Les autres sont un placeholder léger pour ne pas mounter
// les sous-arbres lourds (TimelineCard / CategoriesCard / PeopleCard / InsightCard).
function isStoryActive(idx: number, current: number): boolean {
  return Math.abs(idx - current) <= 1;
}

function StoryPlaceholder() {
  return (
    <div
      aria-hidden
      style={{
        flex: 1,
        borderRadius: 22,
        background:
          "linear-gradient(160deg, var(--paper, #FFFFFF) 0%, var(--ivory, #FBF6EC) 100%)",
        border: "1px solid var(--v45-line, rgba(43,31,21,0.06))",
        minHeight: 380,
      }}
    />
  );
}
