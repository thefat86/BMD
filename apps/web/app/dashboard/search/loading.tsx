/**
 * Loading skeleton pour /dashboard/search.
 * Mime la barre de recherche + filtres + liste de résultats.
 */
export default function SearchLoading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, #1E1830 0%, #0E0B14 100%)",
        padding:
          "calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 80px)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Header titre */}
      <Skel w="40%" h={28} />

      {/* Search input */}
      <Skel w="100%" h={52} radius={14} />

      {/* Filtres chips */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        {[60, 80, 70, 90, 65].map((w, i) => (
          <Skel key={i} w={w} h={32} radius={999} />
        ))}
      </div>

      {/* Sections résultats */}
      <Skel w="30%" h={11} />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skel key={`r1-${i}`} w="100%" h={64} radius={12} />
      ))}

      <Skel w="35%" h={11} />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skel key={`r2-${i}`} w="100%" h={64} radius={12} />
      ))}

      <style>{`
        @keyframes bmd-skel-shimmer {
          0% { background-position: -300% 0; }
          100% { background-position: 300% 0; }
        }
      `}</style>
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
          "linear-gradient(90deg, rgba(244,228,193,0.04), rgba(244,228,193,0.10), rgba(244,228,193,0.04))",
        backgroundSize: "300% 100%",
        animation: "bmd-skel-shimmer 1.6s linear infinite",
      }}
    />
  );
}
