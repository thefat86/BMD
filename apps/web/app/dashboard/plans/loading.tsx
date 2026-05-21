/**
 * Skeleton loader pour /dashboard/plans (comparateur de forfaits).
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
      <Skel w="80%" h={11} />
      <div style={{ height: 8 }} />

      {/* 5 cartes plans empilées (mobile) ou en grille (desktop responsive) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <Skel key={i} w="100%" h={320} radius={18} />
        ))}
      </div>
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
