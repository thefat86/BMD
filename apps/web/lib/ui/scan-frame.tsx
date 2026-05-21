"use client";

/**
 * V52.B10 — ScanFrame · overlay scan signature V45.
 *
 * Composant visuel pour le modal de scan facture (cf. AUDIT-V45-VS-PROD.md
 * écran 18 « Scan premium V42 »). Encadre l'image preview avec :
 *  - 4 coins SVG saffron 1.5px stroke (style frame caméra premium type
 *    QR scanner Apple Pay / Google Lens / Capture iOS native)
 *  - Un laser horizontal saffron qui balaie verticalement en loop pendant
 *    le scan (animation `bmd-scan-laser` 2s ease-in-out infinite)
 *
 * Composant autonome qui se place en `position: absolute` au-dessus
 * d'un parent `position: relative` contenant l'image. L'appelant gère
 * la prop `scanning` pour activer/désactiver le laser (pendant l'OCR
 * actif on l'affiche, sinon on le cache).
 *
 * Usage :
 *   <div style={{ position: "relative" }}>
 *     <img src={previewUrl} alt="reçu" />
 *     <ScanFrame scanning={isScanning} />
 *   </div>
 *
 * Spec V45 lignes 4720-4723 de BMD-V45-mockups-clair.html.
 */
import type { CSSProperties } from "react";

export interface ScanFrameProps {
  /** Active l'animation laser. Mettre false dès que l'OCR est terminé. */
  scanning?: boolean;
  /** Couleur des coins et du laser. Défaut : saffron V45. */
  color?: string;
  /** Taille des coins SVG en px. Défaut : 28. */
  cornerSize?: number;
  /** Épaisseur du stroke des coins. Défaut : 2.5 (un peu plus que les icônes V45 normales pour visibilité photo). */
  strokeWidth?: number;
  /** Style inline additionnel sur le wrapper absolute. */
  style?: CSSProperties;
  /** Classe CSS additionnelle. */
  className?: string;
}

/**
 * 4 corners V45 — chaque corner est un SVG 28×28 avec une équerre
 * (L horizontale + L verticale) qui forme l'angle.
 *
 * Position : absolute aux 4 coins du parent. Les coins top-left et
 * bottom-right utilisent la même path (équerre orientée NE↗) avec
 * rotations CSS pour les autres angles.
 *
 * Format de l'équerre (parcours du path) :
 *   M 0 8       (point de départ en haut à gauche, légèrement en bas)
 *   L 0 0       (monte au coin)
 *   L 8 0       (descend horizontalement vers la droite)
 * → forme un L inversé qui dessine le coin top-left.
 */
function Corner({
  position,
  size,
  color,
  strokeWidth,
}: {
  position: "tl" | "tr" | "bl" | "br";
  size: number;
  color: string;
  strokeWidth: number;
}) {
  // Inset depuis le bord du parent (négatif pour déborder légèrement)
  const inset = -strokeWidth / 2;
  // Rotation selon l'angle
  const rotation = {
    tl: 0,
    tr: 90,
    br: 180,
    bl: 270,
  }[position];
  // Position dans le parent
  const positionStyle: CSSProperties = {
    position: "absolute",
    top: position === "tl" || position === "tr" ? inset : "auto",
    bottom: position === "bl" || position === "br" ? inset : "auto",
    left: position === "tl" || position === "bl" ? inset : "auto",
    right: position === "tr" || position === "br" ? inset : "auto",
    transform: `rotate(${rotation}deg)`,
    transformOrigin: "center",
    pointerEvents: "none",
  };
  const inner = Math.round(size * 0.32);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      style={positionStyle}
      aria-hidden
    >
      {/* Équerre orientée top-left (avant rotation) */}
      <path
        d={`M ${inner} 1 L 1 1 L 1 ${inner}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ScanFrame({
  scanning = true,
  color = "var(--v45-saffron, #C58A2E)",
  cornerSize = 28,
  strokeWidth = 2.5,
  style,
  className,
}: ScanFrameProps) {
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        borderRadius: "inherit",
        ...style,
      }}
      aria-hidden
    >
      {/* 4 coins SVG saffron */}
      <Corner position="tl" size={cornerSize} color={color} strokeWidth={strokeWidth} />
      <Corner position="tr" size={cornerSize} color={color} strokeWidth={strokeWidth} />
      <Corner position="bl" size={cornerSize} color={color} strokeWidth={strokeWidth} />
      <Corner position="br" size={cornerSize} color={color} strokeWidth={strokeWidth} />

      {/* Laser horizontal — balayage vertical loop pendant scan actif.
          Le gradient donne un fade-in/out aux extrémités pour un look
          plus organique qu'une simple ligne plate. */}
      {scanning && (
        <div
          className="bmd-scan-frame-laser"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, transparent 0%, ${color} 20%, ${color} 80%, transparent 100%)`,
            boxShadow: `0 0 12px ${color}, 0 0 24px ${color}66`,
            opacity: 0.85,
          }}
        />
      )}

      <style jsx>{`
        .bmd-scan-frame-laser {
          animation: bmd-scan-laser 2s ease-in-out infinite;
        }
        @keyframes bmd-scan-laser {
          0%,
          100% {
            top: 0;
            opacity: 0;
          }
          10% {
            opacity: 0.85;
          }
          50% {
            top: calc(100% - 2px);
            opacity: 0.95;
          }
          90% {
            opacity: 0.85;
          }
        }
        /* Respecte la préférence "reduced motion" : pas d'animation. */
        @media (prefers-reduced-motion: reduce) {
          .bmd-scan-frame-laser {
            animation: none;
            opacity: 0.4;
            top: 50%;
          }
        }
      `}</style>
    </div>
  );
}
