/**
 * Loading skeleton pour /dashboard/groups/[id]/tontine
 * --------------------------------------------------------------
 * Affiché instantanément pendant la navigation Next.js streaming.
 * Évite le flash blanc et donne une perception de vitesse immédiate.
 */
export default function Loading() {
  return (
    <div
      // V129 — Theme V45-light cohérent avec le reste de l'app (avant : dark
      // gradient night→indigo, ce qui produisait un flash noir au chargement
      // alors que la page rendue ensuite est en light → expérience cassée).
      style={{
        padding: "12px 16px 24px",
        maxWidth: "100%",
        margin: "0 auto",
        minHeight: "100dvh",
        background: "var(--ivory, #FBF6EC)",
      }}
    >
      {/* Kicker (nom du groupe) */}
      <div
        style={{
          height: 12,
          width: 140,
          marginTop: 8,
          marginBottom: 16,
          borderRadius: 4,
          background: "rgba(43,31,21,0.06)",
        }}
      />
      {/* Hero tontine card */}
      <div
        style={{
          height: 180,
          marginBottom: 14,
          borderRadius: 18,
          background: "var(--paper, #FFFFFF)",
          border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
          opacity: 0.85,
          animation: "bmd-skel 1.2s ease-in-out infinite",
        }}
      />
      {/* 3 lignes contributions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 64,
              background: "var(--paper, #FFFFFF)",
              border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
              borderRadius: 14,
              opacity: 0.85,
              animation: `bmd-skel 1.2s ease-in-out ${i * 0.08}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes bmd-skel {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
