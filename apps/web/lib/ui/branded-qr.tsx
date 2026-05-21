"use client";

/**
 * <BrandedQR> · V117 — QR code marqué BMD au centre.
 *
 * **But.** Donner une identité visuelle reconnaissable à TOUS les flashcodes
 * générés par l'app (invitation groupe, login par QR, partage, …). Le user
 * scanne un QR et voit "BMD" au centre → reconnaissance immédiate de la
 * source, comme Bitly affiche son logo, ou Spotify avec ses codes. C'est
 * de la branding gratuite + un signal de confiance ("ce QR vient bien de
 * l'app, pas d'un phishing").
 *
 * **Scannabilité.** On force `ecc=H` (High error-correction) côté
 * `api.qrserver.com`, qui permet de masquer jusqu'à ~30 % de la surface du
 * QR sans casser la lecture. Notre encart central fait ~22 % de surface
 * (badge 22×22 % du QR, rond, fond paper) — bien dans la marge sûre.
 *
 * **Restriction.** On n'utilise PAS ce composant pour les QR TOTP
 * (`two-factor-block.tsx`) parce que certaines apps d'authentification
 * tierces (Google Authenticator, Authy…) ne tolèrent pas un overlay
 * personnalisé même avec ecc=H. On garde ces QR neutres et standards.
 *
 * **Props.** Le composant est volontairement minimal — `value`
 * (string à encoder) et `size` (px). Le reste est figé visuellement pour
 * que TOUS les BMD QR aient strictement la même identité.
 */

interface BrandedQRProps {
  /** La chaîne à encoder dans le QR (URL, token, payload). */
  value: string;
  /** Côté du QR en pixels (carré). Doit rester ≥ 180 pour que le badge
   *  central reste lisible sans empêcher la lecture du QR. Défaut 220. */
  size?: number;
  /** Encart central : couleur du fond. Défaut paper (ivory pur). */
  centerBg?: string;
  /** Encart central : couleur du texte « BMD ». Défaut cocoa profond. */
  centerColor?: string;
  /** Anneau du badge : couleur de la bordure. Défaut v45-saffron. */
  ringColor?: string;
  /** Texte alternatif pour l'accessibilité. */
  alt?: string;
  /** Background du QR lui-même (modules clairs). Défaut ivory clair pour
   *  rester cohérent avec le design V45. */
  qrBg?: string;
  /** Couleur des modules du QR (modules sombres). Défaut cocoa profond. */
  qrColor?: string;
}

/**
 * Composant unique source de tous les QR marqués de l'app.
 */
export function BrandedQR({
  value,
  size = 220,
  centerBg = "#FBF6EC",
  centerColor = "#2B1F15",
  ringColor = "#C58A2E",
  alt = "QR code BMD",
  qrBg = "F4E4C1",
  qrColor = "2A2244",
}: BrandedQRProps) {
  // `ecc=H` : High error-correction → on peut masquer ~30 % de la surface
  // sans casser le scan. `qzone=1` : 1 module de marge blanche (quiet
  // zone) tout autour, recommandé pour les readers natifs.
  const src =
    `https://api.qrserver.com/v1/create-qr-code/` +
    `?size=${size}x${size}` +
    `&ecc=H` +
    `&qzone=1` +
    `&color=${qrColor.replace(/^#/, "")}` +
    `&bgcolor=${qrBg.replace(/^#/, "")}` +
    `&data=${encodeURIComponent(value)}`;

  // Le badge central fait ~22 % du QR — bien dans la marge sûre de
  // l'error-correction H (30 %). On garde un padding interne pour que le
  // texte « BMD » respire dans le badge.
  const badgeSize = Math.round(size * 0.22);
  const badgeBorder = Math.max(2, Math.round(size * 0.015));
  const fontSize = Math.round(badgeSize * 0.36);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* QR brut — sert d'image de fond. Les paramètres ecc=H + qzone=1
          assurent la lecture même avec le badge central par-dessus. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        style={{
          display: "block",
          borderRadius: 12,
          background: `#${qrBg.replace(/^#/, "")}`,
        }}
      />

      {/* Badge BMD centré. `aria-hidden` car le QR a déjà son `alt` ; le
          badge est purement décoratif côté a11y. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: badgeSize,
          height: badgeSize,
          borderRadius: "50%",
          background: centerBg,
          border: `${badgeBorder}px solid ${ringColor}`,
          boxShadow:
            `0 4px 14px rgba(43,31,21,0.18), ` +
            `inset 0 1px 0 rgba(255,255,255,0.50)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Cormorant Garamond, serif",
          fontWeight: 700,
          fontSize,
          letterSpacing: -0.2,
          color: centerColor,
          lineHeight: 1,
          // Le `pointer-events: none` évite de bloquer un éventuel handler
          // click/long-press posé sur le QR (ex: « copier le lien »).
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        BMD
      </div>
    </div>
  );
}
