"use client";

/**
 * <MobileInviteFriendsSheet> · V58
 *
 * Sheet d'invitation BMD générique (pas liée à un groupe spécifique).
 *
 * Contenu :
 *  - Hero accueillant avec icône share
 *  - Lien d'invitation BMD (display + copy)
 *  - Bouton "Partager via…" → Web Share API native (WhatsApp/SMS/Mail/etc.)
 *  - Bouton "Copier le lien" → fallback clipboard avec toast
 *  - Texte d'invitation prêt à l'emploi (modifiable)
 *
 * Look V45-light : fond paper/ivory, accents saffron, texte cocoa.
 */

import { useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { useT } from "../i18n/app-strings";
import { Icon } from "./icons";
import { haptic } from "../platform";

const INVITE_URL = "https://backmesdo.com";

export function MobileInviteFriendsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState(() => t("dashboard.inviteShareText"));

  const fullMessage = `${text} ${INVITE_URL}`;

  async function handleShare() {
    haptic("tap");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "BMD — L'argent partagé, l'amitié protégée",
          text,
          url: INVITE_URL,
        });
        haptic("success");
        return;
      }
      // Fallback : copier
      await handleCopy();
    } catch {
      /* user dismissed share sheet */
    }
  }

  async function handleCopy() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(fullMessage);
        setCopied(true);
        haptic("success");
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* clipboard refused */
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("invite.title")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Hero saffron-pale */}
        <div
          style={{
            padding: "18px 16px",
            borderRadius: 16,
            background:
              "linear-gradient(135deg, #F6E8C5 0%, #FBF6EC 100%)",
            border: "1px solid rgba(197,138,46,0.25)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background:
                "linear-gradient(135deg, #E8A33D 0%, #C58A2E 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(197,138,46,0.30)",
            }}
          >
            <Icon
              name="share-2"
              size={22}
              color="#FFFFFF"
              strokeWidth={2}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 18,
                fontWeight: 700,
                color: "#2B1F15",
                lineHeight: 1.2,
              }}
            >
              {t("invite.heroTitle")}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "#6B5A47",
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {t("invite.heroSubtitle")}
            </div>
          </div>
        </div>

        {/* Message éditable */}
        <div>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#6B5A47",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {t("invite.messageLabel")}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: 12,
              background: "#FBF6EC",
              border: "1px solid rgba(43,31,21,0.12)",
              borderRadius: 12,
              color: "#2B1F15",
              fontFamily: "inherit",
              fontSize: 14,
              lineHeight: 1.5,
              resize: "vertical",
              minHeight: 70,
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(197,138,46,0.55)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(43,31,21,0.12)";
            }}
          />
        </div>

        {/* Lien d'invitation */}
        <div>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#6B5A47",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {t("invite.linkLabel")}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: "#F4ECD8",
              border: "1px solid rgba(43,31,21,0.10)",
              borderRadius: 12,
            }}
          >
            <span
              style={{
                flex: 1,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 13,
                color: "#2B1F15",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {INVITE_URL}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={t("invite.copyLink")}
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: copied
                  ? "rgba(31,122,87,0.15)"
                  : "rgba(197,138,46,0.12)",
                border: copied
                  ? "1px solid rgba(31,122,87,0.35)"
                  : "1px solid rgba(197,138,46,0.30)",
                borderRadius: 8,
                color: copied ? "#1F7A57" : "#C58A2E",
                cursor: "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                transition: "all 0.15s ease",
              }}
            >
              {copied ? (
                <Icon name="check" size={14} strokeWidth={2.5} color="currentColor" />
              ) : (
                <Icon name="folder" size={14} strokeWidth={1.8} color="currentColor" />
              )}
            </button>
          </div>
          {copied && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "#1F7A57",
                fontWeight: 600,
              }}
            >
              ✓ {t("invite.copied")}
            </div>
          )}
        </div>

        {/* CTA Partager (Web Share API natif) */}
        <button
          type="button"
          onClick={handleShare}
          style={{
            background: "linear-gradient(135deg, #E8A33D 0%, #C58A2E 100%)",
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: 14,
            minHeight: 52,
            border: "none",
            borderRadius: 14,
            width: "100%",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            boxShadow: "0 6px 16px rgba(197,138,46,0.35)",
          }}
        >
          <Icon name="share-2" size={16} color="currentColor" strokeWidth={2} />
          {t("invite.shareCta")}
        </button>

        <p
          style={{
            margin: 0,
            fontSize: 11.5,
            color: "#6B5A47",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {t("invite.disclaimer")}
        </p>
      </div>
    </BottomSheet>
  );
}
