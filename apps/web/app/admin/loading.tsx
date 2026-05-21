/**
 * Loading skeleton pour /admin et toutes ses sous-routes (héritage Next).
 * Affiché instantanément pendant le chargement de la console admin.
 */
export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, #1E1830 0%, #0E0B14 100%)",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <Skel w="40%" h={28} />
      <div style={{ display: "flex", gap: 8 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skel key={i} w={100} h={42} radius={10} />
        ))}
      </div>
      <Skel w="100%" h={300} radius={14} />
      <Skel w="100%" h={200} radius={14} />
      <style>{`
        @keyframes bmd-skel-shimmer {
          0% { background-position: -300% 0; }
          100% { background-position: 300% 0; }
        }
      `}</style>
    </div>
  );
}
function Skel({ w, h, radius = 8 }: { w: number | string; h: number; radius?: number }) {
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
