/**
 * Loading skeleton pour /onboarding/intent.
 * Mime le hero "Pourquoi tu es là ?" + grille de 6 quick cards.
 */
export default function IntentLoading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(900px 600px at 10% -10%, rgba(232,163,61,0.08), transparent 60%), linear-gradient(180deg, #16111E 0%, #0E0B14 100%)",
        padding:
          "calc(env(safe-area-inset-top, 0px) + 32px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Hero question */}
      <div>
        <Skel w="60%" h={14} />
        <div style={{ height: 12 }} />
        <Skel w="90%" h={32} />
        <div style={{ height: 8 }} />
        <Skel w="75%" h={32} />
      </div>

      {/* Grid 2 cols × 3 rows */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginTop: 8,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Skel key={i} w="100%" h={110} radius={16} />
        ))}
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
