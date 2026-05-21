/**
 * Loading skeleton pour /login.
 *
 * Affiché instantanément à la navigation (par exemple après logout, ou
 * deep link). Mime la structure réelle : logo BMD au centre, formulaire
 * email/phone + 4 boutons SSO + lang picker en bas.
 */
export default function LoginLoading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(900px 600px at 10% -10%, rgba(232,163,61,0.08), transparent 60%), linear-gradient(180deg, #16111E 0%, #0E0B14 100%)",
        padding:
          "calc(env(safe-area-inset-top, 0px) + 24px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      {/* Logo BMD */}
      <div
        aria-hidden
        style={{
          width: 88,
          height: 88,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, #E8A33D 0%, #B5462E 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Cormorant Garamond, Georgia, serif",
          fontSize: 50,
          fontWeight: 600,
          color: "#0E0B14",
          boxShadow: "0 8px 32px rgba(232, 163, 61, 0.3)",
          animation: "bmd-pulse-soft 2.4s ease-in-out infinite",
        }}
      >
        B
      </div>

      {/* Tagline */}
      <Skel w={220} h={14} />
      <div style={{ height: 8 }} />

      {/* Inputs */}
      <Skel w="100%" h={56} radius={16} />
      <Skel w="100%" h={56} radius={16} />

      {/* Bouton principal */}
      <div style={{ height: 4 }} />
      <Skel w="100%" h={52} radius={999} />

      {/* Séparateur */}
      <Skel w={140} h={10} />

      {/* SSO buttons (2 lignes) */}
      <div style={{ display: "flex", gap: 12, width: "100%" }}>
        <Skel w="50%" h={48} radius={12} />
        <Skel w="50%" h={48} radius={12} />
      </div>

      {/* Lang picker */}
      <div style={{ marginTop: "auto" }}>
        <Skel w={130} h={32} radius={999} />
      </div>

      <style>{`
        @keyframes bmd-skel-shimmer {
          0% { background-position: -300% 0; }
          100% { background-position: 300% 0; }
        }
        @keyframes bmd-pulse-soft {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="bmd-pulse-soft"], [style*="bmd-skel-shimmer"] {
            animation: none !important;
          }
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
        maxWidth: 380,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, rgba(244,228,193,0.04), rgba(244,228,193,0.10), rgba(244,228,193,0.04))",
        backgroundSize: "300% 100%",
        animation: "bmd-skel-shimmer 1.6s linear infinite",
      }}
    />
  );
}
