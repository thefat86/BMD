/**
 * Skeleton loader pour /dashboard/affiliate (espace commercial).
 * Server Component — zéro JS pendant l'attente.
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
      <Skel w="50%" h={22} />
      <Skel w="35%" h={11} />
      <div style={{ height: 8 }} />

      {/* Hero KPI commission */}
      <Skel w="100%" h={140} radius={18} />

      {/* Code AFF + bouton copy */}
      <div style={{ display: "flex", gap: 10 }}>
        <Skel w="60%" h={48} radius={12} />
        <Skel w="40%" h={48} radius={12} />
      </div>

      {/* Filleuls list */}
      <Skel w="40%" h={11} />
      {[0, 1, 2].map((i) => (
        <Skel key={i} w="100%" h={64} radius={14} />
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
