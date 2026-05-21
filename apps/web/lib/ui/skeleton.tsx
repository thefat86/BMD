"use client";

/**
 * Skeleton loaders — placeholders animés pendant le chargement des données.
 *
 * On évite le "flash" de "Chargement…" qui donne un sentiment d'app lente.
 * Le skeleton montre la STRUCTURE finale dès la 1ère frame, donc l'utilisateur
 * sait à quoi s'attendre et l'attente est ressentie comme plus courte.
 *
 * Anim : shimmer subtil de gauche à droite, en or pâle. Respect
 * `prefers-reduced-motion` (pas d'anim si l'utilisateur a désactivé
 * les animations système — accessibilité).
 */

import type { CSSProperties, ReactNode } from "react";

const BASE_STYLE: CSSProperties = {
  background:
    "linear-gradient(90deg, rgba(244,228,193,0.04) 0%, rgba(244,228,193,0.10) 50%, rgba(244,228,193,0.04) 100%)",
  backgroundSize: "200% 100%",
  animation: "bmd-skel-shimmer 1.4s linear infinite",
  borderRadius: 6,
};

/** Bloc rectangulaire générique. */
export function Skeleton({
  width = "100%",
  height = 14,
  rounded = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  rounded?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        ...BASE_STYLE,
        display: "block",
        width,
        height,
        borderRadius: rounded,
        ...style,
      }}
    />
  );
}

/** Avatar/cercle. */
export function SkeletonCircle({
  size = 40,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        ...BASE_STYLE,
        display: "block",
        width: size,
        height: size,
        borderRadius: "50%",
        ...style,
      }}
    />
  );
}

/** Hero card du dashboard (solde XL + KPIs). */
export function SkeletonHeroCard() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading balance"
      style={{
        background: "rgba(244,228,193,0.04)",
        border: "1px solid rgba(244,228,193,0.08)",
        borderRadius: 18,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <Skeleton width={80} height={11} />
      <Skeleton width={180} height={36} rounded={8} />
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <Skeleton width="50%" height={22} />
        <Skeleton width="50%" height={22} />
      </div>
    </div>
  );
}

/** Liste de groupes (mobile dashboard). */
export function SkeletonGroupList({ count = 3 }: { count?: number }) {
  return (
    <ul
      aria-busy="true"
      aria-label="Loading groups"
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 14,
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.08)",
            borderRadius: 14,
          }}
        >
          <SkeletonCircle size={42} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={11} />
          </div>
          <Skeleton width={70} height={28} rounded={8} />
        </li>
      ))}
    </ul>
  );
}

/** Liste de dépenses. */
export function SkeletonExpenseList({ count = 4 }: { count?: number }) {
  return (
    <ul
      aria-busy="true"
      aria-label="Loading expenses"
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 12,
            background: "rgba(244,228,193,0.03)",
            borderRadius: 10,
            gap: 8,
          }}
        >
          <div
            style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}
          >
            <Skeleton width="55%" height={12} />
            <Skeleton width="35%" height={10} />
          </div>
          <Skeleton width={60} height={16} rounded={6} />
        </li>
      ))}
    </ul>
  );
}

/** Wrapper avec keyframes (à inclure une seule fois dans le layout). */
export function SkeletonStyles(): ReactNode {
  return (
    <style>{`
      @keyframes bmd-skel-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes bmd-skel-shimmer { from { } to { } }
      }
    `}</style>
  );
}
