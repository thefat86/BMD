/**
 * Loading skeleton pour /admin/cms/[id] (éditeur CMS).
 * Mime la structure split-screen : list de blocs gauche + preview droite.
 */
export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, #1E1830 0%, #0E0B14 100%)",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <Skel w="50%" h={28} />
      <div style={{ display: "flex", gap: 16, flex: 1 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skel key={i} w="100%" h={80} radius={12} />
          ))}
        </div>
        <Skel w="40%" h={500} radius={14} />
      </div>
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
