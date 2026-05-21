/**
 * Skeleton loader pour /dashboard/stats. S'affiche INSTANTANÉMENT à la
 * navigation, avant que la page client soit hydratée.
 *
 * Server Component pur (pas de "use client") → zéro JS, juste du HTML/CSS
 * inliné. Le shimmer est animé via @keyframes globaux dans globals.css.
 */
export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, #1E1830 0%, #0E0B14 100%)",
        padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Titre + sous-titre */}
      <Skel w="60%" h={22} />
      <Skel w="40%" h={11} />

      <div style={{ height: 8 }} />

      {/* KPI cards (4 colonnes responsive) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <Skel key={i} w="100%" h={76} radius={14} />
        ))}
      </div>

      {/* Hero charts */}
      <Skel w="100%" h={220} radius={18} />
      <Skel w="100%" h={180} radius={18} />

      {/* Mini-table */}
      <Skel w="60%" h={11} />
      {[0, 1, 2, 3].map((i) => (
        <Skel key={i} w="100%" h={42} radius={10} />
      ))}
    </div>
  );
}

function Skel({
  w,
  h,
  radius = 8,
}: {
  w: number | string;
  h: number;
  radius?: number;
}) {
  return (
    <div
      aria-hidden
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, rgba(244,228,193,0.04) 0%, rgba(244,228,193,0.10) 50%, rgba(244,228,193,0.04) 100%)",
        backgroundSize: "200% 100%",
        animation: "bmd-skel-shimmer 1.4s linear infinite",
      }}
    />
  );
}
