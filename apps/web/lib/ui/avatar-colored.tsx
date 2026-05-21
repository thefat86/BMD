/**
 * V52.A3 — Avatar coloré déterministe pour V45.
 *
 * Chaque user reçoit une couleur identitaire stable (saffron / indigo /
 * emerald / rose) basée sur un hash de son userId. Donc Linda aura
 * toujours la même couleur, peu importe l'écran ou la session.
 *
 * Palette V45 stricte (cf. AUDIT-V45-VS-PROD.md écran 12 « Balance par
 * personne » qui demande explicitement ces 4 couleurs).
 *
 * Usage :
 *   <AvatarColored userId={member.id} initials={member.displayName}
 *                  size={32} />
 *
 *   <AvatarColored userId={meId} initials="F" size={40}
 *                  meTag />  // tag "TOI" en top-right
 *
 *   <AvatarColored userId="ALL" variant="users" size={36} />
 *   // chip "tout le groupe" : SVG users sur fond saffron solide
 *
 * Migration depuis l'existant : la plupart des composants prod utilisent
 * un gradient saffron→terracotta pour TOUS les avatars (pas d'identité
 * par membre). Migrer vers AvatarColored donne à chaque membre une
 * couleur stable — pattern banking V45.
 */
import type { CSSProperties } from "react";
import Image from "next/image";
import { Icon } from "./icons/icon";

/** 4 couleurs V45 pour avatars membres. */
export type AvatarPalette = "saffron" | "indigo" | "emerald" | "rose";

const PALETTE: Record<AvatarPalette, { bg: string; fg: string }> = {
  saffron: { bg: "var(--v45-saffron, #C58A2E)", fg: "#FFFFFF" },
  indigo: { bg: "var(--v45-indigo, #4458B5)", fg: "#FFFFFF" },
  emerald: { bg: "var(--v45-emerald, #4F8E6E)", fg: "#FFFFFF" },
  rose: { bg: "var(--v45-rose, #C2563D)", fg: "#FFFFFF" },
};

const PALETTE_ORDER: AvatarPalette[] = ["saffron", "indigo", "emerald", "rose"];

/**
 * Hash déterministe sur userId → index dans la palette (0..3).
 *
 * Algo : somme des codepoints + xor du length. Stable, distribué
 * raisonnablement uniformément sur la palette pour des userIds aléatoires.
 * Pas cryptographique — juste suffisant pour assigner une couleur stable.
 */
function hashToPaletteIndex(userId: string): number {
  if (!userId) return 0;
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) | 0; // |0 force int32
  }
  return Math.abs(h) % PALETTE_ORDER.length;
}

/**
 * Couleur déterministe pour un userId donné. Exposée pour usage côté
 * appelant (ex : colorer une barre de balance assortie à l'avatar).
 */
export function paletteForUser(userId: string): AvatarPalette {
  return PALETTE_ORDER[hashToPaletteIndex(userId)];
}

/**
 * Tokens couleurs V45 d'un user (bg + fg). Pratique pour styler des
 * éléments associés (chip, dot timeline, slider, etc.).
 */
export function colorsForUser(userId: string): { bg: string; fg: string } {
  return PALETTE[paletteForUser(userId)];
}

/**
 * Extrait 1 ou 2 lettres d'un nom pour les initials d'avatar.
 * "Fabrice Tsakou" → "F" si single, "FT" si dual.
 * "Linda" → "L".
 * Émojis et caractères non-latin sont préservés tels quels.
 */
function extractInitials(name: string | null | undefined, dual = false): string {
  if (!name) return "·";
  const trimmed = name.trim();
  if (!trimmed) return "·";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (dual && parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0][0].toUpperCase();
}

export interface AvatarColoredProps {
  /** Identifiant stable pour déterminer la couleur. */
  userId: string;
  /** Nom complet (les initiales seront extraites). */
  initials?: string | null;
  /** Pixels. Défaut : 36. */
  size?: number;
  /** Override de la palette si on veut forcer (rare). */
  paletteOverride?: AvatarPalette;
  /** Affiche un badge "TOI" en absolute top-right. */
  meTag?: boolean;
  /** Affiche un check vert en badge bottom-right (membre sélectionné). */
  selected?: boolean;
  /** Affiche une icône SVG centrée au lieu d'initiales (ex : "users" pour chip group). */
  variant?: "initials" | "users";
  /** Classe CSS optionnelle (pour positionnement parent). */
  className?: string;
  /** Style inline supplémentaire. */
  style?: CSSProperties;
  /** Affiche les 2 initiales (prénom + nom) au lieu d'une seule. */
  dualInitials?: boolean;
  /**
   * V77 — Photo de profil de l'utilisateur. Si fournie ET non-vide, on
   * affiche la photo en `background-cover` à la place des initiales.
   * Sinon (ou si le backend a masqué la photo car le user n'a pas le plan
   * `profilePhotoVisible`), fallback automatique sur les initiales colorées.
   *
   * Le contrôle d'accès est BACKEND : le serveur set `null` si le plan du
   * propriétaire ne permet pas la visibilité. Côté frontend on se contente
   * d'afficher proprement la valeur reçue.
   */
  photoUrl?: string | null;
  /**
   * V175.B — Force priority loading pour l'avatar header (above-the-fold).
   * Par défaut false. Si true, next/image utilise priority+eager.
   */
  priority?: boolean;
}

/**
 * Avatar coloré V45 — composant atomique réutilisable sur tous les
 * écrans qui affichent un membre (group cards, payer grid, timeline,
 * tontine seats, balance bars, debt flow, etc.).
 */
export function AvatarColored({
  userId,
  initials,
  size = 36,
  paletteOverride,
  meTag = false,
  selected = false,
  variant = "initials",
  className,
  style,
  dualInitials = false,
  photoUrl,
  priority = false,
}: AvatarColoredProps) {
  const palette = paletteOverride ?? paletteForUser(userId);
  const { bg, fg } = PALETTE[palette];
  const fontSize = Math.round(size * 0.42); // 36 → 15px, 50 → 21px
  const text = variant === "initials" ? extractInitials(initials, dualInitials) : null;
  // V77 — Si on a une photo, elle prend le dessus sur initiales/icône.
  // Le backend filtre photoUrl=null pour les users qui n'ont pas le plan
  // `profilePhotoVisible` → on retombe naturellement sur les initiales.
  const hasPhoto = typeof photoUrl === "string" && photoUrl.length > 0;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          overflow: "hidden",
          background: hasPhoto ? "var(--paper, #FFFFFF)" : bg,
          color: fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 600,
          fontSize,
          fontFamily: "inherit",
          letterSpacing: 0.2,
          userSelect: "none",
          // Légère ombre douce V45 (paper effect)
          boxShadow: "0 1px 3px rgba(43,31,21,0.10)",
          // V77 — Liseré subtil quand on a une photo, pour bien démarquer
          // le visage du fond clair de la card (effet « polaroid »).
          border: hasPhoto ? `1px solid rgba(43,31,21,0.10)` : "none",
        }}
      >
        {hasPhoto ? (
          // V175.B — next/image pour optimisation (resize + lazy). On supporte
          // les data URLs (base64) via `unoptimized` qui désactive le pipeline
          // Next pour ces sources qui ne peuvent pas être optimisées côté serveur.
          photoUrl!.startsWith("data:") ? (
            <Image
              src={photoUrl!}
              alt={initials ?? ""}
              width={size}
              height={size}
              sizes={`${size}px`}
              quality={80}
              priority={priority}
              unoptimized
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Image
              src={photoUrl!}
              alt={initials ?? ""}
              width={size}
              height={size}
              sizes={`${size}px`}
              quality={80}
              priority={priority}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )
        ) : variant === "users" ? (
          <Icon name="users" size={Math.round(size * 0.55)} color={fg} strokeWidth={1.8} />
        ) : (
          text
        )}
      </div>

      {/* Badge "TOI" en top-right (V45 spec écran 13 payer grid) */}
      {meTag && (
        <span
          aria-label="C'est toi"
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            background: "var(--paper, #FFFFFF)",
            color: "var(--v45-saffron, #C58A2E)",
            border: "1px solid var(--v45-saffron-soft, #E8C988)",
            borderRadius: 999,
            fontSize: Math.max(8, Math.round(size * 0.22)),
            fontWeight: 700,
            letterSpacing: 0.5,
            padding: "2px 6px",
            lineHeight: 1,
            textTransform: "uppercase",
            boxShadow: "0 2px 4px rgba(43,31,21,0.10)",
          }}
        >
          TOI
        </span>
      )}

      {/* Badge check vert en bottom-right (V45 spec écran 15 itemized "for-grid av.on") */}
      {selected && (
        <span
          aria-label="Sélectionné"
          style={{
            position: "absolute",
            bottom: -3,
            right: -3,
            width: Math.max(14, Math.round(size * 0.4)),
            height: Math.max(14, Math.round(size * 0.4)),
            borderRadius: "50%",
            background: "var(--paper, #FFFFFF)",
            color: "var(--v45-emerald, #4F8E6E)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(43,31,21,0.12)",
          }}
        >
          <Icon
            name="check"
            size={Math.max(10, Math.round(size * 0.28))}
            color="currentColor"
            strokeWidth={2.5}
          />
        </span>
      )}
    </div>
  );
}
