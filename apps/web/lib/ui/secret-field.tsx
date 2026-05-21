"use client";

/**
 * <SecretField> · Affichage protégé d'une valeur sensible (spec §7.5).
 *
 * Anti-shoulder surfing : la valeur est masquée par défaut (••••••••).
 * Pour la révéler, l'utilisateur doit :
 *  - Press long (touch ou mouse) sur le champ
 *  - OU cliquer sur l'icône 👁️ (révèle 5 secondes puis re-masque automatiquement)
 *
 * Cas d'usage :
 *  - Secret 2FA TOTP (32 chars base32) au moment du setup
 *  - Codes OTP saisis dans le formulaire
 *  - Tokens d'API affichés à l'utilisateur
 *  - Numéros de carte / IBAN / RIB
 */

import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/app-strings";

interface Props {
  value: string;
  /** Délai d'affichage automatique avant re-masquage (défaut 5 sec) */
  revealTimeoutMs?: number;
  /** Style "code" monospace (défaut true). False = texte normal. */
  monospace?: boolean;
  /** Taille du caractère masque (défaut "•") */
  maskChar?: string;
  /** Affiche un bouton copier-dans-le-presse-papier */
  copyable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Appel après une révélation (pour stats / audit) */
  onReveal?: () => void;
}

export function SecretField({
  value,
  revealTimeoutMs = 5000,
  monospace = true,
  maskChar = "•",
  copyable = false,
  className,
  style,
  onReveal,
}: Props) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  function reveal(temporary: boolean = true) {
    setRevealed(true);
    onReveal?.();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (temporary) {
      timerRef.current = setTimeout(() => {
        setRevealed(false);
      }, revealTimeoutMs);
    }
  }

  function hide() {
    setRevealed(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  // Press long (300ms) — ouvre le révélateur tant qu'on appuie
  function startLongPress(e: React.PointerEvent) {
    e.preventDefault();
    longPressTimerRef.current = setTimeout(() => {
      reveal(false); // sans timeout : on garde révélé tant qu'on tient
    }, 300);
  }

  function endLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // Si on a révélé via long press, on re-cache au relâchement
    if (revealed) hide();
  }

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard refus → on ignore silencieusement */
    }
  }

  const masked = maskChar.repeat(value.length);

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...style,
      }}
    >
      <span
        role="textbox"
        aria-label={
          revealed ? t("common.hide") : t("common.show")
        }
        onPointerDown={startLongPress}
        onPointerUp={endLongPress}
        onPointerLeave={endLongPress}
        title={
          revealed
            ? "Tient bon — re-masquage automatique dans 5s"
            : "Press long pour révéler temporairement"
        }
        style={{
          fontFamily: monospace
            ? "ui-monospace, 'SF Mono', Menlo, monospace"
            : undefined,
          fontSize: 16,
          letterSpacing: revealed ? 1 : 4,
          padding: "6px 10px",
          background: "rgba(232,163,61,0.06)",
          border: "1px solid rgba(232,163,61,0.3)",
          borderRadius: 8,
          userSelect: revealed ? "all" : "none",
          cursor: revealed ? "text" : "pointer",
          transition: "letter-spacing 0.15s",
          // Léger blur quand masqué pour un effet "vraiment caché"
          filter: revealed ? "none" : "blur(0)",
          minWidth: 60,
          textAlign: "center",
        }}
      >
        {revealed ? value : masked}
      </span>

      <button
        type="button"
        onClick={() => (revealed ? hide() : reveal(true))}
        aria-label={revealed ? t("common.hide") : t("common.show")}
        title={revealed ? t("common.hide") : t("common.show")}
        style={{
          padding: "4px 8px",
          background: "transparent",
          border: "1px solid var(--line-soft)",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        {revealed ? "🙈" : "👁️"}
      </button>

      {copyable && (
        <button
          type="button"
          onClick={copy}
          aria-label="Copier"
          title="Copier dans le presse-papier"
          style={{
            padding: "4px 8px",
            background: "transparent",
            border: "1px solid var(--line-soft)",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {copied ? "✓" : "📋"}
        </button>
      )}
    </div>
  );
}
