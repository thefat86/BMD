/**
 * Loading skeleton pour /dashboard/groups/[id].
 *
 * Next App Router affiche ce composant pendant que la page se charge
 * (Suspense boundary auto). Donne un feedback INSTANT à l'utilisateur
 * sans attendre que le data fetch initial finisse.
 *
 * Pas de "use client" → ce composant est rendu côté serveur dès la
 * navigation, donc visible avant même que JS soit hydraté.
 */
export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, #1E1830 0%, #0E0B14 100%)",
        padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Header skeleton */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <Skel w={40} h={40} radius={10} />
        <div style={{ flex: 1 }}>
          <Skel w="60%" h={18} />
          <div style={{ height: 4 }} />
          <Skel w="40%" h={12} />
        </div>
        <Skel w={40} h={40} radius={10} />
      </div>

      {/* Hero balance skeleton */}
      <Skel w="100%" h={140} radius={22} />

      {/* Section nav chips skeleton */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skel key={i} w={88} h={32} radius={999} />
        ))}
      </div>

      {/* Cards skeleton */}
      <Skel w="100%" h={180} radius={14} />
      <Skel w="100%" h={120} radius={14} />
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
