/**
 * Loading skeleton pour /dashboard/profile.
 * Mime la structure : hero avatar + cards profil/contacts/sécurité/etc.
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
      {/* Hero avatar circle + nom */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 16 }}>
        <Skel w={88} h={88} radius={44} />
        <Skel w="50%" h={22} />
        <Skel w="35%" h={11} />
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skel key={i} w="100%" h={i % 2 === 0 ? 120 : 80} radius={14} />
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
