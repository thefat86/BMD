/**
 * Loading skeleton pour /dashboard/groups
 * --------------------------------------------------------------
 * Affiché instantanément par Next.js pendant le navigation streaming.
 * Pas de flash blanc — l'utilisateur voit immédiatement la structure
 * de la page avec des placeholders animés.
 *
 * Pattern banking app : search bar grise + 3 cards horizontales en
 * shimmer doux.
 */
export default function Loading() {
  return (
    <div
      style={{
        padding: "12px 16px 24px",
        maxWidth: "100%",
        margin: "0 auto",
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, var(--night) 0%, var(--indigo) 100%)",
        color: "var(--cream)",
      }}
    >
      <div
        style={{
          height: 48,
          marginTop: 8,
          marginBottom: 14,
          borderRadius: 14,
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.06)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 76,
              background: "rgba(244,228,193,0.04)",
              border: "1px solid rgba(244,228,193,0.06)",
              borderRadius: 16,
              animation: `bmd-grp-skel 1.2s ease-in-out ${i * 0.08}s infinite`,
              opacity: 0.7,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes bmd-grp-skel {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
