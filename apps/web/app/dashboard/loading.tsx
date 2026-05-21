/**
 * Loading skeleton pour /dashboard.
 *
 * S'affiche INSTANTANÉMENT à la navigation depuis n'importe quelle route
 * vers le dashboard. Squelette qui mime la structure réelle (hero balance
 * + grid groupes) pour que la perception de chargement soit minimale.
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
        gap: 16,
      }}
    >
      {/* Greeting */}
      <div>
        <Skel w="30%" h={11} />
        <div style={{ height: 6 }} />
        <Skel w="55%" h={28} />
      </div>

      {/* Hero balance card */}
      <Skel w="100%" h={180} radius={22} />

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skel key={i} w={86} h={86} radius={14} />
        ))}
      </div>

      {/* Groups list */}
      <Skel w="40%" h={11} />
      {[0, 1, 2].map((i) => (
        <Skel key={i} w="100%" h={72} radius={14} />
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
