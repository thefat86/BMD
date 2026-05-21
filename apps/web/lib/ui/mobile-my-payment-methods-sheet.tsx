"use client";

/**
 * <MobileMyPaymentMethodsSheet> · V136.A — Édition inline des moyens de paiement
 * depuis la vue tontine.
 *
 * Quand un membre regarde son propre tour (bénéficiaire = lui), il peut taper
 * "Modifier mes coordonnées" pour ouvrir ce sheet et ajouter / modifier /
 * supprimer ses moyens de paiement, sans avoir à quitter la vue tontine et
 * naviguer vers son profil. Friction minimale.
 *
 * Architecture :
 *  - Sheet plein écran V45-light (BottomSheet avec hauteur ~90vh)
 *  - Wrappe le <PaymentMethodsBlock> existant qui contient déjà le CRUD complet
 *  - Ferme via la croix du sheet, le rafraîchissement parent est best-effort
 *
 * Note : si le serveur n'a pas configuré PAYMENT_VAULT_KEY, le composant
 * affiche un message clair (déjà géré dans PaymentMethodsBlock).
 */

import { BottomSheet } from "./bottom-sheet";
import { PaymentMethodsBlock } from "./payment-methods-block";
import { useT } from "../i18n/app-strings";

export function MobileMyPaymentMethodsSheet(props: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <BottomSheet
      open={props.open}
      onClose={props.onClose}
      title={
        t("tontine.myMethodsTitle") || "Mes moyens de paiement"
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "var(--cocoa-soft, #6B5B47)",
            lineHeight: 1.5,
            background: "rgba(197,138,46,0.08)",
            border: "1px solid rgba(197,138,46,0.20)",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          {t("tontine.myMethodsHint") ||
            "Renseigne ici les coordonnées par lesquelles tu veux être payé lors de ton tour de tontine : RIB, PayPal, Wero, Wave, etc. Les autres membres du groupe pourront les voir pour t'envoyer ta part le moment venu."}
        </div>
        <PaymentMethodsBlock />
      </div>
    </BottomSheet>
  );
}
