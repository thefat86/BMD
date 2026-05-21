"use client";

/**
 * <RealtimeIndicator> · Petit dot + label discret indiquant l'état SSE.
 *
 * Affiché dans les coins de pages avec sync temps réel pour rassurer
 * l'utilisateur que ses données sont fraîches. Vert pulsant quand
 * connecté, gris en attente, orange si déconnecté.
 *
 * Pattern banque mobile : un statut quasi-invisible qui rassure sans
 * polluer l'écran. Tap pour voir le détail (count d'events, dernière
 * connexion).
 */

interface Props {
  connected: boolean;
  lastEventAt?: Date | null;
  /** Position : "inline" (flux normal) ou "floating" (badge fixe coin) */
  position?: "inline" | "floating";
}

export function RealtimeIndicator({
  connected,
  lastEventAt,
  position = "inline",
}: Props): JSX.Element {
  const recently =
    lastEventAt && Date.now() - lastEventAt.getTime() < 5_000;

  const baseStyle: React.CSSProperties =
    position === "floating"
      ? {
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 14px)",
          right: 16,
          zIndex: 30,
        }
      : {};

  return (
    <div
      style={{
        ...baseStyle,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        background: connected
          ? "rgba(125,197,158,0.10)"
          : "rgba(244,228,193,0.05)",
        border: `1px solid ${connected ? "rgba(125,197,158,0.30)" : "rgba(244,228,193,0.10)"}`,
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        color: connected ? "#7DC59E" : "var(--muted, #8a7b6b)",
        letterSpacing: 0.6,
        textTransform: "uppercase",
      }}
      title={
        connected
          ? lastEventAt
            ? `Live · dernier event ${formatRelative(lastEventAt)}`
            : "Live · en attente d'events"
          : "Hors ligne — données mises à jour à la prochaine action"
      }
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: connected ? "#7DC59E" : "var(--muted)",
          animation: recently ? "bmd-pulse-dot 1s ease-out" : undefined,
        }}
      />
      {connected ? "Live" : "Off"}
      <style jsx>{`
        @keyframes bmd-pulse-dot {
          0% {
            box-shadow: 0 0 0 0 rgba(125, 197, 158, 0.5);
          }
          100% {
            box-shadow: 0 0 0 8px rgba(125, 197, 158, 0);
          }
        }
      `}</style>
    </div>
  );
}

function formatRelative(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 5) return "à l'instant";
  if (sec < 60) return `il y a ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return `il y a ${h} h`;
}
