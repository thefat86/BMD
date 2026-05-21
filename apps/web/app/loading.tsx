/**
 * Loading state racine — affiché par Next App Router pour toute route
 * qui n'a pas son propre loading.tsx. Évite l'écran blanc pendant le
 * chargement initial.
 */
export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, #1E1830 0%, #0E0B14 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      {/* Logo BMD pulsant */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background:
            "linear-gradient(135deg, rgba(232,163,61,0.20), rgba(181,70,46,0.10))",
          border: "1.5px solid rgba(232,163,61,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "bmd-pulse 1.8s ease-in-out infinite",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bmd-logo.svg" alt="BMD" width={44} height={44} />
      </div>
      <div
        style={{
          fontSize: 11,
          color: "rgba(244,228,193,0.5)",
          letterSpacing: 3,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        Chargement…
      </div>
      <style>{`
        @keyframes bmd-pulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.06); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
