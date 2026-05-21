"use client";

/**
 * <PrintActionBar> · V108 — Barre d'actions sticky pour pages imprimables.
 *
 * Avant V108, les pages /dashboard/groups/[id]/print et tax-receipt :
 *   - auto-déclenchaient `window.print()` 600-800ms après chargement
 *     → l'utilisateur n'avait pas le temps de lire le document
 *   - avaient juste un bouton « Imprimer » et un lien `← Retour` discret
 *     → sur petit écran ça « cassait l'affichage » (Fabrice)
 *   - aucun bouton explicite « Enregistrer en PDF »
 *
 * Cette barre fixe en haut résout les 4 points :
 *   1. <BackButton> qui appelle router.back() (ou fallback href du groupe)
 *   2. <PrintButton> primaire saffron qui déclenche window.print()
 *   3. <SavePdfButton> secondaire — explique que l'utilisateur peut
 *      choisir « Enregistrer en PDF » dans la dialog d'impression
 *   4. Mention discrète du nom du document affiché
 *
 * Cohérence V45-light : backdrop ivory translucide + bordure cocoa pâle,
 * boutons saffron, texte cocoa. La barre est masquée à l'impression via
 * la classe `print-action-bar` ciblée par `@media print` côté page.
 */

import { useRouter } from "next/navigation";
import { Icon } from "./icons";

interface Props {
  /** Titre court affiché au centre (ex: "Récap du groupe", "Reçu fiscal 2025"). */
  title: string;
  /** Fallback href si router.back() n'a pas d'historique (ex: ouverture en tab nouveau). */
  backHref: string;
  /** Sous-titre optionnel sous le titre (ex: nom du groupe). */
  subtitle?: string;
}

export function PrintActionBar({ title, backHref, subtitle }: Props) {
  const router = useRouter();

  function goBack() {
    // Si on a un historique, on revient en arrière. Sinon on tape le fallback
    // (utile quand le user a ouvert la page imprimable dans un nouvel onglet).
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(backHref);
    }
  }

  function doPrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <div
      className="print-action-bar"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(251, 246, 236, 0.92)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(43,31,21,0.08)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      {/* Bouton retour */}
      <button
        type="button"
        onClick={goBack}
        aria-label="Retour"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "9px 14px",
          background: "var(--paper, #FFFFFF)",
          border: "1px solid rgba(43,31,21,0.12)",
          borderRadius: 10,
          color: "var(--cocoa, #2B1F15)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          minHeight: 38,
          touchAction: "manipulation",
        }}
      >
        <Icon name="chevron-left" size={16} strokeWidth={2} />
        Retour
      </button>

      {/* Titre + sous-titre au centre */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 18,
            fontWeight: 600,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--cocoa-soft, #6B5A47)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* Bouton enregistrer PDF (secondaire — explique l'astuce) */}
      <button
        type="button"
        onClick={doPrint}
        title="Dans la fenêtre d'impression, choisis « Enregistrer en PDF » comme destination."
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "9px 14px",
          background: "var(--paper, #FFFFFF)",
          border: "1px solid rgba(43,31,21,0.12)",
          borderRadius: 10,
          color: "var(--cocoa-soft, #6B5A47)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          minHeight: 38,
          touchAction: "manipulation",
        }}
      >
        <Icon name="file-text" size={15} strokeWidth={1.8} />
        <span className="print-action-pdf-label">Enregistrer PDF</span>
      </button>

      {/* Bouton imprimer (primaire) */}
      <button
        type="button"
        onClick={doPrint}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "9px 16px",
          background:
            "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
          border: "none",
          borderRadius: 10,
          color: "#FFFFFF",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          minHeight: 38,
          boxShadow: "0 4px 12px rgba(197,138,46,0.30)",
          touchAction: "manipulation",
        }}
      >
        <Icon name="printer" size={15} strokeWidth={1.8} />
        Imprimer
      </button>

      {/* Masque le label "Enregistrer PDF" sur très petit écran pour économiser
          de la place — l'icône suffit. Et masque toute la barre à l'impression. */}
      <style jsx>{`
        @media (max-width: 540px) {
          .print-action-pdf-label {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
