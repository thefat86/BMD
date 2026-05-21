/**
 * V163 — Helper logo unifié pour tous les PDF générés par BMD.
 *
 * Logique :
 *   - Si `group.customLogoUrl` est défini ET `customLogoActiveUntil > now()` :
 *     → on embed l'image (data URL base64 PNG/JPEG/WEBP) dans le PDF.
 *   - Sinon : on dessine le logo BMD par défaut (carré saffron + "B" ivoire).
 *
 * Utilisé par :
 *   - debt-certificate.service.ts (certificat RDD)
 *   - meeting-minutes-pdf.service.ts (compte rendu réunion)
 *   - tax-receipt.service.ts (reçu fiscal)
 *   - exports.service.ts (récap groupe PDF premium)
 *
 * L'appelant fournit la position (x, y) du coin bas-gauche du logo et la
 * largeur souhaitée. La hauteur est calculée pour préserver le ratio de
 * l'image custom (ou fixée à `width` pour le logo BMD carré par défaut).
 *
 * En cas d'échec d'embed (data URL corrompu, format non supporté par
 * pdf-lib), on tombe silencieusement sur le logo BMD par défaut pour ne
 * jamais casser la génération du PDF.
 */

import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

const COLOR_SAFFRON = rgb(197 / 255, 138 / 255, 46 / 255);
const COLOR_IVORY = rgb(251 / 255, 246 / 255, 236 / 255);

export interface CustomLogoGroupContext {
  customLogoUrl?: string | null;
  customLogoActiveUntil?: Date | string | null;
}

/**
 * Vérifie si un groupe a un logo perso valide (URL + abonnement actif).
 */
export function hasActiveCustomLogo(g: CustomLogoGroupContext): boolean {
  if (!g.customLogoUrl) return false;
  if (!g.customLogoActiveUntil) return false;
  const until =
    g.customLogoActiveUntil instanceof Date
      ? g.customLogoActiveUntil
      : new Date(g.customLogoActiveUntil);
  return until.getTime() > Date.now();
}

/**
 * Dessine le logo "par défaut" BMD : carré saffron 28×28 avec "B" ivoire.
 * (Identique à la version dans debt-certificate.service.ts qu'on remplace.)
 */
export function drawBmdLogo(
  page: PDFPage,
  x: number,
  y: number,
  fontBold: PDFFont,
  size: number = 28,
) {
  page.drawRectangle({
    x,
    y,
    width: size,
    height: size,
    color: COLOR_SAFFRON,
  });
  const letter = "B";
  const fontSize = Math.round(size * 0.64);
  const w = fontBold.widthOfTextAtSize(letter, fontSize);
  page.drawText(letter, {
    x: x + (size - w) / 2,
    y: y + size * 0.25,
    size: fontSize,
    font: fontBold,
    color: COLOR_IVORY,
  });
}

/**
 * Dessine le logo approprié (BMD ou custom) pour un groupe donné.
 *
 * @param pdf       Le document PDF (nécessaire pour embedPng/embedJpg)
 * @param page      La page sur laquelle dessiner
 * @param group     Le groupe (avec customLogoUrl + activeUntil)
 * @param x, y      Position du coin bas-gauche
 * @param fontBold  Police pour le fallback BMD
 * @param size      Taille (largeur). Pour custom : largeur fixe, hauteur ratio-preserved.
 *
 * Retourne la hauteur réellement dessinée (utile pour le layout vertical).
 */
export async function drawGroupLogo(opts: {
  pdf: PDFDocument;
  page: PDFPage;
  group: CustomLogoGroupContext;
  x: number;
  y: number;
  fontBold: PDFFont;
  size?: number;
}): Promise<number> {
  const { pdf, page, group, x, y, fontBold } = opts;
  const size = opts.size ?? 28;

  if (!hasActiveCustomLogo(group)) {
    drawBmdLogo(page, x, y, fontBold, size);
    return size;
  }

  // Custom logo actif — on embed l'image. On accepte data URL PNG / JPEG.
  // SVG n'est pas supporté par pdf-lib → fallback BMD.
  try {
    const dataUrl = group.customLogoUrl!;
    if (dataUrl.startsWith("data:image/svg+xml")) {
      // Pas supporté en native pdf-lib. Fallback gracieux.
      drawBmdLogo(page, x, y, fontBold, size);
      return size;
    }
    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) {
      drawBmdLogo(page, x, y, fontBold, size);
      return size;
    }
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));

    let embedded;
    if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
      embedded = await pdf.embedJpg(bytes);
    } else {
      // Default PNG (et WebP qu'on tente en PNG — pdf-lib ne supporte pas
      // WebP nativement, donc on retombe en cas d'échec).
      embedded = await pdf.embedPng(bytes);
    }

    // Préserve le ratio de l'image. Width fixe, height calculée.
    const ratio = embedded.height / embedded.width;
    const drawnWidth = size;
    const drawnHeight = Math.min(size * 1.4, drawnWidth * ratio); // capé pour pas exploser
    page.drawImage(embedded, {
      x,
      y,
      width: drawnWidth,
      height: drawnHeight,
    });
    return drawnHeight;
  } catch {
    // Si embed échoue (image corrompue, format non supporté), fallback BMD.
    drawBmdLogo(page, x, y, fontBold, size);
    return size;
  }
}
