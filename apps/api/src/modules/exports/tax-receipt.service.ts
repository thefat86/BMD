/**
 * Service Reçu fiscal — génération PDF officielle (spec §6.3 COMMUNITY).
 *
 * Réservé aux groupes type PARISH / CLUB (associations) avec plan
 * COMMUNITY. Le reçu fiscal est un document légal en France permettant
 * la déduction d'impôts pour les dons. Il doit contenir :
 *
 *   - Identité du donateur (nom, adresse si fournie)
 *   - Identité de l'association bénéficiaire
 *   - Montant du don (chiffres + lettres)
 *   - Date du don
 *   - Article fiscal de référence (200, 238 bis…)
 *   - Forme du don (numéraire / espèces)
 *   - Cadre signature
 *
 * Pour le MVP on génère un reçu pour UN don précis (= une expense de
 * type DON ou un settlement). À étendre ensuite pour les reçus annuels
 * cumulés (somme de tous les dons d'un donateur sur une année fiscale).
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { assertFeatureEnabled } from "../../lib/plan-limits.js";
import { drawGroupLogo } from "../../lib/pdf-logo.js";

const COLOR_INDIGO = rgb(42 / 255, 34 / 255, 68 / 255);
const COLOR_SAFFRON = rgb(232 / 255, 163 / 255, 61 / 255);
const COLOR_TEXT = rgb(30 / 255, 24 / 255, 48 / 255);
const COLOR_MUTED = rgb(100 / 255, 100 / 255, 100 / 255);

/**
 * Génère un PDF de reçu fiscal pour une dépense (don) précise.
 * Permission : admin du groupe + plan COMMUNITY (taxReceipts feature).
 */
export async function generateTaxReceiptPdf(input: {
  expenseId: string;
  actorUserId: string;
}): Promise<Uint8Array> {
  // 1. Permission feature
  await assertFeatureEnabled(input.actorUserId, "taxReceipts");

  // 2. Charge la dépense + groupe + payeur
  const expense = await prisma.expense.findUnique({
    where: { id: input.expenseId },
    include: {
      paidBy: { select: { id: true, displayName: true } },
      group: {
        include: {
          members: {
            where: { userId: input.actorUserId },
            select: { role: true },
          },
        },
      },
    },
  });
  if (!expense) throw Errors.notFound("Dépense introuvable");

  // Permission : actor doit être admin/treasurer du groupe
  const role = expense.group.members[0]?.role;
  if (!role || (role !== "ADMIN" && role !== "TREASURER")) {
    throw Errors.forbidden(
      "Seul un admin ou trésorier du groupe peut générer un reçu fiscal.",
    );
  }

  // Le groupe doit être de type association (PARISH ou CLUB)
  if (expense.group.type !== "PARISH" && expense.group.type !== "CLUB") {
    throw Errors.badRequest(
      "Les reçus fiscaux ne sont disponibles que pour les groupes type Paroisse ou Club (associations).",
    );
  }

  // 3. Numéro de reçu unique : {YYYY}-{groupId4}-{expenseId4}
  const year = new Date(expense.occurredAt).getFullYear();
  const receiptNumber = `${year}-${expense.group.id.slice(0, 4).toUpperCase()}-${expense.id.slice(0, 4).toUpperCase()}`;

  // 4. Génération du PDF
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const MARGIN = 50;
  let y = height - MARGIN;

  // En-tête : bandeau saffron
  page.drawRectangle({
    x: 0,
    y: y + 10,
    width,
    height: 8,
    color: COLOR_SAFFRON,
  });

  // V178.B — Logo BMD (ou custom si plan groupe actif) en haut à gauche.
  await drawGroupLogo({
    pdf,
    page,
    group: expense.group as {
      customLogoUrl?: string | null;
      customLogoActiveUntil?: Date | string | null;
    },
    x: MARGIN,
    y: y - 22,
    fontBold,
    size: 28,
  });

  // Titre principal
  y -= 30;
  const title = "REÇU FISCAL";
  const titleW = fontBold.widthOfTextAtSize(title, 22);
  page.drawText(title, {
    x: (width - titleW) / 2,
    y,
    size: 22,
    font: fontBold,
    color: COLOR_INDIGO,
  });

  y -= 14;
  const subtitle = "(Article 200 du Code Général des Impôts)";
  const subW = fontItalic.widthOfTextAtSize(subtitle, 10);
  page.drawText(subtitle, {
    x: (width - subW) / 2,
    y,
    size: 10,
    font: fontItalic,
    color: COLOR_MUTED,
  });

  // Numéro et date
  y -= 30;
  page.drawText(`N° ${receiptNumber}`, {
    x: MARGIN,
    y,
    size: 11,
    font: fontBold,
    color: COLOR_TEXT,
  });
  const dateStr = `Délivré le ${new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;
  const dateW = fontRegular.widthOfTextAtSize(dateStr, 10);
  page.drawText(dateStr, {
    x: width - MARGIN - dateW,
    y,
    size: 10,
    font: fontRegular,
    color: COLOR_MUTED,
  });

  // Section : Bénéficiaire
  y -= 36;
  page.drawText("BÉNÉFICIAIRE", {
    x: MARGIN,
    y,
    size: 10,
    font: fontBold,
    color: COLOR_SAFFRON,
  });
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: COLOR_MUTED,
  });
  y -= 16;
  page.drawText(`Nom : ${expense.group.name}`, {
    x: MARGIN,
    y,
    size: 11,
    font: fontRegular,
    color: COLOR_TEXT,
  });
  y -= 14;
  page.drawText(
    `Type : ${expense.group.type === "PARISH" ? "Paroisse" : "Club / Association"}`,
    {
      x: MARGIN,
      y,
      size: 11,
      font: fontRegular,
      color: COLOR_TEXT,
    },
  );

  // Section : Donateur
  y -= 30;
  page.drawText("DONATEUR", {
    x: MARGIN,
    y,
    size: 10,
    font: fontBold,
    color: COLOR_SAFFRON,
  });
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: COLOR_MUTED,
  });
  y -= 16;
  page.drawText(`Nom : ${expense.paidBy.displayName}`, {
    x: MARGIN,
    y,
    size: 11,
    font: fontRegular,
    color: COLOR_TEXT,
  });

  // Section : Don
  y -= 30;
  page.drawText("DON", {
    x: MARGIN,
    y,
    size: 10,
    font: fontBold,
    color: COLOR_SAFFRON,
  });
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: COLOR_MUTED,
  });
  y -= 18;

  const amount = parseFloat(expense.amount.toString());
  const amountStr = `${amount.toFixed(2)} ${expense.currency ?? expense.group.defaultCurrency}`;
  page.drawText("Montant : ", {
    x: MARGIN,
    y,
    size: 12,
    font: fontRegular,
    color: COLOR_TEXT,
  });
  page.drawText(amountStr, {
    x: MARGIN + 60,
    y,
    size: 14,
    font: fontBold,
    color: COLOR_INDIGO,
  });

  y -= 16;
  page.drawText(`Soit en lettres : ${numberToFrenchWords(amount)}`, {
    x: MARGIN,
    y,
    size: 10,
    font: fontItalic,
    color: COLOR_MUTED,
  });

  y -= 18;
  page.drawText(
    `Date du don : ${new Date(expense.occurredAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`,
    { x: MARGIN, y, size: 11, font: fontRegular, color: COLOR_TEXT },
  );

  y -= 16;
  page.drawText("Forme du don : Numéraire (virement / espèces)", {
    x: MARGIN,
    y,
    size: 11,
    font: fontRegular,
    color: COLOR_TEXT,
  });

  y -= 16;
  page.drawText(`Objet : ${expense.description}`, {
    x: MARGIN,
    y,
    size: 11,
    font: fontRegular,
    color: COLOR_TEXT,
  });

  // Mentions légales
  y -= 36;
  const legal =
    "Ce reçu vous permet de bénéficier de la réduction d'impôt sur le revenu de 66% du montant " +
    "de votre don (dans la limite de 20% du revenu imposable), conformément à l'article 200 du CGI.";
  drawWrappedText(page, legal, MARGIN, y, width - 2 * MARGIN, 9, fontRegular, COLOR_MUTED, 12);

  // Cadre signature en bas
  y = 130;
  page.drawText(`Fait à ____________________, le ${new Date().toLocaleDateString("fr-FR")}`, {
    x: MARGIN,
    y,
    size: 10,
    font: fontRegular,
    color: COLOR_TEXT,
  });
  y -= 30;
  page.drawText("Signature et tampon de l'association :", {
    x: MARGIN,
    y,
    size: 10,
    font: fontRegular,
    color: COLOR_TEXT,
  });
  // Cadre vide pour la signature manuscrite
  page.drawRectangle({
    x: MARGIN,
    y: y - 60,
    width: 200,
    height: 50,
    borderColor: COLOR_MUTED,
    borderWidth: 0.5,
  });

  // Footer
  const footer = `BMD · L'argent partagé · L'amitié protégée · backmesdo.com — Reçu N° ${receiptNumber}`;
  const footerW = fontItalic.widthOfTextAtSize(footer, 8);
  page.drawText(footer, {
    x: (width - footerW) / 2,
    y: 24,
    size: 8,
    font: fontItalic,
    color: COLOR_MUTED,
  });

  return pdf.save();
}

// ============================================================
// Helpers
// ============================================================

function drawWrappedText(
  page: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: any,
  color: any,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    const testW = font.widthOfTextAtSize(test, size);
    if (testW > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size, font, color });
      currentY -= lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y: currentY, size, font, color });
    currentY -= lineHeight;
  }
  return currentY;
}

/**
 * Conversion d'un nombre en mots français (pour les reçus fiscaux,
 * exigence légale d'avoir le montant en lettres).
 *
 * Implémentation simple jusqu'à 999 999 999. Pour les très grosses sommes
 * on peut étendre ensuite (peu probable pour un don à une asso BMD).
 */
function numberToFrenchWords(n: number): string {
  if (n === 0) return "zéro euros";
  const euros = Math.floor(n);
  const cents = Math.round((n - euros) * 100);
  const eurosWords = intToWordsFr(euros);
  let result = `${eurosWords} euro${euros > 1 ? "s" : ""}`;
  if (cents > 0) {
    result += ` et ${intToWordsFr(cents)} centime${cents > 1 ? "s" : ""}`;
  }
  return result;
}

const UNITS = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
const TEEN = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

function intToWordsFr(n: number): string {
  if (n === 0) return "zéro";
  if (n < 0) return `moins ${intToWordsFr(-n)}`;
  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    return `${intToWordsFr(m)} million${m > 1 ? "s" : ""}${rest ? " " + intToWordsFr(rest) : ""}`;
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    const rest = n % 1000;
    const kWords = k === 1 ? "mille" : `${intToWordsFr(k)} mille`;
    return `${kWords}${rest ? " " + intToWordsFr(rest) : ""}`;
  }
  if (n >= 100) {
    const c = Math.floor(n / 100);
    const rest = n % 100;
    const cWords = c === 1 ? "cent" : `${UNITS[c]} cents`;
    return `${cWords}${rest ? " " + intToWordsFr(rest) : ""}`;
  }
  if (n < 10) return UNITS[n]!;
  if (n < 20) return TEEN[n - 10]!;
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7 || t === 9) {
    return `${TENS[t]}-${TEEN[u]}`;
  }
  if (u === 0) return TENS[t]!;
  if (u === 1 && t < 8) return `${TENS[t]} et un`;
  return `${TENS[t]}-${UNITS[u]}`;
}
